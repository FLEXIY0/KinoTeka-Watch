'use strict';

// Извлечение прямой ссылки на поток из iframe балансера.
//
// Балансеры (Alloha, Collaps, Videocdn, Kodik и прочие) не отдают ссылку на
// плейлист в открытом виде: она собирается их обфусцированным JS уже в
// браузере. Разбирать каждый по отдельности бессмысленно — они постоянно
// меняются. Поэтому открываем iframe в headless Chromium и слушаем сетевые
// запросы: первый .m3u8/.mpd/.mp4 и есть искомый поток.
//
// Скорость здесь важна, поэтому:
//   - браузер переиспользуется между запусками (старт стоит секунды);
//   - лишние запросы режутся, чтобы не тянуть рекламу и картинки;
//   - как только манифест пойман, ждать больше нечего — выходим сразу.

var api = require('./api');

// Что считаем потоком
var MEDIA_RE = /\.(m3u8|mpd|mp4)(\?|$)/i;

// Мусор, который иногда пролетает в тех же расширениях (реклама, превью, трейлеры)
var JUNK_RE = /(vast|vpaid|adv?[-_/]|\/ads?\/|banner|preroll|midroll|promo|trailer|thumb|sprite|preview)/i;

// Домены рекламы и аналитики: грузить их незачем
var AD_HOST_RE = /(doubleclick|googlesyndication|google-analytics|googletagmanager|yandex\.ru\/(?:metrika|an)|mc\.yandex|adriver|adfox|criteo|smartadserver|pubmatic|rubiconproject|openx|adnxs|imasdk)/i;

// Типы ресурсов, без которых манифест всё равно найдётся
var SKIP_TYPES = { image: true, font: true, media: true };

// Селекторы кнопки «play» у разных балансеров
var PLAY_SELECTORS = [
    '.play', '.player-play', '.vjs-big-play-button', '.plyr__control--overlaid',
    '[class*="play-button"]', '[class*="playButton"]', '[id*="play"]', 'video'
];

// Приоритет форматов: HLS удобнее всего для mpv
function rank(url) {
    if (/\.m3u8(\?|$)/i.test(url)) return 3;
    if (/\.mpd(\?|$)/i.test(url)) return 2;
    return 1;
}

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

// Браузер живёт между извлечениями: запуск стоит секунды, и платить их
// на каждой серии незачем
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
            // Ускорение старта и загрузки страницы
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

// Прогрев: запуск браузера — самая долгая часть, поэтому начинаем его
// заранее, пока пользователь выбирает плеер и озвучку
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
    var found = [];
    var page = null;

    var browser = await getBrowser(!!options.headful);

    try {
        page = await browser.newPage();
        await page.setUserAgent(api.USER_AGENT);
        await page.setViewport({ width: 1280, height: 720 });

        // Как только манифест пойман, ждать больше нечего
        var announce = null;
        var firstManifest = new Promise(function (resolve) { announce = resolve; });

        // Режем всё, что не приближает к манифесту: картинки, шрифты,
        // рекламу и сами видеосегменты
        await page.setRequestInterception(true);

        page.on('request', function (request) {
            var url = request.url();
            var type = request.resourceType();

            if (MEDIA_RE.test(url) && !JUNK_RE.test(url)) {
                var frame = null;
                try { frame = request.frame(); } catch (err) { /* фрейм уже мёртв */ }

                var known = found.some(function (item) { return item.url === url; });

                if (!known) {
                    found.push({
                        url: url,
                        referer: frame && frame.url() && frame.url() !== 'about:blank'
                            ? frame.url()
                            : iframeUrl
                    });

                    if (rank(url) === 3) announce();
                }

                // Сам манифест забирать не нужно — ссылка уже у нас
                request.abort().catch(function () { });
                return;
            }

            if (SKIP_TYPES[type] || AD_HOST_RE.test(url)) {
                request.abort().catch(function () { });
                return;
            }

            request.continue().catch(function () { });
        });

        // Загрузку не дожидаемся: тыкать плеер можно уже по DOMContentLoaded
        page.goto(iframeUrl, {
            referer: options.referer || 'https://kinobox.tv/',
            waitUntil: 'domcontentloaded',
            timeout: Math.min(timeoutMs, 30000)
        }).catch(function () { /* часть страниц не досылает load — ждём по сети */ });

        // Тыкаем плеер часто, но без наложения вызовов друг на друга
        var poking = false;

        var poker = setInterval(function () {
            if (poking) return;
            poking = true;
            pokePlayers(page).catch(function () { }).then(function () { poking = false; });
        }, 350);

        try {
            await Promise.race([firstManifest, sleep(timeoutMs)]);
        } finally {
            clearInterval(poker);
        }

        // Если пойман только mp4, даём короткую фору — вдруг следом придёт HLS
        var hasManifest = found.some(function (item) { return rank(item.url) === 3; });

        if (found.length > 0 && !hasManifest) {
            await Promise.race([firstManifest, sleep(700)]);
        }
    } finally {
        if (page) await page.close().catch(function () { });
    }

    if (found.length === 0) {
        return null;
    }

    // Берём лучший формат, при равенстве — самый первый пойманный
    found.sort(function (a, b) { return rank(b.url) - rank(a.url); });
    var best = found[0];
    var refererOrigin = new URL(best.referer).origin;

    return {
        url: best.url,
        referer: refererOrigin + '/',
        origin: refererOrigin,
        userAgent: api.USER_AGENT,
        candidates: found.map(function (item) { return item.url; })
    };
}

// Разбор мастер-плейлиста HLS: какие качества вообще предлагает балансер.
// Возвращает пустой массив, если это уже медиа-плейлист или не HLS.
async function readVariants(stream) {
    if (!/\.m3u8(\?|$)/i.test(stream.url)) return [];

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
            url: new URL(target, stream.url).toString()
        });
    }

    // Лучшее качество сверху
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
    warmup: warmup,
    shutdown: shutdown
};
