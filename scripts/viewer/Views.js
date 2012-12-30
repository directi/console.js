define(
    ["./LogPageView", "./LogRecordView", "./NavigationControlView"],
    function (LogPageView, LogRecordView, NavigationControlView) {
        return {
            LogRecordView:LogRecordView,
            LogPageView:LogPageView,
            NavigationControlView:NavigationControlView
        }
    });
