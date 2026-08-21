'use strict';
var http = require('./lib/http');

var endpoints = [
    'http://rutor.info/search/0/0/0/0/' + encodeURIComponent('Матрица 1999'),
    'http://rutor.is/search/0/0/0/0/' + encodeURIComponent('Матрица 1999'),
    'https://rutor.lib/search/0/0/0/0/' + encodeURIComponent('Матрица 1999'),
    'https://api.torlook.info/search?q=' + encodeURIComponent('Матрица 1999')
];

async function testTrackers() {
    for (var u of endpoints) {
        try {
            var res = await http.request(u, { timeout: 4000 });
            console.log(u, '-> Status:', res.status, 'len:', res.body ? res.body.length : 0);
        } catch (e) {
            console.log(u, '-> Error:', e.message);
        }
    }
}

testTrackers();
