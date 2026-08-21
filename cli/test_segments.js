'use strict';
var api = require('./lib/api');
var extractors = require('./lib/extractors');
var stream = require('./lib/stream');
var http = require('./lib/http');

async function testSegments() {
    var players = await api.getPlayers(301);
    var veoveo = players.find(p => p.source === 'Veoveo');
    var found = await extractors.extractVeoveo(veoveo.iframeUrl);
    var variants = await stream.readVariants(found);

    var masterUrl = found.url;
    var videoPlaylistUrl = variants[0].url; // index-v1.m3u8
    var audioPlaylistUrl = variants[0].audioTracks[0].url; // index-a1.m3u8

    console.log('1. Fetching Video playlist:', videoPlaylistUrl);
    var vRes = await http.request(videoPlaylistUrl, { referer: 'https://tazaromikaz.link/' });
    console.log('Video playlist status:', vRes.status, 'len:', vRes.body ? vRes.body.length : 0);
    console.log('Video playlist content:\n', vRes.body ? vRes.body.slice(0, 300) : '');

    console.log('\n2. Fetching Audio playlist:', audioPlaylistUrl);
    var aRes = await http.request(audioPlaylistUrl, { referer: 'https://tazaromikaz.link/' });
    console.log('Audio playlist status:', aRes.status, 'len:', aRes.body ? aRes.body.length : 0);
    console.log('Audio playlist content:\n', aRes.body ? aRes.body.slice(0, 300) : '');

    // Extract first segment from video playlist:
    var vSegMatch = vRes.body.match(/([^\r\n]+\.ts|[^\r\n]+\.mp4|[^\r\n]+\.m4s)/);
    if (vSegMatch) {
        var segUrl = new URL(vSegMatch[1], videoPlaylistUrl).toString();
        console.log('\n3. Fetching Video segment:', segUrl);
        var sRes = await http.request(segUrl, { referer: 'https://tazaromikaz.link/' });
        console.log('Segment status:', sRes.status, 'len:', sRes.body ? sRes.body.length : 0);
    }
}

testSegments();
