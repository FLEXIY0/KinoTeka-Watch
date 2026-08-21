'use strict';
var api = require('./lib/api');
var extractors = require('./lib/extractors');
var stream = require('./lib/stream');
var mpv = require('./lib/mpv');
var spawn = require('child_process').spawn;

async function testMpvExecution() {
    var players = await api.getPlayers(301);
    var veoveo = players.find(p => p.source === 'Veoveo');
    var found = await extractors.extractVeoveo(veoveo.iframeUrl);
    var variants = await stream.readVariants(found);
    var variant = variants[0];
    var applied = stream.applyVariant(found, variant);
    applied.audioId = 1;

    // Run mpv with log file and frames=50
    var args = [
        '--user-agent=' + applied.userAgent,
        '--referrer=' + applied.referer,
        '--http-header-fields=Origin: ' + applied.origin,
        '--log-file=mpv_test.log',
        '--msg-level=all=v',
        '--frames=50',
        '--vo=null',
        '--ao=null',
        applied.url
    ];

    console.log('Spawning mpv with args:', args.join(' '));
    var p = spawn('mpv', args);
    p.on('exit', (code) => {
        console.log('mpv exited with code:', code);
        var fs = require('fs');
        if (fs.existsSync('mpv_test.log')) {
            var log = fs.readFileSync('mpv_test.log', 'utf8');
            console.log('MPV LOG:\n', log.slice(0, 3000));
        }
    });
}

testMpvExecution();
