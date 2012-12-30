define([], function () {
    return Backbone.View.extend({
        render: function(){
            var logStore = this.model,
                dbName = $("<span></span>").text(logStore.dbName),
                separator = $("<span></span>").text("/"),
                storeName = $("<span></span>").text(logStore.storeName),
                label = $("<div></div>").append(dbName).append(separator).append(storeName).addClass('entry');

            this.$el.html(label).addClass("header");
            return this;
        }
    });
});
