define([], function () {
    return Backbone.View.extend({
        initialize:function () {
            this.isStickToEnd = false;
        },

        events: {
            "click .button": "changeSelection",
            "click .prev": "prev",
            "click .next": "next",
            "click .stickToEnd": "toggleStickToEnd"
        },

        render:function () {
            this.$el.addClass("navigation");

            var prev = $("<div></div>").text('\u21e6').addClass('button prev'),
                next = $("<div></div>").text('\u21e8').addClass('button next'),
                stickToEnd = $("<div></div>").text('End').addClass('button stickToEnd');

            this.$el.append(prev);
            this.$el.append(next);
            this.$el.append(stickToEnd);
            return this;
        },

        changeSelection: function(e){
            this.$(".button").removeClass('selected');
            $(e.target).addClass('selected');
        },

        prev: function(){
            this.dontStickToEnd();
            this.model.prev();
        },

        next: function(){
            this.dontStickToEnd();
            this.model.next();
        },

        toggleStickToEnd: function(){
            if(this.isStickToEnd) {
                this.dontStickToEnd();
            }else{
                this.isStickToEnd = true;
                this.model.stickToEnd(true);
            }
        },
        dontStickToEnd: function(){
            this.isStickToEnd = false;
            this.model.stickToEnd(false);
            this.$(".button").removeClass('selected');
        }
    });
});