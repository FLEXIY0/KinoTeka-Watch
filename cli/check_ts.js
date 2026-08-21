'use strict';
var http = require('./lib/http');

async function testTorrServer() {
    var endpoints = [
        'http://127.0.0.1:8090/echo',
        'http://localhost:8090/echo',
        'http://127.0.0.1:8090/settings'
    ];

    for (var ep of endpoints) {
        try {
            var res = await http.request(ep, { timeout: 1500 });
            console.log(ep, '-> Status:', res.status, 'Body:', res.body ? res.body.trim() : '');
        } catch (e) {
            console.log(ep, '-> Not running /', e.message);
        }
    }
}

testTorrServer();
