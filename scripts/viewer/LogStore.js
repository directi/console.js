define(["../util/OpQueue", "./LogPage", "./LogRecord", "../util/IDB"], function (OpQueue, LogPage, LogRecord, IDB) {
    var FETCH_TIMEOUT = 5 * 1000,
        SCROLL_INTERVAL = 2 * 1000,
        schemaVersion = 1;

    function createSchema(storeName, vChangeEv) {
        var database = vChangeEv.result || (vChangeEv.target && vChangeEv.target.result);
        database.createObjectStore(storeName);
    }

    function dbToLogRecord(row) {
        return new LogRecord({
            key:row.key,
            msg:row.value.msg,
            time:row.value.time,
            level:row.value.level
        });
    }

    function isPageChanged(page, newFirstRecord, newLastRecord) {
        var oldFirst = page.first(),
            oldLast = page.last();

        if (!oldFirst && !newFirstRecord) return false;
        if ((!oldFirst && newFirstRecord) || (oldFirst && !newFirstRecord)) return true;
        return oldFirst.get('key') !== newFirstRecord.get('key') || oldLast.get('key') !== newLastRecord.get('key');
    }

    function allFiltersAllow(filterFns, entry){
        return !_(filterFns||[]).any(function(allow){
            return !allow(entry);
        });
    }

    function LogStore(dbName, storeName) {
        this.dbName = dbName;
        this.storeName = storeName;
        this.pageSize = 100;
        this.bufferSize = 1000;
        this.buffer = [];
        this.currentPageStart = 0;
        this._opQueue = new OpQueue(FETCH_TIMEOUT);
        this._db = IDB.getDatabase(dbName, schemaVersion, _.bind(createSchema, this, storeName));
        this._store = null;
        this._filters = null;
        this.page = new LogPage();
    }

    _(LogStore.prototype).extend({
        store:function () {
            var def = $.Deferred();
            if (this._store) {
                def.resolve(this._store);
            } else {
                this._db.getStore(this.storeName).then(_.bind(function (store) {
                    this._store = store;
                    def.resolve(store);
                }, this), _.bind(def.reject, def));
            }
            return def.promise();
        },
        getVisiblePage:function () {
            return this.page;
        },
        currentPageRecords:function () {
            return _(this.buffer).between(this.currentPageStart, this.currentPageStart + this.pageSize - 1);
        },
        next:function () {
            var doNext = _.bind(this._next, this),
                self = this,
                page = this.page;

            return this._opQueue.push(doNext).then(function () {
                var lines = self.currentPageRecords();
                isPageChanged(page, _(lines).first(), _(lines).last()) && page.reset(lines);
                return lines;
            });
        },
        prev:function () {
            var doPrev = _.bind(this._prev, this),
                self = this,
                page = this.page;

            return this._opQueue.push(doPrev).then(function () {
                var lines = self.currentPageRecords();
                isPageChanged(page, _(lines).first(), _(lines).last()) && page.reset(lines);
                return lines;
            });
        },
        stickToEnd:function (enable) {
            if (enable && this._scrollInterval) return;
            if (!enable && !this._scrollInterval) return;

            if (enable) {
                this._scrollInterval = setInterval(_.bind(this.next, this), SCROLL_INTERVAL);
                this.next();
            } else {
                clearInterval(this._scrollInterval);
                this._scrollInterval = null;
            }
        },
        addFilter:function (fn) {
            this._filters = _(this._filters).union([fn]);
            this._onFilterChange();
        },
        removeFilter: function(fn){
            this._filters = _(this._filters).without(fn);
            this._onFilterChange();
        },
        resetFilters: function(){
            this._filters = [];
            this._onFilterChange();
        },
        filterLevels: function(arr){
            this.removeFilter(this._levelFilter);
            this._levelFilter = function(entry){
                return _(arr).contains(entry.value.level);
            };
            this.addFilter(this._levelFilter);
        },
        filterRegEx: function(pattern){
            if(this._prevFilterPattern === pattern){
                return;
            }
            this._prevFilterPattern = pattern;
            this.removeFilter(this._regExFilter);
            var re = new RegExp(pattern, "i");
            this._regExFilter = function(entry){
                return re.test(entry.value.msg);
            };
            this.addFilter(this._regExFilter);
        }
    });


    _(LogStore.prototype).extend({
        _onFilterChange: function(){
            this._reset();
            this.prev();
        },
        _reset:function () {
            this.buffer.splice(0, this.buffer.length);
            this.page.reset([]);
            this.currentPageStart = 0;
        },
        _next:function () {
            var pSize = this.pageSize,
                cEnd = this.currentPageStart + pSize,
                bSize = this.buffer.length,
                requiresDBFetch = cEnd + pSize > this.buffer.length,
                def = $.Deferred(),
                self = this;

            function computePageStart(change) {
                self.currentPageStart = (cEnd + pSize < bSize) ? (cEnd + pSize) : ((bSize - pSize) > 0 ? (bSize - pSize) : 0);
                def.resolve(self.currentPageStart);
            }

            if (requiresDBFetch) {
                this._nextFromDB().then(computePageStart);
            } else {
                computePageStart();
            }
            return def.promise();
        },
        _prev:function () {
            var pageSize = this.pageSize,
                requiresDBFetch = this.currentPageStart - pageSize < 0,
                def = $.Deferred(),
                self = this;

            function computePageStart(change) {
                var start = self.currentPageStart + change.added,
                    newStart = start - pageSize;

                if (newStart < 0) newStart = 0;
                self.currentPageStart = newStart;
                def.resolve(newStart);
            }

            if (requiresDBFetch) {
                this._prevFromDB().then(computePageStart);
            } else {
                computePageStart([]);
            }
            return def.promise();
        },
        _fetchFromDB: function(direction){
            var buffer = this.buffer,
                bufferSize = this.bufferSize,
                pageSize = this.pageSize,
                def = $.Deferred(),
                reject = _.bind(def.reject, def),
                resolve = _.bind(def.resolve, def),
                getStore = this.store(),
                filter = _.bind(allFiltersAllow, this, this._filters),
                addToFront = function(records){
                    records = _(records).reverse();
                    _(buffer).prepend(records);
                    _(buffer).trimTail(bufferSize);
                },
                addToTail = function(records){
                    _(buffer).append(records);
                    _(buffer).trimHead(bufferSize);
                },
                cntBeforeFilter=0,
                cntAfterFilter= 0,
                isBackward = direction.indexOf('prev') === 0,
                getStartKey = function(){
                    var record = isBackward?_(buffer).first():_(buffer).last();
                    return record?record.get('key'):undefined;
                },
                process = function (dbRows) {
                    var records,
                        isLastPage = _(dbRows).size() < pageSize,
                        lastFetchedKey = isLastPage?undefined:_(dbRows).last().key;
                    cntBeforeFilter += _(dbRows).size();
                    dbRows = _(dbRows).filter(filter);
                    cntAfterFilter += _(dbRows).size();
                    records = _(dbRows).map(dbToLogRecord);
                    isBackward?addToFront(records):addToTail(records);
                    console.log("Fetch: " + direction + ", retrieved: " + cntBeforeFilter + " added: " + cntAfterFilter);
                    if(cntAfterFilter >= pageSize || isLastPage) {
                        resolve({retrieved: cntBeforeFilter, added: cntAfterFilter});
                        return;
                    }
                    fetch(lastFetchedKey);
                },
                fetch = function(startKey){
                    getStore.then(function (store) {
                        store.getNext(direction, pageSize, startKey).then(process, reject);
                    }, reject);
                };
            fetch(getStartKey());
            return def.promise();
        },
        _prevFromDB:function () {
            return this._fetchFromDB('prevunique');
        },
        _nextFromDB:function () {
            return this._fetchFromDB('nextunique');
        }

    });

    return LogStore;
});