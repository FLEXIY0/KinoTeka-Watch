'use strict';

// Извлечение прямой ссылки на поток из iframe балансера.
//
// Балансеры не отдают ссылку на плейлист в открытом виде: она собирается их
// обфусцированным JS уже в браузере. Разбирать каждый по отдельности
// бессмысленно — они постоянно меняются. Поэтому открываем iframe в headless
// Chromium и слушаем сетевые запросы.
//
// Главная сложность не в том, чтобы поймать медиа-адрес, а в том, чтобы не
// принять за фильм рекламный ролик: преролл всегда идёт первым, и наивный
// «берём первое попавшееся» отдавал именно его. Поэтому:
//   - реклама режется на уровне сети, чтобы вообще не проигрывалась;
//   - каждый пойманный плейлист проверяется по содержимому — короткий
//     ролик с ENDLIST это реклама, а не серия;
//   - ждём дальше, пока не придёт что-то похожее на настоящий контент.

var api = require('./api');

// Медиа по расширению; на случай, если content-type не пришёл
var MEDIA_RE = /\.(m3u8|mpd|mp4)(\?|$)/i;
var MANIFEST_RE = /\.(m3u8|mpd)(\?|$)/i;
var SEGMENT_RE = /\.(ts|m4s|aac|vtt)(\?|$)/i;

// Явно рекламные адреса
var JUNK_RE = /(vast|vmap|vpaid|advert|\/ads?\/|adsby|preroll|midroll|postroll|banner|promo|trailer|thumb|sprite|preview)/i;

// Рекламные сети, счётчики и SDK. Если их не пустить, плеер обычно
// переходит сразу к контенту, не проигрывая ролик.
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
            'Не найден puppeteer — он нужен для извлечения потока.\n' +
            '  Установи его: npm install puppeteer\n' +
            '  Либо запусти с --iframe, чтобы просто получить ссылку на плеер.'
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

// Прогрев: старт браузера — самая долгая часть, начинаем заранее
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

// Пробуем запустить воспроизведение во всех фреймах: часть плееров
// начинает грузить манифест только после клика пользователя
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
            // Фрейм мог отвалиться или быть cross-origin без доступа — это норма
        }
    }

    try {
        var viewport = page.viewport();
        await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    } catch (err) {
        // Клик мимо — не страшно
    }
}

// Основная функция: iframeUrl -> { url, referer, origin, userAgent }
async function resolveStream(iframeUrl, options) {
    options = options || {};

    var timeoutMs = options.timeout || 40000;
    var report = options.onProgress || function () { };

    var candidates = [];      // всё, что похоже на контент
    var rejected = [];        // отбракованная реклама
    var fallbacks = [];       // медиа, которое не удалось проверить
    var seen = {};
    var page = null;
    var settled = false;
    var graceTimer = null;

    var browser = await getBrowser(!!options.headful);

    try {
        page = await browser.newPage();
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
            try { frame = request.frame(); } catch (err) { /* фрейм уже мёртв */ }
            return frame && frame.url() && frame.url() !== 'about:blank' ? frame.url() : iframeUrl;
        }

        // Режем всё, что не приближает к манифесту: картинки, шрифты,
        // сегменты и рекламу целиком — чтобы преролл вообще не играл
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

        // Манифесты пропускаем внутрь и читаем их тело: так видно,
        // сколько длится дорожка, и рекламу можно отсеять
        page.on('response', function (response) {
            var url = response.url();
            if (seen[url]) return;

            // Ошибочный ответ манифестом быть не может: иначе за поток
            // принимается страница вида «токен уже использован»
            var status = response.status();
            if (status >= 400) return;

            var headers = response.headers() || {};
            var contentType = String(headers['content-type'] || '').toLowerCase();
            var isManifest = MANIFEST_RE.test(url) ||
                /mpegurl|dash\+xml/.test(contentType);

            if (!isManifest) {
                // mp4 держим про запас: вдруг ничего лучше не будет
                if (MEDIA_RE.test(url) && !JUNK_RE.test(url)) {
                    seen[url] = true;
                    fallbacks.push({ url: url, referer: refererOf(response.request()) });
                }
                return;
            }

            seen[url] = true;

            response.text().then(function (text) {
                if (!text) return;

                // Тело должно быть настоящим плейлистом, а не сообщением об ошибке
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
                        // Мастер-плейлист — лучшее, что может быть: в нём качества
                        report('нашёл поток с выбором качества');
                        finish();
                    } else {
                        // Медиа-плейлист берём, но даём мастеру шанс появиться:
                        // иначе выбор качества теряется на ровном месте
                        report('нашёл поток' + (info.duration ? ' на ' + describeDuration(info.duration) : '') +
                            ', проверяю, есть ли другие качества');
                        if (!graceTimer) graceTimer = setTimeout(finish, 1500);
                    }
                } else {
                    rejected.push(entry);
                    report('пропустил рекламный ролик' +
                        (info.duration ? ' на ' + describeDuration(info.duration) : '') + ', жду дальше');
                }
            }).catch(function () { /* тело не отдали — не страшно */ });
        });

        report('открываю плеер');

        page.goto(iframeUrl, {
            referer: options.referer || 'https://kinobox.tv/',
            waitUntil: 'domcontentloaded',
            timeout: Math.min(timeoutMs, 30000)
        }).then(function () {
            if (!accepted) report('жму play');
        }).catch(function () { /* часть страниц не досылает load */ });

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
    }

    if (candidates.length > 0) {
        // Мастер предпочтительнее: только он даёт выбор качества
        var master = candidates.filter(function (item) {
            return item.info && item.info.kind === 'master';
        })[0];

        return buildResult(master || candidates[0], false);
    }

    // Контента не дождались. Отдаём хоть что-то, но честно помечаем:
    // пусть интерфейс посоветует другой балансер
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
        // Тело плейлиста браузер уже получил. Перечитывать его из Node нельзя:
        // у балансеров токены часто одноразовые, и второй запрос даёт 403 —
        // именно из-за этого выбор качества мог не появляться.
        manifest: entry.manifest || null
    };
}

