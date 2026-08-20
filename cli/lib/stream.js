'use strict';

// Извлечение прямой ссылки на поток из iframe балансера.
//
// 1. Сначала пробуем прямое извлечение (extractors.js) — для Collaps, Kodik и др.
//    это даёт ссылку на плейлист, звуковые дорожки и субтитры за <100 мс без браузера.
// 2. Если прямой экстрактор не поддерживается, открываем iframe в headless Chromium
//    через Puppeteer и слушаем сетевые запросы, фильтруя рекламу.

var api = require('./api');
var extractors = require('./extractors');

// Медиа по расширению; на случай, если content-type не пришёл
var MEDIA_RE = /\.(m3u8|mpd|mp4)(\?|$)/i;
var MANIFEST_RE = /\.(m3u8|mpd)(\?|$)/i;
var SEGMENT_RE = /\.(ts|m4s|aac|vtt)(\?|$)/i;

// Явно рекламные адреса
var JUNK_RE = /(vast|vmap|vpaid|advert|\/ads?\/|adsby|preroll|midroll|postroll|banner|promo|trailer|thumb|sprite|preview)/i;

// Рекламные сети, счётчики и SDK.
var AD_HOST_RE = new RegExp([
    'doubleclick', 'googlesyndication', 'googletagservices', 'googletagmanager',
    'google-analytics', 'imasdk\\.googleapis', 'adservice\\.google', 'adsbygoogle',
    'mc\\.yandex', 'an\\.yandex', 'yandex\\.ru/(?:metrika|an)', 'adfox', 'adriver',
    'criteo', 'smartadserver', 'pubmatic', 'rubiconproject', 'openx', 'adnxs',
    'taboola', 'outbrain', 'mgid', 'propellerads', 'popads', 'onclickads',
    'adsterra', 'hilltopads', 'exoclick', 'juicyads', 'trafficjunky', 'vidoomy',
    'betweendigital', 'luckyads', 'redtram', 'kadam', 'prebid', 'openrtb'
].join('|'), 'i');

// Типы ресурсов, без которых манифест всё равно найдётся
var SKIP_TYPES = { image: true, font: true, media: true };

// Короче этого — почти наверняка рекламный ролик, а не серия
var MIN_CONTENT_SECONDS = 300;

// Селекторы кнопки «play» у разных балансеров
var PLAY_SELECTORS = [
    '.play', '.player-play', '.vjs-big-play-button', '.plyr__control--overlaid',
    '[class*="play-button"]', '[class*="playButton"]', '[id*="play"]', 'video'
];

function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function loadPuppeteer() {
    try {
        return require('puppeteer');
    } catch (err) {
        throw new Error(
            'Не найден puppeteer — он нужен для браузерного извлечения потока.\n' +
            '  Установи его: npm install puppeteer\n' +
            '  Либо выбери плеер с прямым извлечением ⚡ (например, Collaps).'
        );
    }
}

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

    // Завершённый короткий плейлист — это ролик
    if (info.ended && info.duration > 0 && info.duration < MIN_CONTENT_SECONDS) return false;

    return true;
}

function describeDuration(seconds) {
    if (!seconds) return '';
    if (seconds < 90) return Math.round(seconds) + ' с';
    return Math.round(seconds / 60) + ' мин';
}

// Браузер живёт между извлечениями: запуск стоит секунды
var sharedBrowser = null;
var sharedHeadful = null;

function isAlive(browser) {
    if (!browser) return false;
    return typeof browser.connected === 'boolean' ? browser.connected : browser.isConnected();
}

async function getBrowser(headful) {
    if (isAlive(sharedBrowser) && sharedHeadful === headful) {
        return sharedBrowser;
    }

    await shutdown();

    var puppeteer = loadPuppeteer();

    sharedBrowser = await puppeteer.launch({
        headless: !headful,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--autoplay-policy=no-user-gesture-required',
            '--mute-audio',
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-component-update',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--blink-settings=imagesEnabled=false'
        ]
    });

    sharedHeadful = headful;

    return sharedBrowser;
}

// Прогрев: старт браузера заранее
function warmup(headful) {
    getBrowser(!!headful).catch(function () { });
}

async function shutdown() {
    if (sharedBrowser) {
        var browser = sharedBrowser;
        sharedBrowser = null;
        await browser.close().catch(function () { });
    }
}

// Запуск воспроизведения во всех фреймах
async function pokePlayers(page) {
    var frames = page.frames();

    for (var i = 0; i < frames.length; i++) {
        try {
            await frames[i].evaluate(function (selectors) {
                var video = document.querySelector('video');
                if (video) {
                    video.muted = true;
                    var promise = video.play();
                    if (promise && promise.catch) promise.catch(function () { });
                }

                selectors.forEach(function (selector) {
                    var el = document.querySelector(selector);
                    if (el && el.click) el.click();
                });
            }, PLAY_SELECTORS);
        } catch (err) {
            // Фрейм мог отвалиться или быть cross-origin без доступа
        }
    }

    try {
        var viewport = page.viewport();
        await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    } catch (err) {
        // Клик мимо — не страшно
    }
}

