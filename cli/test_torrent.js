'use strict';
var http = require('./lib/http');

async function testTorrentSearch(query) {
    console.log('Searching torrents for:', query);
    var url = 'https://torlook.info/' + encodeURIComponent(query);
    try {
        var res = await http.request(url, {
            referer: 'https://torlook.info/',
            timeout: 8000
        });
        console.log('TorLook status:', res.status, 'len:', res.body ? res.body.length : 0);
        if (res.body) {
            // Check for magnets or torrent titles
            var magnetMatches = res.body.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+/g);
            console.log('Found magnets count:', magnetMatches ? magnetMatches.length : 0);
        }
    } catch (e) {
        console.log('TorLook error:', e.message);
    }
}

testTorrentSearch('Матрица 1999');
