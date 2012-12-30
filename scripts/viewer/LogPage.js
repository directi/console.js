define(["./LogRecord"], function(LogRecord){
    return Backbone.Collection.extend({
        model: LogRecord
    })
});