// Основная функция извлечения потока
async function resolveStream(iframeUrl, options) {
    options = options || {};
    var report = options.onProgress || function () { };

    // ШАГ 1: Попытка прямого быстрого извлечения (<100мс)
    report('проверяю прямое извлечение ⚡');
    var directResult = await extractors.extractDirectStream(iframeUrl, {
        season: options.season,
        episode: options.episode,
        timeout: 6000
    }).catch(function () { return null; });

    if (directResult && directResult.url) {
        report('поток получен напрямую ⚡');
        return {
            url: directResult.url,
            referer: directResult.referer,
            origin: directResult.origin,
            userAgent: directResult.userAgent || api.USER_AGENT,
            audioTracks: directResult.audioTracks || [],
            subtitles: directResult.subtitles || [],
            duration: directResult.duration || 0,
            direct: true,
            suspicious: false
        };
    }

    if (options.directOnly) {
        throw new Error('Прямое извлечение для этого плеера не удалось, а запуск браузера отключен в настройках.');
    }

    // ШАГ 2: Браузерное извлечение через Puppeteer
    report('запускаю браузер для извлечения');

    var timeoutMs = options.timeout || 40000;
    var candidates = [];
    var rejected = [];
    var fallbacks = [];
    var seen = {};
    var page = null;
    var settled = false;
    var graceTimer = null;

    var browser = await getBrowser(!!options.headful);
    var context = null;

    try {
        context = browser.createBrowserContext
            ? await browser.createBrowserContext()
            : await browser.createIncognitoBrowserContext();

        page = await context.newPage();
        await page.setCacheEnabled(false);
        await page.setUserAgent(api.USER_AGENT);
        await page.setViewport({ width: 1280, height: 720 });

        var announce = null;
        var contentFound = new Promise(function (resolve) { announce = resolve; });

        function finish() {
            if (settled) return;
            settled = true;
            announce();
        }

        function refererOf(request) {
            var frame = null;
            try { frame = request.frame(); } catch (err) { }
            return frame && frame.url() && frame.url() !== 'about:blank' ? frame.url() : iframeUrl;
        }

        await page.setRequestInterception(true);

        page.on('request', function (request) {
            var url = request.url();
            var type = request.resourceType();

            if (AD_HOST_RE.test(url) || (JUNK_RE.test(url) && !MANIFEST_RE.test(url))) {
                request.abort().catch(function () { });
                return;
            }

            if (SKIP_TYPES[type] || SEGMENT_RE.test(url)) {
                request.abort().catch(function () { });
                return;
            }

            request.continue().catch(function () { });
        });

        page.on('response', function (response) {
            var url = response.url();
            if (seen[url]) return;

            var status = response.status();
            if (status >= 400) return;

            var headers = response.headers() || {};
            var contentType = String(headers['content-type'] || '').toLowerCase();
            var isManifest = MANIFEST_RE.test(url) ||
                /mpegurl|dash\+xml/.test(contentType);

            if (!isManifest) {
                if (MEDIA_RE.test(url) && !JUNK_RE.test(url)) {
                    seen[url] = true;
                    fallbacks.push({ url: url, referer: refererOf(response.request()) });
                }
                return;
            }

            seen[url] = true;

            response.text().then(function (text) {
                if (!text) return;

                if (text.indexOf('#EXTM3U') < 0 && !/\.mpd(\?|$)/i.test(url)) return;

                var info = analyzeHls(text);
                var entry = {
                    url: url,
                    referer: refererOf(response.request()),
                    info: info,
                    manifest: text
                };

                if (looksLikeContent(info)) {
                    candidates.push(entry);

                    if (info.kind === 'master') {
                        report('нашёл поток с выбором качества');
                        finish();
                    } else {
                        report('нашёл поток' + (info.duration ? ' на ' + describeDuration(info.duration) : '') +
                            ', проверяю, есть ли другие качества');
                        if (!graceTimer) graceTimer = setTimeout(finish, 1500);
                    }
                } else {
                    rejected.push(entry);
                    report('пропустил рекламный ролик' +
                        (info.duration ? ' на ' + describeDuration(info.duration) : '') + ', жду дальше');
                }
            }).catch(function () { });
        });

        report('открываю плеер');

        page.goto(iframeUrl, {
            referer: options.referer || 'https://kinobox.tv/',
            waitUntil: 'domcontentloaded',
            timeout: Math.min(timeoutMs, 30000)
        }).then(function () {
            report('жму play');
        }).catch(function () { });

        var poking = false;

        var poker = setInterval(function () {
            if (poking || settled) return;
            poking = true;
            pokePlayers(page).catch(function () { }).then(function () { poking = false; });
        }, 350);

        try {
            await Promise.race([contentFound, sleep(timeoutMs)]);
        } finally {
            clearInterval(poker);
            if (graceTimer) clearTimeout(graceTimer);
        }
    } finally {
        if (page) await page.close().catch(function () { });
        if (context) await context.close().catch(function () { });
    }

    if (candidates.length > 0) {
        var master = candidates.filter(function (item) {
            return item.info && item.info.kind === 'master';
        })[0];

        return buildResult(master || candidates[0], false);
    }

    var spare = fallbacks[0] || rejected[0];
    if (!spare) return null;

    return buildResult(spare, true);
}

