define([], function () {

    function OpQueue(timeOut) {
        var arr = [], current = null, opCount = 0;

        function exec() {
            console.log("Starting operation: " + current.opId);
            var result = current.fn(),
                isPromise = _.isFunction(result.then);

            function complete(value) {
                if (!current) return; //Could be timed out
                try {
                    current.resolve(value);
                } catch (e) {
                    console.error("Failed operation", e);
                }
                console.log("Finished operation: " + current.opId);
                current = null;
                execNext();
            }

            function fail(value) {
                if (!current) return; //Could be timed out
                try {
                    current.reject(value);
                } catch (e) {
                    console.error("Failed operation/reject", e);
                }
                console.log("Finished operation (fail): " + current.opId);
                current = null;
                execNext();
            }

            function monitorTime() {
                var checkOperation = _.bind(function (operationAtTimerStart) {
                    if (operationAtTimerStart === current) fail(new Error('Timeout'));
                }, this, current);
                _.delay(checkOperation, timeOut);
            }

            if (isPromise) {
                result.then(complete, fail);
                timeOut && monitorTime();
            } else {
                complete(result);
            }
        }

        function execNext() {
            if (current || arr.length === 0) return;
            current = arr.shift();
            _.delay(exec, 1);
        }

        this.push = function (fn) {
            var def = $.Deferred();
            def.fn = fn;
            def.opId = opCount++;
            arr.push(def);
            execNext();
            return def.promise();
        }
    }

    return OpQueue;
});
