'use strict';
var http = require('./lib/http');

async function testLumex() {
    var url = 'https://api.lumex.space/content?contentType=short&kpId=301&clientId=CWfKXLc1ajId&domain=movielab.one&url=movielab.one';
    try {
        var res = await http.request(url, {
            referer: 'https://movielab.one/',
            origin: 'https://movielab.one',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        console.log('Lumex status:', res.status, 'len:', res.body ? res.body.length : 0);
        if (res.body) {
            console.log('Lumex body snippet:\n', res.body.slice(0, 500));
        }
    } catch (e) {
        console.log('Lumex error:', e.message);
    }
}

testLumex();
