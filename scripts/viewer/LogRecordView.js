define([], function () {
    return Backbone.View.extend({
        tagName:'tr',
        render:function () {
            var l = this.model.get('level'),
                time = $("<td></td>").text(new Date(this.model.get('time')).toLocaleTimeString()).addClass('time'),
                level = $("<td></td>").text(' ').addClass('level'),
                msg = $("<td></td>").text(this.model.get('msg')).addClass('message');

            this.$el.addClass("log-line " + l);
            this.$el.append(level);
            this.$el.append(time);
            this.$el.append(msg);
            return this;
        }
    });
});