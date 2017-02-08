'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _proxyLists = require('proxy-lists');

var _proxyLists2 = _interopRequireDefault(_proxyLists);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _rules = require('./rules.json');

var _rules2 = _interopRequireDefault(_rules);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require('events').EventEmitter.prototype._maxListeners = 1000;

var settings = {
    maxConcurrentRequests: 100,
    minProxies: 10,
    timeout: 8000
};

var options = {
    anonymityLevels: null,
    protocols: ['http', 'https']
};

var ProxyBroker = function () {
    function ProxyBroker(judge) {
        var _this = this;

        _classCallCheck(this, ProxyBroker);

        this.judge = judge;
        this.concurrentRequests = 0;
        this.proxyPool = [];
        this.fastPool = [];
        this.jailPool = [];
        this.foundProxies = 0;
        this.checkingQueue = [];

        this.fetchProxies();

        setInterval(function () {
            console.log(_this.fastPool.length + '/' + _this.proxyPool.length + '/' + _this.jailPool.length + '/' + _this.checkingQueue.length);
            for (var i = 0; i < settings.maxConcurrentRequests - _this.concurrentRequests; i++) {
                _this.checkProxyFromQueue();
            }
            // console.log(this.fastPool.map((p) => this.getProxyUrl(p)))
            // console.log(this.proxyPool.map((p) => this.getProxyUrl(p)))
        }, 5000);
        setInterval(function () {
            _this.checkBannedProxies();
        }, 1000);
    }

    _createClass(ProxyBroker, [{
        key: 'fetchProxies',
        value: function fetchProxies() {
            var _this2 = this;

            _proxyLists2.default.getProxies(options).on('data', this.checkProxies.bind(this)).on('error', function (err) {
                // console.log('proxylists', err)
            }).once('end', function () {
                console.log('done returning in 3600s');
                setTimeout(function () {
                    _this2.fetchProxies();
                }, 3600000);
            });
        }
    }, {
        key: 'checkProxies',
        value: function checkProxies(proxies) {
            var _this3 = this;

            // const total = this.checkingQueue.length + this.fastPool.length + this.proxyPool.length
            // if (total > 100000) {
            //     this.dereferenceProxylists()
            // }
            this.foundProxies += proxies.length;
            proxies.forEach(function (proxy) {
                var proxyUrl = _this3.getProxyUrl(proxy);
                if (_this3.proxyPool.indexOf(proxyUrl) == -1 && _this3.fastPool.indexOf(proxyUrl) == -1 && _this3.checkingQueue.indexOf(proxyUrl) == -1) _this3.checkingQueue.push(proxyUrl);
            });
        }
    }, {
        key: 'checkResponse',
        value: function checkResponse(targetUrl, proxy, err, resp, body) {
            var domainRules = _rules2.default[_url2.default.parse(targetUrl).host] || _rules2.default['default'];
            // check error
            if (err) {
                return 'request error';
            }
            if (resp === undefined) {
                return 'response is undefined';
            }

            // check status code
            if (domainRules.statusCode.indexOf(resp.statusCode) == -1) {
                return 'no status code match';
            }

            // check body
            if (domainRules.body !== undefined && domainRules.body.length > 0) {
                var hasMatch = domainRules.body.map(function (p) {
                    if (body.match(p)) return true;
                }).indexOf(true) != -1;
                if (!hasMatch) {
                    return 'no body match';
                }
            }

            this.maybeAddProxy(proxy, resp.elapsedTime);

            return true;
        }
    }, {
        key: 'makeRequest',
        value: function makeRequest(targetUrl, proxy, query) {
            var _this4 = this;

            return new Promise(function (resolve, reject) {
                _this4.concurrentRequests += 1;
                (0, _request2.default)({
                    qs: query,
                    url: targetUrl,
                    proxy: proxy,
                    timeout: settings.timeout,
                    time: true,
                    agent: false
                    // pool: {
                    //     maxSockets: Infinity
                    // }
                }, function (err, resp, body) {
                    _this4.concurrentRequests -= 1;
                    var results = _this4.checkResponse(targetUrl, proxy, err, resp, body);
                    if (results === true) resolve(resp, body);else reject(results);
                }).on('error', function (err) {
                    _this4.concurrentRequests -= 1;
                    reject('general error');
                });
            });
        }
    }, {
        key: 'checkProxyFromQueue',
        value: function checkProxyFromQueue() {
            if (this.concurrentRequests >= settings.maxConcurrentRequests) {
                return;
            }
            var proxy = this.checkingQueue.shift();
            if (proxy === undefined) return;

            this.makeRequest(this.judge, proxy).then(function () {}, function (err) {});
        }
    }, {
        key: 'checkBannedProxies',
        value: function checkBannedProxies() {
            var _this5 = this;

            this.jailPool = this.jailPool.filter(function (elem) {
                var now = new Date().getTime();
                if (now - elem.time < elem.banTime) {
                    return true;
                } else {
                    var elapsedTime = 0 ? elem.pool == 'fast' : undefined;
                    _this5.maybeAddProxy(elem.proxy, elapsedTime);
                }
            });
        }
    }, {
        key: 'maybeAddProxy',
        value: function maybeAddProxy(proxy, elapsedTime) {
            var inProxyPool = this.proxyPool.indexOf(proxy) !== -1;
            if (elapsedTime !== undefined) {
                var inFastPool = this.fastPool.indexOf(proxy) !== -1;
                if (elapsedTime < 2500 && !inFastPool) {
                    this.fastPool.push(proxy);
                    if (inProxyPool) this.proxyPool.splice(this.proxyPool.indexOf(proxy), 1);
                } else {
                    if (inFastPool) {
                        this.fastPool.splice(this.fastPool.indexOf(proxy), 1);
                    }
                    if (!inProxyPool) this.proxyPool.push(proxy);
                }
            } else {
                if (!inProxyPool) this.proxyPool.push(proxy);
            }
        }
    }, {
        key: 'getProxy',
        value: function getProxy() {
            var proxy = void 0;
            var i = void 0;
            if (this.fastPool.length > 20) {
                i = Math.floor(Math.random() * this.fastPool.length);
                proxy = this.fastPool[i];
            } else {
                i = Math.floor(Math.random() * this.proxyPool.length);
                proxy = this.proxyPool[i];
            }

            return proxy;
        }
    }, {
        key: 'banProxy',
        value: function banProxy(proxy, banTime, pool) {
            if (proxy === undefined) return;

            banTime = banTime || 120000;

            var proxyIdx = this.proxyPool.indexOf(proxy);
            var fastPoolIdx = this.fastPool.indexOf(proxy);
            var inProxyPool = proxyIdx !== -1;
            var inFastPool = fastPoolIdx !== -1;

            if (inProxyPool) this.proxyPool.splice(proxyIdx, 1);

            if (inFastPool) {
                this.fastPool.splice(fastPoolIdx, 1);
            }

            this.jailPool.push({ proxy: proxy, time: new Date().getTime(), banTime: banTime, pool: pool });
        }
    }, {
        key: 'getProxyUrl',
        value: function getProxyUrl(proxy) {
            return proxy.protocols[0] + '://' + proxy.ipAddress + ':' + proxy.port;
        }
    }, {
        key: 'getPage',
        value: function getPage(targetUrl, query, tries) {
            var _this6 = this;

            tries = tries || 0;
            var proxy = this.getProxy();
            if (!proxy) {
                setTimeout(function () {
                    console.log('no proxies found waiting 5s');
                    _this6.getPage(targetUrl, query, tries);
                }, 5000);
            }

            console.log('Getting ' + targetUrl + ' (try ' + (tries + 1) + ')');

            return new Promise(function (resolve, reject) {

                var retryPage = function retryPage() {
                    _this6.banProxy(proxy);

                    if (tries < 10) {
                        _this6.getPage(targetUrl, query, tries + 1).then(function (resp) {
                            resolve(resp);
                        }, function () {
                            reject();
                        });
                    } else {
                        reject();
                    }
                };

                _this6.makeRequest(targetUrl, proxy, query).then(function (resp, body) {
                    resolve(resp);
                }, function (err) {
                    console.error('bla', err);
                    retryPage();
                });
            });
        }
    }]);

    return ProxyBroker;
}();

exports.default = ProxyBroker;