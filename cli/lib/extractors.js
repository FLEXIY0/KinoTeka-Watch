'use strict';

// Прямые быстрые экстракторы потоков из балансеров.
//
// Большинство популярных балансеров (Collaps, Kodik и др.) отдают полные данные
// о потоке, звуковых дорожках, субтитрах и плейлистах прямо в HTML/API фрейма.
// Прямой парсинг работает за <100 мс и не требует запуска браузера,
// траты памяти и риска блокировки анти-ботами.

var USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Разбор JS-литерала объекта из текста (например, аргумента функции makePlayer({...}))
function parseJsObject(code) {
    if (!code) return null;
    try {
        var clean = code.trim();
        if (clean[0] !== '{' || clean[clean.length - 1] !== '}') {
            var firstBrace = clean.indexOf('{');
            var lastBrace = clean.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                clean = clean.slice(firstBrace, lastBrace + 1);
            }
        }
        var fn = new Function('return (' + clean + ');');
        return fn();
    } catch (err) {
        return null;
    }
}

// 1. Экстрактор Collaps (api.ortified.ws, apicollaps.cc, etc.)
async function extractCollaps(iframeUrl, options) {
    options = options || {};
    var season = options.season ? parseInt(options.season, 10) : null;
    var episode = options.episode ? parseInt(options.episode, 10) : null;

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, options.timeout || 12000);

    var res;
    try {
        res = await fetch(iframeUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': options.referer || 'https://kinobox.tv/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        throw new Error('Collaps вернул HTTP ' + res.status);
    }

    var html = await res.text();
    var origin = new URL(iframeUrl).origin;

    // Ищем вызов makePlayer({ ... })
    var makePlayerMatch = html.match(/makePlayer\s*\(\s*(\{[\s\S]*?\})\s*\);/);
    if (!makePlayerMatch) {
        var altMatch = html.match(/makePlayer\s*\(\s*(\{[\s\S]*)/);
        if (altMatch) {
            var depth = 0;
            var endIdx = -1;
            for (var i = 0; i < altMatch[1].length; i++) {
                if (altMatch[1][i] === '{') depth++;
                else if (altMatch[1][i] === '}') {
                    depth--;
                    if (depth === 0) { endIdx = i + 1; break; }
                }
            }
            if (endIdx > 0) {
                makePlayerMatch = [null, altMatch[1].slice(0, endIdx)];
            }
        }
    }

    var hlsUrl = null;
    var dashUrl = null;
    var audioTracks = [];
    var subtitles = [];
    var duration = 0;
    var title = '';

    if (makePlayerMatch) {
        var cfg = parseJsObject(makePlayerMatch[1]);
        if (cfg) {
            if (cfg.title) title = cfg.title;

            // Сериал с плейлистом сезонов и серий
            if (cfg.playlist && cfg.playlist.seasons && cfg.playlist.seasons.length > 0) {
                var targetSeason = null;
                if (season) {
                    targetSeason = cfg.playlist.seasons.find(function (s) { return s.season === season; });
                }
                if (!targetSeason) targetSeason = cfg.playlist.seasons[0];

                var targetEpisode = null;
                if (targetSeason && targetSeason.episodes && targetSeason.episodes.length > 0) {
                    if (episode) {
                        targetEpisode = targetSeason.episodes.find(function (e) {
                            return parseInt(e.episode, 10) === episode;
                        });
                    }
                    if (!targetEpisode) targetEpisode = targetSeason.episodes[0];
                }

                if (targetEpisode) {
                    hlsUrl = targetEpisode.hls || null;
                    dashUrl = targetEpisode.dash || targetEpisode.dasha || null;
                    duration = targetEpisode.duration || 0;
                    if (targetEpisode.title) title = targetEpisode.title;

                    if (targetEpisode.audio && targetEpisode.audio.names) {
                        audioTracks = targetEpisode.audio.names.map(function (name, idx) {
                            var order = (targetEpisode.audio.order && targetEpisode.audio.order[idx] !== undefined)
                                ? targetEpisode.audio.order[idx] : idx;
                            return {
                                id: order,
                                index: idx,
                                name: name,
                                audioId: order + 1 // mpv --aid=1, 2, ...
                            };
                        });
                    }

                    if (targetEpisode.cc && Array.isArray(targetEpisode.cc)) {
                        subtitles = targetEpisode.cc.map(function (c) {
                            return { name: c.name || 'Субтитры', url: c.url };
                        });
                    }
                }
            } else if (cfg.source) {
                // Фильм (одиночное видео)
                hlsUrl = cfg.source.hls || null;
                dashUrl = cfg.source.dash || cfg.source.dasha || null;

                if (cfg.source.audio && cfg.source.audio.names) {
                    audioTracks = cfg.source.audio.names.map(function (name, idx) {
                        var order = (cfg.source.audio.order && cfg.source.audio.order[idx] !== undefined)
                            ? cfg.source.audio.order[idx] : idx;
                        return {
                            id: order,
                            index: idx,
                            name: name,
                            audioId: order + 1
                        };
                    });
                }

                if (cfg.source.cc && Array.isArray(cfg.source.cc)) {
                    subtitles = cfg.source.cc.map(function (c) {
                        return { name: c.name || 'Субтитры', url: c.url };
                    });
                }
            }
        }
    }

    // Резервный поиск hls в HTML через регулярные выражения
    if (!hlsUrl) {
        var hlsRegexMatch = html.match(/["'](https?:\\?\/\\?\/[^"']+\.mp4\\?\/master\.m3u8[^"']*)["']/i) ||
            html.match(/hls\s*:\s*["']([^"']+)["']/i);
        if (hlsRegexMatch) {
            hlsUrl = hlsRegexMatch[1].replace(/\\\//g, '/');
        }
    }

    if (!hlsUrl && !dashUrl) {
        return null;
    }

    return {
        type: 'collaps',
        url: hlsUrl || dashUrl,
        hlsUrl: hlsUrl,
        dashUrl: dashUrl,
        referer: origin + '/',
        origin: origin,
        userAgent: USER_AGENT,
        audioTracks: audioTracks,
        subtitles: subtitles,
        duration: duration,
        title: title,
        direct: true
    };
}

// 2. Экстрактор Kodik
async function extractKodik(iframeUrl, options) {
    options = options || {};
    var urlObj = new URL(iframeUrl);
    if (!/kodik/i.test(urlObj.hostname) && !/kodik/i.test(iframeUrl)) {
        return null;
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, options.timeout || 12000);

    var res;
    try {
        res = await fetch(iframeUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': options.referer || 'https://kinobox.tv/'
            },
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) return null;

    var html = await res.text();
    var origin = urlObj.origin;

    var m3u8Match = html.match(/["'](https?:\\?\/\\?\/[^"']+\.m3u8[^"']*)["']/i);
    if (m3u8Match) {
        var directHls = m3u8Match[1].replace(/\\\//g, '/');
        if (directHls.indexOf('//') === 0) directHls = 'https:' + directHls;
        return {
            type: 'kodik',
            url: directHls,
            referer: origin + '/',
            origin: origin,
            userAgent: USER_AGENT,
            audioTracks: [],
            subtitles: [],
            direct: true
        };
    }

    return null;
}

// Универсальная точка входа для прямого извлечения потока
async function extractDirectStream(iframeUrl, options) {
    if (!iframeUrl) return null;
    options = options || {};

    try {
        var parsed = new URL(iframeUrl);
        var host = parsed.hostname.toLowerCase();

        // 1. Collaps и его зеркала
        if (host.indexOf('ortified') >= 0 || host.indexOf('collaps') >= 0 ||
            host.indexOf('fprxnet') >= 0 || host.indexOf('interkh') >= 0 ||
            parsed.pathname.indexOf('/embed/movie/') >= 0 || parsed.pathname.indexOf('/embed/v/') >= 0) {
            var collapsRes = await extractCollaps(iframeUrl, options).catch(function () { return null; });
            if (collapsRes && collapsRes.url) return collapsRes;
        }

        // 2. Kodik
        if (host.indexOf('kodik') >= 0) {
            var kodikRes = await extractKodik(iframeUrl, options).catch(function () { return null; });
            if (kodikRes && kodikRes.url) return kodikRes;
        }

        // 3. Резервная проверка для любого другого плеера
        var genericCollaps = await extractCollaps(iframeUrl, Object.assign({}, options, { timeout: 3000 })).catch(function () { return null; });
        if (genericCollaps && genericCollaps.url) return genericCollaps;

    } catch (err) {
        return null;
    }

    return null;
}

// Проверка: поддерживается ли плеер быстрым прямым экстрактором
function isDirectSupported(sourceName, iframeUrl) {
    var s = (sourceName || '').toLowerCase();
    var u = (iframeUrl || '').toLowerCase();

    if (s.indexOf('collaps') >= 0 || u.indexOf('ortified') >= 0 || u.indexOf('collaps') >= 0) return true;
    if (s.indexOf('kodik') >= 0 || u.indexOf('kodik') >= 0) return true;

    return false;
}

module.exports = {
    USER_AGENT: USER_AGENT,
    extractDirectStream: extractDirectStream,
    isDirectSupported: isDirectSupported,
    extractCollaps: extractCollaps,
    extractKodik: extractKodik
};
