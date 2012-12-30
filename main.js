var logStore;
require(["scripts/viewer/LogStore", "scripts/viewer/Views"], function(LogStore, Views){
    logStore = new LogStore("console", "logs");
    logStore.prev();
    var visiblePage = logStore.getVisiblePage();
    var pageView = new Views.LogPageView({collection: visiblePage});
    var navigation = new Views.NavigationControlView({model: logStore});
    var header = new Views.HeaderView({model: logStore});
    var container = $("<div></div>").addClass("log-page-container");
    container.append(pageView.render().el);

    $("#console").append(header.render().el);
    $("#console").append(container);
    $("#console").append(navigation.render().el);
});
