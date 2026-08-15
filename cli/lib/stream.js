'use strict';

// Извлечение прямой ссылки на поток из iframe балансера.
//
// Балансеры (Alloha, Collaps, Videocdn, Kodik и прочие) не отдают ссылку на
// плейлист в открытом виде: она собирается их обфусцированным JS уже в браузере.
// Разбирать каждый по отдельности бессмысленно — они постоянно меняются.
// Поэтому открываем iframe в headless Chromium и слушаем сетевые запросы:
// первый .m3u8/.mpd/.mp4 и есть искомый поток.

var api = require('./api');

// Что считаем потоком
var MEDIA_RE = /\.(m3u8|mpd|mp4)(\?|$)/i;

// Мусор, который иногда пролетает в тех же расширениях (реклама, превью, трейлеры)
var JUNK_RE = /(vast|vpaid|adv?[-_/]|\/ads?\/|banner|preroll|midroll|promo|trailer|thumb|sprite|preview)/i;

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

    var puppeteer = loadPuppeteer();
    var timeoutMs = options.timeout || 40000;
    var found = [];
    var browser = null;

    try {
        browser = await puppeteer.launch({
            headless: !options.headful,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--autoplay-policy=no-user-gesture-required',
                '--mute-audio',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        var page = await browser.newPage();
        await page.setUserAgent(api.USER_AGENT);
        await page.setViewport({ width: 1280, height: 720 });

        // Собираем все медиа-запросы вместе с фреймом, который их сделал:
        // именно его origin потом уйдёт в mpv как Referer
        var seen = new Set();

        page.on('request', function (request) {
            var url = request.url();
            if (!MEDIA_RE.test(url) || JUNK_RE.test(url) || seen.has(url)) return;
            seen.add(url);

            var frame = null;
            try { frame = request.frame(); } catch (err) { /* фрейм уже мёртв */ }

            found.push({
                url: url,
                referer: frame && frame.url() && frame.url() !== 'about:blank' ? frame.url() : iframeUrl
            });
        });

        await page.goto(iframeUrl, {
            referer: options.referer || 'https://kinobox.tv/',
            waitUntil: 'domcontentloaded',
            timeout: Math.min(timeoutMs, 30000)
        }).catch(function () { /* часть страниц не досылает load — ждём по сети ниже */ });

        // Опрашиваем страницу, пока не появится поток или не выйдет время
        var deadline = Date.now() + timeoutMs;

        while (found.length === 0 && Date.now() < deadline) {
            await pokePlayers(page);
            await new Promise(function (resolve) { setTimeout(resolve, 1200); });
        }

        // Даём секунду на догрузку — вдруг после mp4-заглушки придёт нормальный m3u8
        if (found.length > 0) {
            await new Promise(function (resolve) { setTimeout(resolve, 1000); });
        }
    } finally {
        if (browser) {
            await browser.close().catch(function () { });
        }
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

module.exports = {
    resolveStream: resolveStream
};
