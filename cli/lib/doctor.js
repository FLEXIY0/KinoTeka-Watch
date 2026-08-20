'use strict';

// Доктор: проверяет по шагам всё, от чего зависит просмотр, и говорит, что
// именно сломалось. Нужен потому, что снаружи любая поломка выглядит одинаково
// («поток не найден»), хотя причины разные: нет mpv, протух ключ, зеркало
// Kinobox не отвечает, балансер закрыт для региона.
//
// Режимы:
//   quick — только локальные проверки, без сети; гоняется при каждом запуске
//           и молчит, пока всё на месте
//   brief — то же плюс сеть, печатает только проблемы (им пользуется установщик)
//   full  — полный отчёт по всем пунктам (ktw --doctor)

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var config = require('./config');
var cache = require('./cache');
var http = require('./http');
var api = require('./api');
var extractors = require('./extractors');

// Фильм для проверки балансеров: «Матрица», есть у всех
var PROBE_FILM = 301;

var KINOBOX_MIRRORS = [
    'https://fbphdplay.top/api/players',
    'https://api.kinobox.tv/api/players'
];

function check(name, status, detail, hint) {
    return { name: name, status: status, detail: detail || '', hint: hint || '' };
}

function which(command) {
    try {
        return execFileSync('sh', ['-c', 'command -v ' + command], { encoding: 'utf8' }).trim();
    } catch (err) {
        return '';
    }
}

function runQuiet(command, args) {
    try {
        return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (err) {
        return '';
    }
}

// ---------- локальные проверки ----------

function checkRuntime() {
    if (typeof Bun !== 'undefined' && Bun.version) {
        return check('рантайм', 'ok', 'bun ' + Bun.version);
    }

    return check('рантайм', 'fail', 'запущено не через bun',
        'ktw рассчитан только на Bun: curl -fsSL https://bun.sh/install | bash');
}

function checkMpv() {
    var found = which('mpv');

    if (!found) {
        return check('mpv', 'fail', 'не найден в PATH',
            'поставь mpv пакетным менеджером: apt install mpv / apk add mpv / pacman -S mpv');
    }

    var version = (runQuiet('mpv', ['--version']).split('\n')[0] || 'версия неизвестна').trim();

    // Без поддержки https mpv не откроет HLS, а балансеры отдают только его
    var protocols = runQuiet('mpv', ['--list-protocols']);

    if (protocols && protocols.indexOf('https') < 0) {
        return check('mpv', 'warn', version + ' — собран без https',
            'нужен mpv с поддержкой https/hls, иначе поток не откроется');
    }

    return check('mpv', 'ok', version);
}

function checkChromium() {
    var puppeteerDir = path.join(__dirname, '..', '..', 'node_modules', 'puppeteer');

    if (fs.existsSync(puppeteerDir)) {
        return check('браузер', 'warn', 'в node_modules остался puppeteer',
            'ktw больше не запускает Chromium — лишнее можно снести: bun install --production');
    }

    return check('браузер', 'ok', 'не нужен, всё берётся прямым парсингом');
}

function checkApiKey() {
    var key = config.resolveApiKey();

    if (!key) {
        return check('ключ Кинопоиска', 'fail', 'не задан',
            'бесплатный ключ: https://kinopoiskapiunofficial.tech, потом ktw и Ctrl+K');
    }

    return check('ключ Кинопоиска', 'ok', 'задан (' + key.slice(0, 4) + '…' + key.slice(-4) + ')');
}

function checkConfig() {
    try {
        fs.mkdirSync(config.CONFIG_DIR, { recursive: true });
        fs.accessSync(config.CONFIG_DIR, fs.constants.W_OK);
    } catch (err) {
        return check('настройки', 'fail', config.CONFIG_DIR + ' недоступен на запись',
            'проверь права: ls -ld ' + config.CONFIG_DIR);
    }

    return check('настройки', 'ok', config.file);
}

function checkCache() {
    if (process.env.KTW_NO_CACHE === '1') {
        return check('кеш ответов', 'warn', 'выключен через KTW_NO_CACHE=1',
            'убери KTW_NO_CACHE, если хочешь, чтобы поиск и список плееров не ходили в сеть каждый раз');
    }

    try {
        fs.mkdirSync(cache.CACHE_DIR, { recursive: true });
        fs.accessSync(cache.CACHE_DIR, fs.constants.W_OK);
    } catch (err) {
        return check('кеш ответов', 'warn', cache.CACHE_DIR + ' недоступен на запись',
            'без кеша всё работает, но каждый экран снова ходит в сеть');
    }

    var stats = cache.stats();

    return check('кеш ответов', 'ok', stats.entries + ' записей, ' +
        Math.round(stats.bytes / 1024) + ' КБ в ' + cache.CACHE_DIR);
}

function checkPath() {
    var found = which('ktw');

    if (!found) {
        return check('команда ktw', 'warn', 'не видна в PATH',
            'добавь каталог с ktw в PATH или перелогинься');
    }

    return check('команда ktw', 'ok', found);
}

// ---------- сетевые проверки ----------

async function checkMirrors() {
    var configured = config.resolveKinoboxApi();
    var mirrors = configured
        ? [configured].concat(KINOBOX_MIRRORS.filter(function (m) { return m !== configured; }))
        : KINOBOX_MIRRORS.slice();

    var reasons = [];

    for (var i = 0; i < mirrors.length; i++) {
        try {
            var res = await http.request(mirrors[i] + '?kinopoisk=' + PROBE_FILM, {
                referer: 'https://kinobox.tv/',
                origin: 'https://kinobox.tv',
                accept: 'application/json',
                timeout: 12000
            });

            if (res.ok && res.body.indexOf('iframeUrl') >= 0) {
                return check('список плееров', 'ok', http.hostOf(mirrors[i]) + ' отвечает');
            }

            reasons.push(http.hostOf(mirrors[i]) + ': HTTP ' + res.status);
        } catch (err) {
            reasons.push(err.message);
        }
    }

    return check('список плееров', 'fail', reasons.join('; '),
        'если у всех зеркал «соединение сброшено» — их режет провайдер: нужен VPN или своё зеркало через KTW_KINOBOX_API');
}

async function checkBalancers() {
    var players;

    try {
        players = await api.getPlayers(PROBE_FILM);
    } catch (err) {
        return [check('балансеры', 'skip', 'не проверял — не получен список плееров')];
    }

    var results = [];
    var geoSeen = false;

    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        var errors = [];
        var found = null;

        try {
            found = await extractors.extractDirectStream(player.iframeUrl, {
                timeout: 12000,
                errors: errors
            });
        } catch (err) {
            errors.push(err);
        }

        if (found && found.url) {
            results.push(check('балансер ' + player.source, 'ok', http.hostOf(found.url)));
            continue;
        }

        var reason = errors.length > 0 ? errors[0] : null;
        var code = reason ? reason.code : 'failed';

        if (code === 'geo') geoSeen = true;

        results.push(check('балансер ' + player.source,
            code === 'geo' ? 'warn' : 'fail',
            reason ? reason.message : 'не отдал поток'));
    }

    if (geoSeen) {
        results.push(check('регион', 'warn', 'часть балансеров закрыта для твоего IP',
            'включи VPN или прокси с российским адресом — балансеры отдают контент только на РФ и СНГ'));
    }

    return results;
}