function buildResult(entry, suspicious) {
    var origin = new URL(entry.referer).origin;

    return {
        url: entry.url,
        referer: origin + '/',
        origin: origin,
        userAgent: api.USER_AGENT,
        suspicious: suspicious,
        duration: entry.info ? entry.info.duration : 0,
        manifest: entry.manifest || null,
        audioTracks: [],
        subtitles: [],
        direct: false
    };
}

// Разбор мастер-плейлиста HLS: какие качества вообще предлагает балансер.
async function readVariants(stream) {
    if (stream.manifest) {
        return parseMaster(stream.manifest, stream.url);
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    var text;

    try {
        var res = await fetch(stream.url, {
            headers: {
                'User-Agent': stream.userAgent || api.USER_AGENT,
                'Referer': stream.referer,
                'Origin': stream.origin
            },
            signal: controller.signal
        });

        if (!res.ok) return [];
        text = await res.text();
    } catch (err) {
        return [];
    } finally {
        clearTimeout(timer);
    }

    return parseMaster(text, stream.url);
}

// Разбор мастер-плейлиста в список дорожек
function parseMaster(text, baseUrl) {
    if (!text || text.indexOf('#EXTM3U') < 0) return [];

    var lines = text.split(/\r?\n/);
    var variants = [];
    var audioTracks = [];

    // 1. Поиск аудиодорожек: #EXT-X-MEDIA:TYPE=AUDIO
    for (var a = 0; a < lines.length; a++) {
        if (lines[a].indexOf('#EXT-X-MEDIA:TYPE=AUDIO') === 0) {
            var aName = /NAME="([^"]+)"/i.exec(lines[a]);
            var aLang = /LANGUAGE="([^"]+)"/i.exec(lines[a]);
            var aUri = /URI="([^"]+)"/i.exec(lines[a]);
            var aDef = /DEFAULT=YES/i.test(lines[a]);

            audioTracks.push({
                name: aName ? aName[1] : ('Аудио ' + (audioTracks.length + 1)),
                lang: aLang ? aLang[1] : '',
                url: aUri ? new URL(aUri[1], baseUrl).toString() : null,
                default: aDef,
                index: audioTracks.length
            });
        }
    }

    // 2. Поиск вариантов видео
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
        var height = resolution ? parseInt(resolution[2], 10) : 0;
        var width = resolution ? parseInt(resolution[1], 10) : 0;

        // Формирование красивого лейбла (например, 1080p, 720p, 480p)
        var label = name ? name[1] : '';
        if (!label) {
            if (height >= 2100) label = '4K (2160p)';
            else if (height >= 1400) label = '2K (1440p)';
            else if (height >= 1000 || width >= 1900) label = '1080p';
            else if (height >= 700 || width >= 1200) label = '720p';
            else if (height >= 450 || width >= 800) label = '480p';
            else if (height >= 300) label = '360p';
            else if (height) label = height + 'p';
            else label = 'вариант ' + (variants.length + 1);
        }

        // Предотвращаем дублирование вариантов с одинаковым разрешением
        var targetUrl = new URL(target, baseUrl).toString();
        var existing = variants.find(function (v) { return v.url === targetUrl; });
        if (!existing) {
            variants.push({
                height: height,
                width: width,
                bandwidth: bandwidth ? parseInt(bandwidth[1], 10) : 0,
                label: label,
                url: targetUrl,
                audioTracks: audioTracks
            });
        }
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
        if (fhd) return fhd;
        return variants[0];
    }

    if (normalized === 'min' || normalized === 'worst') return variants[variants.length - 1];

    var height = parseInt(normalized, 10);
    if (!height) return null;

    var suitable = variants.filter(function (item) { return item.height <= height || item.width <= (height * 16 / 9); });

    return suitable.length > 0 ? suitable[0] : variants[variants.length - 1];
}

module.exports = {
    resolveStream: resolveStream,
    readVariants: readVariants,
    pickVariant: pickVariant,
    analyzeHls: analyzeHls,
    looksLikeContent: looksLikeContent,
    warmup: warmup,
    shutdown: shutdown
};
