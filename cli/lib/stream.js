'use strict';

// Получение прямой ссылки на поток и разбор HLS.
//
// Браузера здесь нет: Chromium из проекта убран целиком, поэтому единственный
// путь — прямые экстракторы (extractors.js). Если балансер не разобрался,
// наверх уходит внятная причина, а не тишина.

var api = require('./api');
var extractors = require('./extractors');
var http = require('./http');

// Короче этого — почти наверняка рекламный ролик, а не серия
var MIN_CONTENT_SECONDS = 300;

// Разбор HLS: мастер-плейлист, длинная серия или короткий ролик?
function analyzeHls(text) {
    if (text.indexOf('#EXT-X-STREAM-INF') >= 0) {
        return { kind: 'master', duration: 0 };
    }

    if (text.indexOf('#EXTINF') < 0) {
        return { kind: 'unknown', duration: 0 };
    }

    var total = 0;
    var re = /#EXTINF:\s*([\d.]+)/g;
    var match;

    while ((match = re.exec(text)) !== null) {
        total += parseFloat(match[1]) || 0;
    }

    return {
        kind: 'media',
        duration: total,
        ended: text.indexOf('#EXT-X-ENDLIST') >= 0
    };
}

// Похоже ли это на настоящий контент, а не на преролл
function looksLikeContent(info) {
    if (info.kind === 'master') return true;
    if (info.kind === 'unknown') return true;
    if (info.ended && info.duration > 0 && info.duration < MIN_CONTENT_SECONDS) return false;

    return true;
}

// Собрать понятное сообщение из накопленных отказов балансеров
function describeFailure(errors) {
    if (!errors || errors.length === 0) return 'балансер не отдал поток';

    var geo = errors.find(function (err) { return err.code === 'geo'; });
    if (geo) return geo.message;

    var network = errors.find(function (err) { return err.code === 'network' || err.code === 'timeout'; });
    if (network) return network.message;

    return errors[0].message;
}

// Основная функция извлечения потока
async function resolveStream(iframeUrl, options) {
    options = options || {};

    var report = options.onProgress || function () { };
    var errors = [];

    report('разбираю плеер напрямую ⚡');

    var found = await extractors.extractDirectStream(iframeUrl, {
        season: options.season,
        episode: options.episode,
        translation: options.translation,
        timeout: options.timeout || 15000,
        errors: errors
    });

    if (!found || !found.url) {
        var failure = new Error(describeFailure(errors));
        failure.name = 'StreamError';
        failure.reasons = errors;
        throw failure;
    }

    report('поток получен напрямую ⚡');

    return {
        url: found.url,
        referer: found.referer,
        origin: found.origin,
        userAgent: found.userAgent || api.USER_AGENT,
        audioTracks: found.audioTracks || [],
        variantTracks: found.variantTracks || [],
        subtitles: found.subtitles || [],
        duration: found.duration || 0,
        title: found.title || '',
        direct: true,
        suspicious: false
    };
}

// Разбор мастер-плейлиста HLS: какие качества предлагает балансер
async function readVariants(stream) {
    if (stream.manifest) {
        return parseMaster(stream.manifest, stream.url);
    }

    var res;

    try {
        res = await http.request(stream.url, {
            userAgent: stream.userAgent || api.USER_AGENT,
            referer: stream.referer,
            origin: stream.origin,
            accept: 'application/vnd.apple.mpegurl,*/*',
            timeout: 15000
        });
    } catch (err) {
        return [];
    }

    if (!res.ok) return [];

    return parseMaster(res.body, res.url);
}

// Разбор атрибутов строки #EXT-X-...
function attr(line, name) {
    var match = new RegExp(name + '="([^"]*)"').exec(line) || new RegExp(name + '=([^,\\s]+)').exec(line);
    return match ? match[1] : '';
}

