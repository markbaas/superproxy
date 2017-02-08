#!/usr/bin/env node
'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _commander = require('commander');

var _commander2 = _interopRequireDefault(_commander);

var _proxybroker = require('./proxybroker');

var _proxybroker2 = _interopRequireDefault(_proxybroker);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

process.env.UV_THREADPOOL_SIZE = 1024;

_commander2.default.version('0.0.1').option('-t, --target [target]', 'Target site [http://www.google.com]', 'http://www.google.com').parse(process.argv);

console.log('Starting proxybroker targeting ' + _commander2.default.target);
var proxybroker = new _proxybroker2.default(_commander2.default.target);
var app = (0, _express2.default)();

app.use('/', function (req, res) {
    proxybroker.getPage(req.url).then(function (resp) {
        res.set(resp.headers);
        res.status(resp.statusCode);
        res.send(resp.body);
        res.end();
    }, function () {
        res.status(408);
        res.end();
    });
});

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("Node NOT Exiting...");
});

var server = app.listen(8889, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Listening at http://' + host + ':' + port);
});