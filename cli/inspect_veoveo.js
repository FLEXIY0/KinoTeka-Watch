'use strict';
var extractors = require('./lib/extractors');
var stream = require('./lib/stream');
var http = require('./lib/http');
var api = require('./lib/api');

async function inspectVeoveoStream() {
    console.log('Fetching players for Matrix (301)...');
    var players = await api.getPlayers(301);
    var veoveo = players.find(p => p.source === 'Veoveo');
    console.log('Veoveo iframeUrl:', veoveo.iframeUrl);

    var res = await extractors.extractVeoveo(veoveo.iframeUrl);
    console.log('Veoveo extracted:', res);

    var playlistUrl = res.url;
    console.log('Fetching m3u8 playlist:', playlistUrl);
    var m3u8Res = await http.request(playlistUrl, {
        referer: 'https://tazaromikaz.link/'
    });

    console.log('M3U8 status:', m3u8Res.status);
    console.log('M3U8 body:\n', m3u8Res.body);

    var variants = await stream.readVariants(res);
    console.log('Variants parsed:', variants);
}

inspectVeoveoStream();
