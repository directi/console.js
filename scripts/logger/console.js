define(["./IDBLogger"], function(IDBLogger){
    IDBLogger.setup();
    IDBLogger.getLayer().enableAll();
    IDBLogger.getStore().then(function(store){

        var d = new Date().valueOf(),
            oneDayMs = 24 * 60 * 60 * 1000,
            yesterday = d - oneDayMs;

        store.deleteRange(yesterday);
    });
});