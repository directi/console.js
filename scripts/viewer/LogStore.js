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
        addFilter:function (filter) {

        }
    });


    _(LogStore.prototype).extend({
        _reset:function () {
            this.buffer.splice(0, this.buffer.length);
        },
        _next:function () {
            var pSize = this.pageSize,
                cEnd = this.currentPageStart + pSize,
                bSize = this.buffer.length,
                requiresDBFetch = cEnd + pSize > this.buffer.length,
                def = $.Deferred(),
                self = this;

            function computePageStart() {
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

            function computePageStart(newRecordsAdded) {
                var start = self.currentPageStart + newRecordsAdded.length,
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
        _prevFromDB:function () {
            var buffer = this.buffer,
                first = _(buffer).first(),
                startKey = first ? first.get('key') : undefined,
                bufferSize = this.bufferSize,
                pageSize = this.pageSize,
                def = $.Deferred(),
                reject = _.bind(def.reject, def),
                getStore = this.store(),
                process = function (dbRows) {
                    var records;
                    dbRows = _(dbRows).reverse();
                    records = _(dbRows).map(dbToLogRecord);
                    _(buffer).prepend(records);
                    _(buffer).trimTail(bufferSize);

                    var first = _(buffer).first(), newKey;
                    if (first) {
                        newKey = first.get('key');
                        console.log("Prev added " + dbRows.length + " records;");
                        console.log("old start: " + startKey + " new start: " + newKey + " diff: " + (startKey - newKey));
                    } else {
                        console.log("No records");
                    }
                    def.resolve(records);
                };

            getStore.then(function (store) {
                store.getNext('prevunique', pageSize, startKey).then(process, reject);
            }, reject);

            return def.promise();
        },
        _nextFromDB:function () {
            var buffer = this.buffer,
                last = _(buffer).last(),
                startKey = last ? last.get('key') : undefined,
                bufferSize = this.bufferSize,
                pageSize = this.pageSize,
                def = $.Deferred(),
                reject = _.bind(def.reject, def),
                getStore = this.store(),
                process = function (dbRows) {
                    var records;
                    records = _(dbRows).map(dbToLogRecord);
                    _(buffer).append(records);
                    _(buffer).trimHead(bufferSize);

                    var last = _(buffer).last(), newKey;

                    if (last) {
                        newKey = last.get('key');
                        console.log("Next added " + dbRows.length + " records; ");
                        console.log("old last: " + startKey + " new last: " + newKey + " diff: " + (newKey - startKey));
                    } else {
                        console.log("No records");
                    }
                    def.resolve(records);
                };

            getStore.then(function (store) {
                store.getNext('nextunique', pageSize, startKey).then(process, reject);
            }, reject);
            return def.promise();
        }

    });

    return LogStore;
});