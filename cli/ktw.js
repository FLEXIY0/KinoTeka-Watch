#!/usr/bin/env node
'use strict';

// ktw — CLI для KinoTeka Watch.
// Повторяет цепочку сайта: поиск на Кинопоиске -> список плееров Kinobox ->
// извлечение прямого потока -> воспроизведение в mpv.

var fs = require('fs');
var path = require('path');
var os = require('os');

var api = require('./lib/api');
var ui = require('./lib/ui');
var stream = require('./lib/stream');
var mpv = require('./lib/mpv');

var HELP = [
    '',
    ui.color.bold('ktw') + ' — смотреть фильмы из KinoTeka Watch в mpv',
    '',
    ui.color.bold('Использование:'),
    '  ktw <запрос>              поиск и выбор фильма',
    '  ktw <id кинопоиска>       открыть фильм по id',
    '  ktw <ссылка на кинопоиск> открыть фильм по ссылке',
    '  ktw                       спросить запрос интерактивно',
    '',
    ui.color.bold('Опции:'),
    '  -p, --player <тип>   взять плеер по имени (alloha, collaps, kodik, …)',
    '  -s, --season <n>     номер сезона',
    '  -e, --episode <n>    номер серии',
    '      --iframe         не искать поток, просто показать ссылку на плеер',
    '      --no-mpv         найти поток, но не запускать mpv',
    '      --json           вывести результат в JSON (для скриптов)',
    '      --headful        показать окно браузера (отладка извлечения)',
    '      --timeout <мс>   сколько ждать поток, по умолчанию 40000',
    '      --key <ключ>     ключ API Кинопоиска',
    '  -h, --help           эта справка',
    '',
    ui.color.bold('Ключ API:'),
    '  Берётся из --key, переменной KINOPOISK_API_KEY, файла kinopoisk-key.js',
    '  в корне проекта или из ~/.config/ktw/config.json.',
    '',
    ui.color.bold('Примеры:'),
    '  ktw матрица',
    '  ktw "во все тяжкие" -s 1 -e 3',
    '  ktw 301 --player alloha --no-mpv',
    ''
].join('\n');

// Разбор аргументов командной строки
function parseArgs(argv) {
    var options = {
        query: [],
        player: null,
        season: null,
        episode: null,
        iframe: false,
        noMpv: false,
        json: false,
        headful: false,
        timeout: 40000,
        key: null,
        help: false,
        mpvArgs: []
    };

    for (var i = 0; i < argv.length; i++) {
        var arg = argv[i];

        // Всё после -- уходит напрямую в mpv
        if (arg === '--') {
            options.mpvArgs = argv.slice(i + 1);
            break;
        }

        if (arg === '-h' || arg === '--help') options.help = true;
        else if (arg === '-p' || arg === '--player') options.player = argv[++i];
        else if (arg === '-s' || arg === '--season') options.season = argv[++i];
        else if (arg === '-e' || arg === '--episode') options.episode = argv[++i];
        else if (arg === '--iframe') options.iframe = true;
        else if (arg === '--no-mpv') options.noMpv = true;
        else if (arg === '--json') options.json = true;
        else if (arg === '--headful') options.headful = true;
        else if (arg === '--timeout') options.timeout = parseInt(argv[++i], 10) || 40000;
        else if (arg === '--key') options.key = argv[++i];
        else options.query.push(arg);
    }

    options.query = options.query.join(' ').trim();

    return options;
}

// Поиск ключа API: аргумент -> окружение -> локальный kinopoisk-key.js -> конфиг
function resolveApiKey(explicitKey) {
    if (explicitKey) return explicitKey;
    if (process.env.KINOPOISK_API_KEY) return process.env.KINOPOISK_API_KEY;

    var localKeyFile = path.join(__dirname, '..', 'kinopoisk-key.js');
    if (fs.existsSync(localKeyFile)) {
        var match = fs.readFileSync(localKeyFile, 'utf8').match(/KINOPOISK_API_KEY\s*=\s*['"]([^'"]+)['"]/);
        if (match) return match[1];
    }

    var configFile = path.join(os.homedir(), '.config', 'ktw', 'config.json');
    if (fs.existsSync(configFile)) {
        try {
            var config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            if (config.kinopoiskApiKey) return config.kinopoiskApiKey;
        } catch (err) {
            ui.error('Не удалось прочитать ' + configFile + ': ' + err.message);
        }
    }

    return null;
}

// id Кинопоиска из аргумента: число или ссылка вида kinopoisk.ru/film/301/
function extractFilmId(query) {
    if (/^\d+$/.test(query)) return query;

    var match = query.match(/kinopoisk\.[a-z]+\/(?:film|series)\/(\d+)/i);
    return match ? match[1] : null;
}

