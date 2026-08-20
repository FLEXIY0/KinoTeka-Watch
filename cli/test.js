'use strict';

// Тесты ktw. Делятся на две части:
//
//   офлайн — гоняются всегда, на записанных ответах балансеров из cli/fixtures.
//            Именно здесь закрыты обе поломки: звук пропадал при выборе
//            качества, а балансеры кроме Collaps молча не работали;
//   живые  — требуют доступа к сети и балансерам. Если провайдер или регион
//            их режет, тест не падает, а честно помечается пропущенным:
//            иначе непонятно, сломан код или закрыт доступ.
//
// Запуск: bun cli/test.js [--live] [--only=<подстрока>]

var fs = require('fs');
var path = require('path');

var extractors = require('./lib/extractors');
var stream = require('./lib/stream');
var http = require('./lib/http');
var config = require('./lib/config');
var mpv = require('./lib/mpv');
var history = require('./lib/history');
var doctor = require('./lib/doctor');
var api = require('./lib/api');

var passed = 0;
var failed = 0;
var skipped = 0;

var argv = process.argv.slice(2);
var wantLive = argv.indexOf('--live') >= 0;
var onlyArg = argv.find(function (a) { return a.indexOf('--only=') === 0; });
var only = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : '';

function group(title) {
    console.log('\n\x1b[36m' + title + '\x1b[0m');
}

function assert(condition, message) {
    if (condition) {
        console.log('  \x1b[32m✓\x1b[0m ' + message);
        passed++;
    } else {
        console.error('  \x1b[31m✗\x1b[0m ' + message);
        failed++;
    }
}

function skip(message, why) {
    console.log('  \x1b[2m·\x1b[0m ' + message + ' \x1b[2m(' + why + ')\x1b[0m');
    skipped++;
}

