define([], function(){

    var allLogLevels = ['error','warn','info','log','debug'],
        layers = [],
        oldConsoleFns = {},
        console = self.console || {};

    console.logLayer = {};

    function log(){
        var args = _.toArray(arguments),
            rejected = false,
            level;

        _(layers).each(function(layer){
            var level = args[0], retValue;
            if(rejected) return;
            if(layer.canLogLevel(level) && layer.shouldLog(args)){
                retValue = layer.logfn.apply(console,args);
            }
            rejected = !layer.passThrough();
            args = retValue || args;
        });
        if(!rejected){
            level = args.shift();
            oldConsoleFns[level].apply(console, args);
        }
    }

    function setupLogger(){
        // Fixing console methods to be proper ECMAScript Function's for IE9 (So they have apply method)
        // Using native bind implementation as _.bind try to use the
        // non-existant apply method on console methods.
        // Also, note that console object is available only after opening F12 Dev Tools

        // Fix inspired by http://whattheheadsaid.com/2011/04/internet-explorer-9s-problematic-console-object

        if (typeof console.log == "object") {
            _(allLogLevels).each(function (type) {
                var method = console[type];
                console[type] = function() {
                    return Function.prototype.apply.call(method, console, arguments);
                }
            });
        }

        _(allLogLevels).each(function(type){
            var old = console[type] || _.identity;
            oldConsoleFns[type] = _.bind(old, console);
            console[type] = _.bind(log, console, type);
        });
    }

    setupLogger();

    function positionLayer(layer){
        if(layer.keepAtTheTop) layers.splice(0,0,layer);
        else layers.push(layer);
        console.logLayer[this.name] = this;
    }

    function LogLayer(name, logfn, /*boolean*/ keepAtTheTop){
        ////////////////////////////////////////////////////////////////////////////////////////////////////////
        // logfn:
        //      This function will be passed the type of logging as the first argument (error, warn, info,...)
        //      The rest of the arguments will be as passed to console.log (or such method corresponding to type of log)
        //
        //      This function may return an array that is passed to the lower level log layer, as the arguments array.
        //      (So the first element in the array should be type).
        //
        //      If the function returns nothing (undefined), the same arguments passed to this function will be
        //      passed to lower level log layer.
        //
        // keepAtTheTop:
        //      Keeps this layer as the top most one even if there are other layers added after this.
        //      If there are multiple layers marked as 'keepAtTheTop' they are stacked up in the order in which
        //      they are added and other non 'keepAtTheTop' layers appear below these layers in the order they are
        //      added/created.
        ////////////////////////////////////////////////////////////////////////////////////////////////////

        this.name = name;
        this.filters = [];
        this.logfn = logfn;
        this._passThrough = true;
        this.keepAtTheTop = keepAtTheTop || false;
        this._enabledLevel = {
            debug: false,
            info: false,
            warn: false,
            error: false,
            log: false
        };
        positionLayer(this);
    }

    LogLayer.prototype.canLogLevel = function(logLevel){
        return !!this._enabledLevel[logLevel];
    };

    LogLayer.prototype.enable = function(logLevels){
        logLevels = _.isArray(logLevels)?logLevels:logLevels.split(",");
        _(logLevels).each(function(logLevel){
            this._enabledLevel[logLevel]=true;
        }, this);
    };

    LogLayer.prototype.disable = function(logLevels){
        logLevels = _.isArray(logLevels)?logLevels:logLevels.split(",");
        _(logLevels).each(function(logLevel){
            this._enabledLevel[logLevel]=false;
        }, this);
    };

    LogLayer.prototype.enableAll = function(){
        this.enable(allLogLevels);
    };

    LogLayer.prototype.disableAll = function(){
        this.disable(allLogLevels);
    };

    LogLayer.prototype.passThrough = function(enabled){
        if(undefined !== enabled){
            this._passThrough = !!enabled;
        }
        return this._passThrough;
    };
    /**************************************************
     * Only log lines that match this regular expression are given to this log layer's log function.
     *
     * Primarily expected to be used during debugging, to avoid noise in the console.
     *
     * @param regex
     */
    LogLayer.prototype.addFilter = function(regex){
        this.filters.push(regex);
    };

    LogLayer.prototype.shouldLog = function(logArgs){
        return !this.filters.length || _(this.filters).any(function(regex){
            return _(logArgs).any(function(logPart){
                var strRepresentation = "" + (logPart.toString?logPart.toString():logPart);
                return !!strRepresentation.match(regex);
            });
        });
    };

    return LogLayer;
});