// Выбор фильма: по id напрямую или через поиск со списком
async function pickFilm(options, apiKey) {
    var directId = extractFilmId(options.query);
    if (directId) {
        return { id: directId, title: 'Кинопоиск #' + directId, year: '' };
    }

    var query = options.query;
    if (!query) {
        query = await ui.prompt('Что смотрим?');
        if (!query) return null;
    }

    var searchSpinner = ui.spinner('Ищу «' + query + '»');
    var films;

    try {
        films = await api.searchFilms(query, apiKey);
    } finally {
        searchSpinner.stop();
    }

    if (films.length === 0) {
        ui.error('Ничего не найдено по запросу «' + query + '»');
        return null;
    }

    var items = films.map(function (film) {
        var meta = [film.year, film.type, film.rating ? '★ ' + film.rating : ''].filter(Boolean);
        return { label: film.title, hint: meta.join(' · ') };
    });

    var index = await ui.select('Найдено ' + films.length + ':', items);
    return index < 0 ? null : films[index];
}

// Выбор плеера: по --player или через список
async function pickPlayer(film, options) {
    var playersSpinner = ui.spinner('Загружаю плееры');
    var players;

    try {
        players = await api.getPlayers(film.id);
    } finally {
        playersSpinner.stop();
    }

    if (players.length === 0) {
        ui.error('Для этого фильма нет доступных плееров');
        return null;
    }

    if (options.player) {
        var wanted = options.player.toLowerCase();
        var match = players.filter(function (player) {
            return player.source.toLowerCase().indexOf(wanted) === 0;
        })[0];

        if (!match) {
            ui.error('Плеер «' + options.player + '» недоступен. Есть: ' +
                players.map(function (p) { return p.source; }).join(', '));
            return null;
        }

        return match;
    }

    var items = players.map(function (player) {
        return {
            label: player.source,
            hint: player.translation + ' · ' + player.quality
        };
    });

    var index = await ui.select('Плееры для «' + film.title + '»:', items);
    return index < 0 ? null : players[index];
}

async function run(options) {
    var apiKey = resolveApiKey(options.key);

    var film = await pickFilm(options, apiKey);
    if (!film) return 1;

    var player = await pickPlayer(film, options);
    if (!player) return 1;

    var iframeUrl = api.withEpisode(player.iframeUrl, options.season, options.episode);

    // Режим --iframe: поток не ищем, отдаём ссылку на плеер как есть
    if (options.iframe) {
        if (options.json) {
            process.stdout.write(JSON.stringify({ film: film, player: player, iframeUrl: iframeUrl }, null, 2) + '\n');
        } else {
            ui.info(ui.color.green('▸ ') + player.source + ' · ' + player.translation);
            process.stdout.write(iframeUrl + '\n');
        }
        return 0;
    }

    var streamSpinner = ui.spinner('Достаю поток из ' + player.source);
    var found;

    try {
        found = await stream.resolveStream(iframeUrl, {
            timeout: options.timeout,
            headful: options.headful
        });
    } finally {
        streamSpinner.stop();
    }

    if (!found) {
        ui.error('Поток не найден за ' + Math.round(options.timeout / 1000) + ' с.');
        ui.info(ui.color.dim('  Попробуй другой плеер, --timeout побольше или --headful для отладки.'));
        ui.info(ui.color.dim('  Ссылка на плеер: ' + iframeUrl));
        return 1;
    }

    var title = film.title + (film.year ? ' (' + film.year + ')' : '');

    if (options.json) {
        process.stdout.write(JSON.stringify({
            film: film,
            player: player,
            stream: found,
            command: mpv.buildCommand(found, title, options.mpvArgs)
        }, null, 2) + '\n');
        return 0;
    }

    ui.info(ui.color.green('▸ ') + title + ' · ' + player.source + ' · ' + player.quality);

    if (options.noMpv) {
        process.stdout.write(found.url + '\n');
        ui.info(ui.color.dim('  Referer: ' + found.referer));
        ui.info(ui.color.dim('  ' + mpv.buildCommand(found, title, options.mpvArgs)));
        return 0;
    }

    try {
        return await mpv.play(found, title, options.mpvArgs);
    } catch (err) {
        ui.error(err.message);
        ui.info(ui.color.dim('  ' + mpv.buildCommand(found, title, options.mpvArgs)));
        return 1;
    }
}

async function main() {
    var options = parseArgs(process.argv.slice(2));

    if (options.help) {
        ui.info(HELP);
        return 0;
    }

    try {
        return await run(options);
    } catch (err) {
        ui.error(err.message);
        return 1;
    }
}

main().then(function (code) {
    process.exit(code);
});
