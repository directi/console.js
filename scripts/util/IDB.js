define(["./util"], function () {
    var g = self.dojo?self.dojo.global:self;
    // In the following line, you should include the prefixes of implementations you want to test.
    var indexedDB = g.indexedDB || g.mozIndexedDB || g.webkitIndexedDB || g.msIndexedDB;
    var IDBTransaction = g.IDBTransaction || g.webkitIDBTransaction || g.msIDBTransaction;
    var IDBKeyRange = g.IDBKeyRange || g.webkitIDBKeyRange || g.msIDBKeyRange;
    // (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

    // Check if the database.setVersion api has been deprecated
    var isNewVersionAPI = !!_.isFunction(indexedDB.deleteDatabase);
    var errors = ["onabort", "ontimeout", "onblocked", "onerror"],
        TRANSACTION = {
            READ_ONLY:"readonly",
            READ_WRITE:"readwrite"
        };

    var TIMEOUT = 60*1000;
    function rejectDeferred(type, def, event) {
        console.error("DB error ", type, event);
        if (def && !_.isFired(def)) {
            def.reject(event);
        }
    }

    function defer(/*DBRequest||Transaction*/ request) {
        var def = _.Deferred(),
            isTransaction = _.isFunction(request.abort),
            callback = _.once(function () {
                if (!_.isFired(def)) def.resolve.apply(def, arguments);
            });

        _(errors).each(function (error) {
            request[error] = _.bind(rejectDeferred, request, error, def);
        });
        request[isTransaction ? "oncomplete" : "onsuccess"] = callback;
        def._request = request;
        return def;
    }

    function Database(name, version, schemaCreator) {
        this.name = name;
        this.version = version || 0;
        this.schemaCreator = schemaCreator;
    }

    function Store(/*Database*/db, storeName) {
        this.name = storeName;
        var ops = ["put", "get", "remove", "clear", "getAll", "getNext", "deleteRange"];
        _(ops).each(function (op) {
            this[op] = _.bind(db[op], db, storeName);
        }, this);
    }


    function hasObjectStore(idbDatabase, storeName) {
        return _(idbDatabase.objectStoreNames).contains(storeName);
    }

    Database.prototype._ensureLatestSchema = function () {
        if(this._waitForVersionChange && !_.isFired(this._waitForVersionChange)){
            return _.toPromise(this._waitForVersionChange);
        }

        var deferred = _.DeferredWithTimeout(TIMEOUT, "Timeout: open database " + this.name);

        if(this._idbDatabse && this._idbDatabse.version === this.version){
            deferred.resolve(this._idbDatabse);
            return _.toPromise(deferred);
        }

        this._waitForVersionChange = deferred;

        var request, idbDatabase, self=this,
            createSchemaCallback = _.bind(this.schemaCreator, this),
            useDatabaseCallback = function (e) {
                idbDatabase = request.result || e.result || (e.target && e.target.result);
                self._idbDatabse = idbDatabase;
                !_.isFired(deferred) && deferred.resolve(idbDatabase);
            },
            errorCallback = function (e) {
                !_.isFired(deferred) && deferred.reject(e);
            },
            blockedCallback = function (e) {
                idbDatabase = request.result || e.result || (e.target && e.target.result);
                self._idbDatabse = idbDatabase;
                console.warn("versionchange blocked", e);
            };

        request = indexedDB.open(this.name, this.version);
        request.onupgradeneeded = createSchemaCallback;
        request.onblocked = blockedCallback;
        //Fired when version Change is not required
        request.onsuccess = useDatabaseCallback;
        //Fired when version change completed Successfully
        request.oncomplete = useDatabaseCallback;
        request.onerror = errorCallback;

        return _.toPromise(deferred);
    };

    Database.prototype.getStore = function (storeName) {
        var def = _.Deferred();
        this._ensureLatestSchema().then(_.bind(function (idbDatabase) {
            if (!hasObjectStore(idbDatabase, storeName)) {
                throw Error("Unknown Object Store: " + storeName);
            }
            def.resolve(new Store(this, storeName));
        }, this), _.bind(def.reject, def));
        return _.toPromise(def);
    };

    Database.prototype.get = function (storeName, key) {
        var def = _.Deferred();
        this._ensureLatestSchema().then(function(idbDatabase){
            var txn, store, dbRequest, promise;
            txn = idbDatabase.transaction(storeName, TRANSACTION.READ_ONLY);
            store = txn.objectStore(storeName);
            promise = _.toPromise(defer(dbRequest = store.get(key)));
            promise.then(function (event) {
                var resultValue = dbRequest.result || event.result;
                def.resolve(resultValue);
            }, _.bind(def.reject, def));
        });
        return _.toPromise(def);
    };

    Database.prototype.getAll = function (storeName) {
        return this.getNext(storeName, 'next', Number.MAX_VALUE);
    };

    Database.prototype._getCursor = function(storeName, direction){
        var def = _.Deferred();
        this._ensureLatestSchema().then(function(idbDatabase){
            var txn, store, cursorRequest;
            txn = idbDatabase.transaction(storeName, TRANSACTION.READ_ONLY);
            store = txn.objectStore(storeName);
            cursorRequest = store.openCursor(null, direction||'next');
            def.resolve(cursorRequest);
        }, _.bind(def.reject, def));
        return _.toPromise(def);
    };

    Database.prototype.getNext = function(storeName, direction, count, fromKey){
        var result = [],
            def = _.Deferred(),
            required = count,
            seekToKey = fromKey,
            skipNextResult = false;

        this._getCursor(storeName, direction).then(function(cursorRequest){
            cursorRequest.onerror = function(e){console.error('Unable to move cursor', e); def.reject(false);};
            cursorRequest.onsuccess = function(event){
                var cursor = cursorRequest.result || event.result || event.target.result;
                if(!cursor) {
                    def.resolve(result);
                    return;
                }
                if(seekToKey){
                    cursor.continue(seekToKey);
                    seekToKey=0;
                    skipNextResult = true;
                    return;
                }
                if(!skipNextResult) {
                    result.push({key: cursor.key, value: cursor.value});
                    required--;
                }
                if(required > 0){
                    skipNextResult = false;
                    cursor.continue();
                }else{
                    def.resolve(result);
                }
            }
        });
        return _.toPromise(def);
    };

    Database.prototype._unitOp = function (storeName, /*put||remove||clear//delete*/operation, args) {
        var def = _.Deferred();
        this._ensureLatestSchema().then(function (idbDatabase) {
            var txn, store, promise;
            txn = idbDatabase.transaction(storeName, TRANSACTION.READ_WRITE);
            promise = _.toPromise(defer(txn));
            store = txn.objectStore(storeName);
            store[operation].apply(store, args);
            promise.then(function(e){
                def.resolve(e);
            }, _.bind(def.reject, def));
        });
        return _.toPromise(def);
    };
    Database.prototype.put = function (storeName, key, value) {
        return this._unitOp(storeName, "put", [value, key]);
    };
    Database.prototype.remove = function (storeName, key) {
        return this._unitOp(storeName, "delete", [key]);
    };
    Database.prototype.clear = function (storeName) {
        return this._unitOp(storeName, "clear", []);
    };
    Database.prototype.deleteRange = function (storeName, upperBound, lowerBound) {
        var range;
        _.assert(!(upperBound === undefined && lowerBound === undefined), "Invalid usage of deleteRange");
        if (lowerBound !== undefined && upperBound !== undefined) range = IDBKeyRange.bound(lowerBound, upperBound, false, true);
        if (upperBound !== undefined && !range) range = IDBKeyRange.upperBound(upperBound, true);
        if (lowerBound !== undefined && !range) range = IDBKeyRange.lowerBound(lowerBound, false);

        return this._unitOp(storeName, "delete", [range]);
    };

    return {
        getDatabase:function (dbName, version, schemaCreator) {
            if (!indexedDB || !isNewVersionAPI) {
                throw new Error("IndexedDB Not available!");
            }
            return new Database(dbName, version, schemaCreator);
        }
    };
});
