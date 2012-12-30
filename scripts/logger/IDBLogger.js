define(["./LogLayer", "../util/IDB"], function (LogLayer, IDB) {
    var dbName = "console",
        storeName = "logs",
        layer = null,
        lastKey,
        lastErrorKey = 0,
        SILENCE_TIME_ON_ERROR = 10000,
        schemaVersion = 1;

    function serialize(obj){
        return ((obj && _.isFunction(obj.toString)) ? obj.toString() : obj) + "";
    }

    function createSchema(versionChangeEvent){
        var database = versionChangeEvent.result || (versionChangeEvent.target && versionChangeEvent.target.result);
        console.log("Schema Version: old " + versionChangeEvent.oldVersion + " new: " + versionChangeEvent.newVersion);
        database.createObjectStore(storeName);
    }

    function log() {
        var parts = _(arguments).map(serialize),
            level = parts.shift(),
            timeStamp =new Date().valueOf(),
            key = timeStamp,
            msg = parts.join(" ");

        if (lastKey >= key) {
            key = ++lastKey;
        }

        // Infinite loop breaker
        //
        // The kernel.db also uses console. If writing a log message fails, we may have an infinite
        // loop.
        // As write to DB, DB error call-back are both asynchronous we cannot determine if the
        // log message caused infinite loop.
        // So if a put of log message fails

        if (key < lastErrorKey + SILENCE_TIME_ON_ERROR) return;

        configureStore().then(function (store) {
            return store.put(key, {
                time: timeStamp,
                msg: msg,
                level: level
            });
        }).then(_.identity, function () {
                if (lastErrorKey < key) lastErrorKey = key;
            });

    }

    function configureStore() {
        var database = IDB.getDatabase(dbName, schemaVersion, createSchema);
        return database.getStore(storeName);
    }

    function addAsLayer() {
        if (layer) return layer;
        layer = new LogLayer("IDB", log, true);
        layer.clear = function () {
            configureStore().then(function (store) {
                store.clear();
            });
        };
        layer.deleteUpto = function (timestamp) {
            configureStore().then(function (store) {
                store.deleteRange(timestamp);
            });
        };
    }

    return {
        setup:function (db_name, store_name) {
            dbName = db_name || dbName;
            storeName = store_name || storeName;
            configureStore();
            addAsLayer();
            return layer;
        },
        getStore: function(){
            return configureStore();
        },
        getLayer: function(){
            return layer;
        }
    }
});