// Разбор мастер-плейлиста HLS: какие качества вообще предлагает балансер.
// Возвращает пустой массив, если это уже медиа-плейлист или не HLS.
async function readVariants(stream) {
    // Тело, прочитанное браузером, надёжнее повторного запроса
    if (stream.manifest) {
        return parseMaster(stream.manifest, stream.url);
    }

    // По расширению не отсеиваем: часть балансеров отдаёт плейлист по адресу
    // без .m3u8, и такой поток раньше молча оставался без выбора качества
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    var text;

    try {
        var res = await fetch(stream.url, {
            headers: {
                'User-Agent': stream.userAgent,
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
    if (text.indexOf('#EXT-X-STREAM-INF') < 0) return [];

    var lines = text.split(/\r?\n/);
    var variants = [];

    for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;

        // Следующая непустая строка без решётки — адрес варианта
        var target = '';
        for (var j = i + 1; j < lines.length; j++) {
            if (lines[j] && lines[j][0] !== '#') { target = lines[j].trim(); break; }
        }

        if (!target) continue;

        var resolution = /RESOLUTION=(\d+)x(\d+)/i.exec(lines[i]);
        var bandwidth = /BANDWIDTH=(\d+)/i.exec(lines[i]);
        var name = /NAME="([^"]+)"/i.exec(lines[i]);
        var height = resolution ? parseInt(resolution[2], 10) : 0;

        variants.push({
            height: height,
            bandwidth: bandwidth ? parseInt(bandwidth[1], 10) : 0,
            label: name ? name[1] : (height ? height + 'p' : 'вариант ' + (variants.length + 1)),
            url: new URL(target, baseUrl).toString()
        });
    }

    variants.sort(function (a, b) {
        return (b.height - a.height) || (b.bandwidth - a.bandwidth);
    });

    return variants;
}

// Выбор варианта по желаемой высоте: 720 -> ближайший не выше, иначе худший
function pickVariant(variants, wanted) {
    if (variants.length === 0) return null;
    if (!wanted) return null;

    var normalized = String(wanted).toLowerCase().replace(/p$/, '');

    if (normalized === 'max' || normalized === 'best') return variants[0];
    if (normalized === 'min' || normalized === 'worst') return variants[variants.length - 1];

    var height = parseInt(normalized, 10);
    if (!height) return null;

    var suitable = variants.filter(function (item) { return item.height <= height; });

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
