define(function () {

    _.mixin({
        Deferred:function () {
            var g = self;
            if (g.dojo !== undefined && dojo.Deferred) return new dojo.Deferred();
            if (g.$ !== undefined && $.Deferred) return $.Deferred();
        },
        toPromise:function (deferred) {
            if (_.isFunction(deferred.promise)) return deferred.promise();
            return deferred.promise;
        },
        DeferredWithTimeout:function (timeout, msg) {
            return _(_.Deferred()).tap(function (dfd) {
                var id = null,
                    clear = function () {
                        clearTimeout(id);
                        id = null;
                    }, onTimeout = function () {
                        if (id !== null) dfd.reject(new Error('timeout on deferred. ' + (msg || '')));
                        clear();
                    };

                id = _.delay(onTimeout, timeout);
                dfd.timeoutAfter = function (newTimeout) {
                    if (id === null) return;
                    clearTimeout(id);
                    id = _.delay(onTimeout, newTimeout);
                    return dfd;
                };
                _.toPromise(dfd).then(clear, clear);
            });
        },
        isFired: function(def){
            if(_.isFunction(def.state)){
                return def.state() !== 'pending';
            }
            return def.fired !== -1;
        },
        assert: function(condition, msg){
            if(!condition) throw new Error(msg);
        },
        between: function(arr, startIndex, endIndex){
            var result = [], len = arr.length;
            endIndex = (endIndex && endIndex < len)?endIndex:len-1;
            startIndex = !startIndex ? 0:startIndex;
            startIndex = startIndex >= len ? len-1 : startIndex;

            for(var i=startIndex; i<=endIndex; i++){
                result.push(arr[i]);
            }
            return result;
        },
        prepend: function (arr, elems){
            elems.unshift(0,0);
            arr.splice.apply(arr, elems);
            elems.splice(0,2);
            return arr;
        },
        append: function (arr, elems){
            elems.unshift(arr.length,0);
            arr.splice.apply(arr, elems);
            elems.splice(0,2);
            return arr;
        },
        trimTail: function (array, finalSize){
            var extraCount =  array.length-finalSize;
            if(extraCount>0) array.splice(array.length-extraCount, extraCount);
            return array;
        },
        trimHead: function (array, finalSize){
            var extraCount =  array.length-finalSize;
            if(extraCount>0) array.splice(0, extraCount);
            return array;
        }

});

});