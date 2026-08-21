'use strict';
var api = require('./lib/api');
var extractors = require('./lib/extractors');
var stream = require('./lib/stream');
var mpv = require('./lib/mpv');

async function testMpvArgs() {
    var players = await api.getPlayers(301);
    var veoveo = players.find(p => p.source === 'Veoveo');
    var found = await extractors.extractVeoveo(veoveo.iframeUrl);
    var variants = await stream.readVariants(found);
    var variant = variants[0];
    var applied = stream.applyVariant(found, variant);
    applied.audioId = 1;

    console.log('Stream object:\n', applied);

    // Call buildArgs via mock/test:
    // In mpv.js:
    var socketPath = mpv.generateSocketPath ? mpv.generateSocketPath() : 'test.sock';
    // Let's print the mpv command:
    console.log('\nMaster URL:', applied.url);
    console.log('Referer:', applied.referer);
    console.log('Origin:', applied.origin);
    console.log('hlsBitrate:', applied.hlsBitrate);
    console.log('audioId:', applied.audioId);
}

testMpvArgs();