// Разбор мастер-плейлиста в список дорожек.
//
// Важное: аудио у большинства балансеров вынесено в отдельные рендиции
// (#EXT-X-MEDIA:TYPE=AUDIO с GROUP-ID), а сам вариант качества — только видео.
// Поэтому каждой дорожке качества привязывается её собственная группа звука:
// иначе выбор качества уводил на видео без звука.
function parseMaster(text, baseUrl) {
    if (!text || text.indexOf('#EXTM3U') < 0) return [];

    var lines = text.split(/\r?\n/);
    var audioByGroup = {};
    var subsByGroup = {};

    for (var a = 0; a < lines.length; a++) {
        var line = lines[a];

        if (line.indexOf('#EXT-X-MEDIA:') !== 0) continue;

        var mediaType = attr(line, 'TYPE');
        var group = attr(line, 'GROUP-ID');
        var uri = attr(line, 'URI');

        var entry = {
            name: attr(line, 'NAME') || '',
            lang: attr(line, 'LANGUAGE') || '',
            url: uri ? new URL(uri, baseUrl).toString() : null,
            default: /DEFAULT=YES/i.test(line),
            group: group
        };

        if (mediaType === 'AUDIO') {
            if (!audioByGroup[group]) audioByGroup[group] = [];
            entry.name = entry.name || ('Аудио ' + (audioByGroup[group].length + 1));
            entry.index = audioByGroup[group].length;
            // mpv нумерует дорожки внутри выбранной группы с единицы
            entry.audioId = audioByGroup[group].length + 1;
            audioByGroup[group].push(entry);
        } else if (mediaType === 'SUBTITLES') {
            if (!subsByGroup[group]) subsByGroup[group] = [];
            entry.name = entry.name || ('Субтитры ' + (subsByGroup[group].length + 1));
            subsByGroup[group].push(entry);
        }
    }

    var variants = [];

    for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;

        var target = '';

        for (var j = i + 1; j < lines.length; j++) {
            if (lines[j] && lines[j][0] !== '#') { target = lines[j].trim(); break; }
        }

        if (!target) continue;

        var resolution = /RESOLUTION=(\d+)x(\d+)/i.exec(lines[i]);
        var bandwidth = /BANDWIDTH=(\d+)/i.exec(lines[i]);
        var name = /NAME="([^"]+)"/i.exec(lines[i]);
        var width = resolution ? parseInt(resolution[1], 10) : 0;
        var height = resolution ? parseInt(resolution[2], 10) : 0;

        var label = name ? name[1] : '';

        if (!label) {
            if (height >= 2100 || width >= 3800) label = '4K (2160p)';
            else if (height >= 1400 || width >= 2500) label = '2K (1440p)';
            else if (height >= 1000 || width >= 1900) label = '1080p';
            else if (height >= 700 || width >= 1200) label = '720p';
            else if (height >= 450 || width >= 700) label = '480p';
            else if (height >= 300 || width >= 480) label = '360p';
            else if (height) label = height + 'p';
            else label = 'вариант ' + (variants.length + 1);
        }

        var audioGroup = attr(lines[i], 'AUDIO');
        var subGroup = attr(lines[i], 'SUBTITLES');
        var targetUrl = new URL(target, baseUrl).toString();

        if (variants.some(function (item) { return item.url === targetUrl; })) continue;

        variants.push({
            height: height,
            width: width,
            bandwidth: bandwidth ? parseInt(bandwidth[1], 10) : 0,
            label: label,
            url: targetUrl,
            masterUrl: baseUrl,
            audioGroup: audioGroup,
            // Звук лежит отдельно — значит проигрывать надо мастер, а не вариант
            audioSeparate: !!(audioGroup && audioByGroup[audioGroup]),
            audioTracks: audioGroup && audioByGroup[audioGroup] ? audioByGroup[audioGroup] : [],
            subtitles: subGroup && subsByGroup[subGroup] ? subsByGroup[subGroup] : []
        });
    }

    variants.sort(function (a, b) {
        return (b.height - a.height) || (b.bandwidth - a.bandwidth);
    });

    return variants;
}

// Выбор варианта по желаемой высоте / параметру: 1080 -> 1080p, max, min
function pickVariant(variants, wanted) {
    if (!variants || variants.length === 0) return null;
    if (!wanted) return null;

    var normalized = String(wanted).toLowerCase().replace(/p$/, '');

    if (normalized === 'max' || normalized === 'best' || normalized === '4k' || normalized === '1080') {
        var fhd = variants.find(function (item) { return item.height >= 1000 || item.width >= 1900; });
        return fhd || variants[0];
    }

    if (normalized === 'min' || normalized === 'worst') return variants[variants.length - 1];

    var height = parseInt(normalized, 10);
    if (!height) return null;

    var suitable = variants.filter(function (item) {
        return item.height <= height || item.width <= (height * 16 / 9);
    });

    return suitable.length > 0 ? suitable[0] : variants[variants.length - 1];
}

// Собрать поток под выбранное качество.
//
// Когда звук вынесен в отдельную группу, URL остаётся мастер-плейлистом, а
// качество задаётся через --hls-bitrate: только так mpv видит и видео, и все
// дорожки озвучки. Подмена URL на вариант — ровно то, из-за чего пропадал звук.
function applyVariant(stream, variant) {
    if (!variant) return stream;

    var next = Object.assign({}, stream, {
        label: variant.label,
        height: variant.height,
        subtitles: variant.subtitles && variant.subtitles.length > 0 ? variant.subtitles : stream.subtitles
    });

    if (variant.audioSeparate) {
        next.url = variant.masterUrl || stream.url;
        next.hlsBitrate = variant.bandwidth || 0;
        next.audioTracks = variant.audioTracks;
    } else {
        next.url = variant.url;
        next.hlsBitrate = 0;
        next.audioTracks = variant.audioTracks && variant.audioTracks.length > 0
            ? variant.audioTracks
            : stream.audioTracks;
    }

    return next;
}

// Подобрать номер звуковой дорожки под название озвучки
function matchAudioTrack(tracks, wantedName) {
    if (!tracks || tracks.length === 0 || !wantedName) return null;

    var wanted = extractors.normalizeName(wantedName);

    var exact = tracks.find(function (track) {
        return extractors.normalizeName(track.name) === wanted;
    });

    if (exact) return exact;

    return tracks.find(function (track) {
        return extractors.namesMatch(extractors.normalizeName(track.name), wanted);
    }) || null;
}

module.exports = {
    resolveStream: resolveStream,
    readVariants: readVariants,
    parseMaster: parseMaster,
    pickVariant: pickVariant,
    applyVariant: applyVariant,
    matchAudioTrack: matchAudioTrack,
    analyzeHls: analyzeHls,
    looksLikeContent: looksLikeContent,
    describeFailure: describeFailure,
    // Браузера больше нет — заглушки, чтобы старые вызовы не падали
    warmup: function () { },
    shutdown: function () { return Promise.resolve(); }
};
