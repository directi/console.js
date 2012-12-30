define(["./LogRecordView"], function (LogRecordView) {

    var template = "";
    template += "<table>";
    //template += "<thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead>";
    template += "<tbody></tbody>";
    template += "</table>";

    var PageView = Backbone.View.extend({
        initialize:function () {
            this.setElement($(template)[0]);
            this.$el.addClass("log-page");
            this.listenTo(this.collection, "reset", this.render);
        },
        render:function () {
            var tbody = this.$("tbody");
            tbody.empty();
            this.collection.each(function (logLine) {
                var lineView = new LogRecordView({model:logLine});
                tbody.append(lineView.render().el);
            });
            return this;
        }
    });

    return PageView;
});