async function checkApiKeyLive() {
    var key = config.resolveApiKey();
    if (!key) return null;

    try {
        var films = await api.searchFilms('матрица', key);
        return check('поиск Кинопоиска', 'ok', 'нашёл ' + films.length + ' результатов');
    } catch (err) {
        return check('поиск Кинопоиска', 'fail', err.message,
            /401|403|не принят/.test(err.message)
                ? 'ключ протух — заведи новый на kinopoiskapiunofficial.tech и введи по Ctrl+K'
                : '');
    }
}

// ---------- сборка ----------

async function run(mode) {
    mode = mode || 'full';

    var checks = [
        checkRuntime(),
        checkMpv(),
        checkChromium(),
        checkApiKey(),
        checkConfig(),
        checkCache(),
        checkPath()
    ];

    if (mode !== 'quick') {
        var live = await checkApiKeyLive();
        if (live) checks.push(live);

        checks.push(await checkMirrors());

        var balancers = await checkBalancers();
        balancers.forEach(function (item) { checks.push(item); });
    }

    var failed = checks.filter(function (item) { return item.status === 'fail'; });
    var warned = checks.filter(function (item) { return item.status === 'warn'; });

    return {
        mode: mode,
        checks: checks,
        failed: failed,
        warned: warned,
        ok: failed.length === 0
    };
}

var MARK = { ok: '✓', warn: '!', fail: '✗', skip: '·' };
var COLOR = { ok: '[32m', warn: '[33m', fail: '[31m', skip: '[2m' };
var DIM = '[2m';
var RESET = '[0m';

function line(item, colored) {
    var mark = MARK[item.status] || '·';
    var head = colored ? COLOR[item.status] + mark + RESET : mark;
    var text = '  ' + head + ' ' + item.name;

    if (item.detail) text += ' — ' + item.detail;

    return text;
}

// brief: молчим, пока всё в порядке; full: печатаем всё
function render(result, options) {
    options = options || {};

    var colored = options.color !== false;
    var brief = options.brief === true;
    var lines = [];

    if (brief && result.failed.length === 0 && result.warned.length === 0) {
        return '';
    }

    var shown = brief ? result.failed.concat(result.warned) : result.checks;

    lines.push(brief ? 'Доктор ktw — нашёл, что поправить:' : 'Доктор ktw');

    shown.forEach(function (item) {
        lines.push(line(item, colored));

        if (item.hint) {
            lines.push('      ' + (colored ? DIM : '') + item.hint + (colored ? RESET : ''));
        }
    });

    if (!brief) {
        lines.push('');
        lines.push(result.ok ? '  Всё на месте.' : '  Сломано пунктов: ' + result.failed.length);
    }

    return lines.join('\n');
}

module.exports = {
    run: run,
    render: render,
    PROBE_FILM: PROBE_FILM
};