function fixture(name) {
    return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function wanted(title) {
    return !only || title.toLowerCase().indexOf(only) >= 0;
}

// Подменяем fetch на заранее записанные ответы: тесты разбора не должны
// зависеть ни от сети, ни от того, пускает ли балансер наш регион.
function withStubbedFetch(routes, run) {
    var original = globalThis.fetch;

    globalThis.fetch = async function (url) {
        var target = String(url);
        var key = Object.keys(routes).find(function (part) { return target.indexOf(part) >= 0; });

        if (!key) return new Response('not stubbed: ' + target, { status: 599 });

        var route = routes[key];

        return new Response(route.body, { status: route.status || 200, headers: route.headers || {} });
    };

    return Promise.resolve()
        .then(run)
        .finally(function () { globalThis.fetch = original; });
}

// ---------- офлайн: разбор мастер-плейлиста и звук ----------

async function testMasterPlaylist() {
    group('Мастер-плейлист и звуковые дорожки');

    var text = fixture('master-multiaudio.m3u8');
    var variants = stream.parseMaster(text, 'https://cdn.example.com/a/b/master.m3u8?pl=TESTSIG');

    assert(variants.length === 3, 'разобраны все три качества (' + variants.length + ')');
    assert(variants[0].label === '1080p' && variants[1].label === '720p' && variants[2].label === '480p',
        'качества подписаны по ширине кадра: ' + variants.map(function (v) { return v.label; }).join(', '));

    assert(variants[0].audioGroup === 'audio1080' && variants[1].audioGroup === 'audio720',
        'каждое качество ссылается на свою группу звука');

    assert(variants[0].audioTracks.length > 0 && variants[1].audioTracks.length > 0,
        'дорожки озвучки привязаны к качеству (' + variants[0].audioTracks.length + ' шт.)');

    assert(variants[0].audioTracks.every(function (t) { return t.group === 'audio1080'; }),
        'в 1080p попали только дорожки его группы, а не все подряд');

    assert(variants[0].audioSeparate === true,
        'звук распознан как отдельные рендиции — вариант качества сам по себе немой');

    assert(variants[0].subtitles.length === 2, 'субтитры разобраны (' + variants[0].subtitles.length + ')');

    var ids = variants[0].audioTracks.map(function (t) { return t.audioId; });
    assert(ids.join(',') === '1,2,3', 'дорожки пронумерованы с единицы, как их считает mpv: ' + ids.join(','));
}

async function testNoSoundRegression() {
    group('Регрессия: пропадал звук при выборе качества');

    var text = fixture('master-multiaudio.m3u8');
    var masterUrl = 'https://cdn.example.com/a/b/master.m3u8?pl=TESTSIG';
    var variants = stream.parseMaster(text, masterUrl);
    var base = { url: masterUrl, referer: 'https://h/', origin: 'https://h', audioTracks: [], subtitles: [] };

    var hd = variants.find(function (v) { return v.label === '720p'; });
    var applied = stream.applyVariant(base, hd);

    assert(applied.url === masterUrl,
        'после выбора 720p URL остался мастер-плейлистом, а не немой видеодорожкой');
    assert(applied.url.indexOf('index-v') < 0,
        'в mpv не уходит index-v*.m3u8 — ровно этот файл и был без звука');
    assert(applied.hlsBitrate === hd.bandwidth,
        'качество задано через --hls-bitrate=' + applied.hlsBitrate);
    assert(applied.audioTracks.length === hd.audioTracks.length,
        'дорожки озвучки выбранного качества доехали до плеера');

    var args = mpv.buildArgs(applied, 'Тест');
    assert(args.indexOf('--hls-bitrate=' + hd.bandwidth) >= 0, 'mpv получает --hls-bitrate');
    assert(args[args.length - 1] === masterUrl, 'последним аргументом mpv идёт мастер-плейлист');

    // Когда звук вшит в сам вариант, подменять URL по-прежнему правильно
    var muxed = {
        label: '720p', url: 'https://cdn/v720.m3u8', bandwidth: 100,
        audioSeparate: false, audioTracks: [], subtitles: []
    };
    var appliedMuxed = stream.applyVariant(base, muxed);
    assert(appliedMuxed.url === 'https://cdn/v720.m3u8' && !appliedMuxed.hlsBitrate,
        'если звук вшит в дорожку качества, играем саму дорожку');
}

async function testAudioMatching() {
    group('Выбор озвучки по названию');

    var variants = stream.parseMaster(fixture('master-multiaudio.m3u8'), 'https://cdn/m.m3u8');
    var tracks = variants[0].audioTracks;

    var dub = stream.matchAudioTrack(tracks, 'Дубляж');
    assert(dub && dub.audioId === 2, 'озвучка «Дубляж» нашлась под номером ' + (dub && dub.audioId));

    var numbered = stream.matchAudioTrack(tracks, '01. Многоголосый. Jask');
    assert(numbered && numbered.audioId === 1, 'номер в начале названия не мешает сопоставлению');

    assert(stream.matchAudioTrack(tracks, 'Такой озвучки нет') === null,
        'несуществующая озвучка возвращает null, а не случайную дорожку');

    assert(stream.matchAudioTrack([], 'Дубляж') === null, 'пустой список дорожек не ломает выбор');
}

async function testMpvArgs() {
    group('Аргументы mpv');

    var socket = '/tmp/ktw-mpv-test.sock';
    var args = mpv.buildArgs({
        url: 'https://cdn/master.m3u8',
        referer: 'https://h/',
        origin: 'https://h',
        audioId: 3,
        audioTracks: [{}, {}, {}],
        startTime: 1450,
        subtitleUrl: 'https://cdn/subs.vtt'
    }, 'Матрица (1999)', ['--volume=80'], socket);

    assert(args.indexOf('--input-ipc-server=' + socket) >= 0, 'есть --input-ipc-server для таймкода');
    assert(args.indexOf('--start=1450') >= 0, 'есть --start=1450 для возобновления');
    assert(args.indexOf('--aid=3') >= 0, 'есть --aid=3 для звуковой дорожки');
    assert(args.some(function (a) { return a.indexOf('--sub-file=') === 0; }), 'подключены субтитры');
    assert(args.indexOf('--volume=80') >= 0, 'проброшены пользовательские аргументы');

    // Именно так и получался немой mpv: --aid на дорожку, которой нет
    var bad = mpv.buildArgs({
        url: 'u', referer: 'r', origin: 'o', audioId: 15, audioTracks: [{}, {}]
    }, 'T');
    assert(!bad.some(function (a) { return a.indexOf('--aid=') === 0; }),
        '--aid за пределами списка дорожек отбрасывается, а не отдаётся mpv');

    var external = mpv.buildArgs({ url: 'u', referer: 'r', origin: 'o', audioUrl: 'https://cdn/a.m3u8' }, 'T');
    assert(external.indexOf('--audio-file=https://cdn/a.m3u8') >= 0,
        'отдельный звук цепляется через --audio-file');
}

// ---------- офлайн: балансеры ----------

async function testVeoveoOffline() {
    group('Балансер Veoveo (записанные ответы)');

    var iframeUrl = 'https://tazaromikaz.link/balancer-api/iframe?movie_id=15652&token=TEST.API.TOKEN';
    var seenHeaders = null;
    var original = globalThis.fetch;

    globalThis.fetch = async function (url, options) {
        var target = String(url);

        if (target.indexOf('/balancer-api/iframe') >= 0) {
            return new Response(fixture('veoveo-iframe.html'), { status: 200 });
        }

        if (target.indexOf('/catalog-api/episodes') >= 0) {
            seenHeaders = (options && options.headers) || {};
            return new Response(fixture('veoveo-episodes.json'), { status: 200 });
        }

        return new Response('unexpected ' + target, { status: 599 });
    };

    try {
        var errors = [];
        var found = await extractors.extractDirectStream(iframeUrl, { errors: errors });

        assert(!!found && !!found.url, 'поток извлечён без браузера' +
            (errors.length ? ' (' + errors[0].message + ')' : ''));
        assert(found && found.type === 'veoveo', 'сработал именно экстрактор Veoveo');
        assert(found && /\.m3u8/.test(found.url),
            'получена ссылка на HLS: ' + String(found && found.url).slice(0, 60));
        assert(seenHeaders && seenHeaders['DLE-API-TOKEN'] === 'TEST.API.TOKEN',
            'в catalog-api ушёл DLE-API-TOKEN со страницы плеера');
        assert(seenHeaders && seenHeaders['Iframe-Request-Id'] === 'test-request-id',
            'ушёл и Iframe-Request-Id — он вшит в подписанный путь плейлиста');
        assert(found && found.variantTracks && found.variantTracks.length > 0,
            'список дорожек балансера разобран (' + (found && found.variantTracks.length) + ')');
    } finally {
        globalThis.fetch = original;
    }
}

async function testGeoBlock() {
    group('Отказ по региону');

    var body = fixture('geo-blocked.html');

    assert(http.detectRefusal(410, body) === 'geo', 'страница «недоступно для вашего региона» распознана');
    assert(http.detectRefusal(403, '') === 'forbidden', 'HTTP 403 без текста — отказ балансера');
    assert(http.detectRefusal(200, '') === null, 'нормальный ответ не считается отказом');

    var errors = [];

    await withStubbedFetch({ 'ortified': { body: body, status: 410 } }, async function () {
        var found = await extractors.extractDirectStream('https://api.ortified.ws/embed/movie/474', { errors: errors });
        assert(found === null, 'при отказе по региону поток не выдумывается');
    });

    assert(errors.length > 0 && errors[0].code === 'geo',
        'причина отказа — регион, а не «поток не найден»');
    assert(errors.length > 0 && /регион/i.test(errors[0].message),
        'сообщение объясняет причину: ' + (errors[0] && errors[0].message));
    assert(errors.length === 1, 'после отказа по региону другие парсеры не дёргаются впустую');
}

async function testGenericExtractor() {
    group('Универсальный разбор и вложенный iframe');

    var page = '<html><body><script>var f="https:\\/\\/cdn.example.com\\/hls\\/master.m3u8?t=1";</script></body></html>';

    await withStubbedFetch({ 'obrut.show': { body: page } }, async function () {
        var found = await extractors.extractDirectStream('https://3a41cf05.obrut.show/embed/kzM/content/QDNxQzM', {});
        assert(!!found && found.url === 'https://cdn.example.com/hls/master.m3u8?t=1',
            'плейлист с экранированными слэшами разобран: ' + (found && found.url));
    });

    var outer = '<html><body><iframe src="https://inner.example.com/p"></iframe></body></html>';
    var inner = '<html><body><script>hls:"https://inner.example.com/x/master.m3u8"</script></body></html>';

    await withStubbedFetch({
        'outer.example.com': { body: outer },
        'inner.example.com': { body: inner }
    }, async function () {
        var found = await extractors.extractDirectStream('https://outer.example.com/embed', {});
        assert(!!found && found.url === 'https://inner.example.com/x/master.m3u8',
            'спуск во вложенный iframe работает');
    });

    var ads = '<html><script>src="https://ads.example.com/preroll/master.m3u8"</script></html>';
    assert(extractors.scanPlaylists(ads).length === 0, 'рекламный плейлист отбрасывается');
}

async function testKodikDecode() {
    group('Раскодирование ссылок Kodik');

    var plain = '//cloud.kodik-storage.com/useruploads/abc/720.mp4:hls:manifest.m3u8';
    var encoded = Buffer.from(plain, 'utf8').toString('base64')
        .replace(/[a-zA-Z]/g, function (ch) {
            var base = ch <= 'Z' ? 65 : 97;
            // обратный сдвиг на 13 — так их кодирует плеер
            return String.fromCharCode((ch.charCodeAt(0) - base + 13) % 26 + base);
        });

    var decoded = extractors.kodikDecode(encoded);
    assert(decoded === 'https:' + plain,
        'сдвиг подобран и ссылка раскодирована: ' + String(decoded).slice(0, 50));
    assert(extractors.kodikDecode('не-база64-совсем') === null, 'мусор не превращается в ссылку');
}

async function testRouting() {
    group('Определение балансеров');

    assert(extractors.isDirectSupported('Collaps', 'https://api.ortified.ws/embed/movie/474'), 'Collaps распознан');
    assert(extractors.isDirectSupported('Veoveo', 'https://tazaromikaz.link/balancer-api/iframe?movie_id=1'), 'Veoveo распознан');
    assert(extractors.isDirectSupported('Alloha', 'https://theatre.stravers.live/?token=1'), 'Alloha распознан');
    assert(extractors.isDirectSupported('Turbo', 'https://3a41cf05.obrut.show/embed/kzM/content/x'),
        'Turbo распознан — раньше он вообще не считался поддерживаемым');
    assert(extractors.isDirectSupported('Kodik', 'https://kodik.info/seria/1/abc/720p'), 'Kodik распознан');
    assert(!extractors.isDirectSupported('Неизвестный', 'https://example.com/embed'), 'чужой хост не помечается ⚡');
}

// ---------- офлайн: доктор, конфиг, история ----------

async function testDoctor() {
    group('Доктор');

    var result = await doctor.run('quick');

    assert(Array.isArray(result.checks) && result.checks.length >= 5,
        'быстрая проверка прогоняет локальные пункты (' + result.checks.length + ')');

    var runtime = result.checks.find(function (c) { return c.name === 'рантайм'; });
    assert(runtime && runtime.status === 'ok' && /bun/.test(runtime.detail),
        'рантайм определён как bun: ' + (runtime && runtime.detail));

    var browser = result.checks.find(function (c) { return c.name === 'браузер'; });
    assert(!!browser, 'доктор отдельно проверяет, что браузер не нужен');

    var hintless = result.checks.filter(function (item) {
        return item.status === 'fail' && !item.hint;
    });
    assert(hintless.length === 0, 'у каждой поломки есть подсказка, чем лечить');

    var allGood = { checks: [{ name: 'x', status: 'ok', detail: '' }], failed: [], warned: [], ok: true };
    assert(doctor.render(allGood, { brief: true }) === '',
        'когда всё на месте, краткий режим молчит — установщику нечего печатать');

    var problem = { name: 'mpv', status: 'fail', detail: 'нет', hint: 'поставь mpv' };
    var broken = { checks: [problem], failed: [problem], warned: [], ok: false };
    var text = doctor.render(broken, { brief: true, color: false });

    assert(text.indexOf('mpv') >= 0 && text.indexOf('поставь mpv') >= 0,
        'краткий режим печатает поломку вместе с подсказкой');
}

async function testConfigAndHistory() {
    group('Конфигурация и история');

    var initial = config.read();
    assert(typeof initial === 'object' && initial.mpvHardwareDec !== undefined, 'конфигурация читается');

    config.save({ preferredQuality: '1080' });
    assert(config.read().preferredQuality === '1080', 'preferredQuality сохраняется');
    config.save({ preferredQuality: initial.preferredQuality || '' });

    assert(history.formatTime(3665) === '01:01:05', 'formatTime: 3665 с -> 01:01:05');
    assert(history.formatTime(125) === '02:05', 'formatTime: 125 с -> 02:05');

    history.saveProgress({
        filmId: 999999, title: 'Тестовый Фильм', year: '2026', serial: false,
        timePos: 1200, duration: 3600, player: 'Veoveo', translation: 'Дубляж'
    });

    var saved = history.getProgress(999999);
    assert(!!saved && saved.timePos === 1200, 'прогресс фильма сохранён');
    assert(saved.percentage === 33, 'процент просмотра посчитан (33%)');

    history.saveProgress({
        filmId: 999998, title: 'Сериал', serial: true, season: 1, episode: 3,
        timePos: 2800, duration: 3000
    });
    assert(history.isEpisodeWatched(999998, 1, 3) === true, 'серия помечена просмотренной');
    assert(history.isEpisodeWatched(999998, 1, 4) === false, 'непросмотренная серия — false');

    history.resetSerial(999998);
    assert(history.getWatchedEpisodesCount(999998) === 0, 'resetSerial сбрасывает прогресс');

    history.remove(999999);
    history.remove(999998);
    assert(history.getProgress(999999) === null, 'тестовые записи удалены');

    var i18n = require('./lib/i18n');
    assert(i18n.t('search_field', 'ru') === 'Поиск' && i18n.t('search_field', 'en') === 'Search',
        'локализация работает');
}

async function testQualityPick() {
    group('Выбор качества');

    var variants = stream.parseMaster(fixture('master-multiaudio.m3u8'), 'https://cdn/m.m3u8');

    assert(stream.pickVariant(variants, '1080').label === '1080p', '1080 -> 1080p');
    assert(stream.pickVariant(variants, 'max').label === '1080p', 'max -> самое высокое');
    assert(stream.pickVariant(variants, 'min').label === '480p', 'min -> самое низкое');
    assert(stream.pickVariant(variants, '720').label === '720p', '720 -> 720p');
    assert(stream.pickVariant([], '720') === null, 'пустой список -> null');
}

// ---------- живые проверки ----------

async function testLive() {
    group('Живые балансеры (нужен доступ к сети и российский регион)');

    if (!wantLive) {
        skip('живые проверки', 'запусти с --live');
        return;
    }

    var players;

    try {
        players = await api.getPlayers(doctor.PROBE_FILM);
        assert(players.length > 0, 'Kinobox отдал список плееров (' + players.length + ')');
    } catch (err) {
        skip('список плееров', err.message);
        return;
    }

    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        var errors = [];
        var found = null;

        try {
            found = await extractors.extractDirectStream(player.iframeUrl, { timeout: 15000, errors: errors });
        } catch (err) {
            errors.push(err);
        }

        if (found && found.url) {
            assert(true, 'балансер ' + player.source + ' отдал поток');

            var variants = await stream.readVariants(found);

            if (variants.length > 0) {
                assert(variants[0].audioTracks.length > 0 || !variants[0].audioSeparate,
                    'у ' + player.source + ' звук доступен для выбранного качества');
            }

            continue;
        }

        var reason = errors[0];

        if (reason && (reason.code === 'geo' || reason.code === 'network' || reason.code === 'timeout')) {
            skip('балансер ' + player.source, reason.message);
            continue;
        }

        assert(false, 'балансер ' + player.source + ': ' + (reason ? reason.message : 'не отдал поток'));
    }
}

// ---------- запуск ----------

var SUITES = [
    ['Мастер-плейлист', testMasterPlaylist],
    ['Звук', testNoSoundRegression],
    ['Озвучки', testAudioMatching],
    ['mpv', testMpvArgs],
    ['Veoveo', testVeoveoOffline],
    ['Регион', testGeoBlock],
    ['Универсальный разбор', testGenericExtractor],
    ['Kodik', testKodikDecode],
    ['Маршрутизация', testRouting],
    ['Доктор', testDoctor],
    ['Конфиг', testConfigAndHistory],
    ['Качество', testQualityPick],
    ['Живые', testLive]
];

async function runTests() {
    console.log('\n\x1b[1m=== Тесты ktw ===\x1b[0m');

    for (var i = 0; i < SUITES.length; i++) {
        if (!wanted(SUITES[i][0])) continue;
        await SUITES[i][1]();
    }

    console.log('\n======================================');
    console.log('Успешно: \x1b[32m' + passed + '\x1b[0m | Ошибок: \x1b[31m' + failed +
        '\x1b[0m | Пропущено: \x1b[2m' + skipped + '\x1b[0m');
    console.log('======================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(function (err) {
    console.error('\nОшибка выполнения тестов:', err);
    process.exit(1);
});
