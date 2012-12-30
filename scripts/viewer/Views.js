define(
    ["./LogPageView", "./LogRecordView", "./NavigationControlView", "./HeaderView"],
    function (LogPageView, LogRecordView, NavigationControlView, HeaderView) {
        return {
            LogRecordView:LogRecordView,
            LogPageView:LogPageView,
            NavigationControlView:NavigationControlView,
            HeaderView: HeaderView
        }
    });
