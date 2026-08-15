#!/usr/bin/env node
'use strict';

// ktw — терминальный клиент KinoTeka Watch.
// Повторяет цепочку сайта: поиск на Кинопоиске -> список плееров Kinobox ->
// извлечение прямого потока -> воспроизведение в mpv.
//
// По умолчанию запускается полноэкранный интерфейс (lib/app.js).
// Флаги --json/--no-mpv/--iframe и запуск без терминала уводят в простой
// построчный режим, пригодный для скриптов и пайпов.

var api = require('./lib/api');
var ui = require('./lib/ui');
var stream = require('./lib/stream');
var mpv = require('./lib/mpv');
var config = require('./lib/config');

var HELP = [
    '',
    ui.color.bold('ktw') + ' — смотреть фильмы из KinoTeka Watch в mpv',
    '',
    ui.color.bold('Использование:'),
    '  ktw                       полноэкранный интерфейс',
    '  ktw <запрос>              сразу с этим запросом в поле поиска',
    '  ktw <id кинопоиска>       открыть фильм по id',
    '  ktw <ссылка на кинопоиск> открыть фильм по ссылке',
    '',
    ui.color.bold('Опции:'),
    '  -p, --player <тип>   взять плеер по имени (alloha, collaps, turbo, …)',
    '  -t, --translation <имя>  взять озвучку по части названия',
    '  -s, --season <n>     номер сезона',
    '  -e, --episode <n>    номер серии',
    '      --iframe         не искать поток, просто показать ссылку на плеер',
    '      --no-mpv         найти поток, но не запускать mpv',
    '      --json           вывести результат в JSON (для скриптов)',
    '      --plain          построчный режим без полноэкранного интерфейса',
    '      --headful        показать окно браузера (отладка извлечения)',
    '      --timeout <мс>   сколько ждать поток, по умолчанию 40000',
    '      --key <ключ>     ключ API Кинопоиска',
    '  -h, --help           эта справка',
    '',
    ui.color.bold('Управление в интерфейсе:'),
    '  ↑/↓ — выбор, Enter — дальше, Esc — назад, Ctrl+C — выход',
    '',
    ui.color.bold('Ключ API:'),
    '  Берётся из --key, переменной KINOPOISK_API_KEY, файла kinopoisk-key.js',
    '  в корне проекта или из ~/.config/ktw/config.json.',
    '',
    ui.color.bold('Примеры:'),
    '  ktw',
    '  ktw матрица',
    '  ktw "во все тяжкие" -s 1 -e 3',
    '  ktw 301 --player alloha --no-mpv',
    '  ktw матрица -- --fs --sub-file=ru.srt',
    ''
].join('\n');

// Разбор аргументов командной строки
function parseArgs(argv) {
    var options = {
        query: [],
        player: null,
        translation: null,
        season: null,
        episode: null,
        iframe: false,
        noMpv: false,
        json: false,
        plain: false,
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
        else if (arg === '-t' || arg === '--translation') options.translation = argv[++i];
        else if (arg === '-s' || arg === '--season') options.season = argv[++i];
        else if (arg === '-e' || arg === '--episode') options.episode = argv[++i];
        else if (arg === '--iframe') options.iframe = true;
        else if (arg === '--no-mpv') options.noMpv = true;
        else if (arg === '--json') options.json = true;
        else if (arg === '--plain') options.plain = true;
        else if (arg === '--headful') options.headful = true;
        else if (arg === '--timeout') options.timeout = parseInt(argv[++i], 10) || 40000;
        else if (arg === '--key') options.key = argv[++i];
        else options.query.push(arg);
    }

    options.query = options.query.join(' ').trim();

    return options;
}

// Выбор фильма в построчном режиме: по id напрямую или через поиск
async function pickFilm(options, apiKey) {
    var directId = api.parseFilmId(options.query);
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

// Выбор плеера в построчном режиме
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
            hint: player.translations.length + ' озв. · ' + player.quality
        };
    });

    var index = await ui.select('Плееры для «' + film.title + '»:', items);
    return index < 0 ? null : players[index];
}

// Выбор озвучки в построчном режиме: по --translation или первая доступная
async function pickTranslation(player, options) {
    var variants = player.translations || [];
    if (variants.length === 0) return null;

    if (options.translation) {
        var wanted = options.translation.toLowerCase();
        var match = variants.filter(function (item) {
            return item.name.toLowerCase().indexOf(wanted) >= 0;
        })[0];

        if (!match) {
            ui.error('Озвучка «' + options.translation + '» не найдена. Есть: ' +
                variants.map(function (item) { return item.name; }).join(', '));
            return undefined;
        }

        return match;
    }

    if (variants.length === 1 || !process.stdin.isTTY) return variants[0];

    var items = variants.map(function (item) {
        return { label: item.name, hint: item.quality };
    });

    var index = await ui.select('Озвучки ' + player.source + ':', items);
    return index < 0 ? undefined : variants[index];
}

// Построчный режим для скриптов и терминалов без интерактива
async function runPlain(options) {
    var apiKey = config.resolveApiKey(options.key);
    config.applyChromiumPath();

    var film = await pickFilm(options, apiKey);
    if (!film) return 1;

    var player = await pickPlayer(film, options);
    if (!player) return 1;

    var translation = await pickTranslation(player, options);
    if (translation === undefined) return 1;

    var source = translation && translation.iframeUrl ? translation.iframeUrl : player.iframeUrl;
    var iframeUrl = api.withEpisode(source, options.season, options.episode);

    // Режим --iframe: поток не ищем, отдаём ссылку на плеер как есть
    if (options.iframe) {
        if (options.json) {
            process.stdout.write(JSON.stringify({
                film: film, player: player, translation: translation, iframeUrl: iframeUrl
            }, null, 2) + '\n');
        } else {
            ui.info(ui.color.green('▸ ') + player.source +
                (translation ? ' · ' + translation.name : ''));
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
            translation: translation,
            stream: found,
            command: mpv.buildCommand(found, title, options.mpvArgs)
        }, null, 2) + '\n');
        return 0;
    }

    ui.info(ui.color.green('▸ ') + title + ' · ' + player.source +
        (translation ? ' · ' + translation.name : '') + ' · ' + player.quality);

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

// Полноэкранный интерфейс имеет смысл только в живом терминале
function wantsTui(options) {
    if (options.plain || options.json || options.iframe || options.noMpv) return false;
    return process.stdin.isTTY && process.stdout.isTTY;
}

async function main() {
    var options = parseArgs(process.argv.slice(2));

    if (options.help) {
        ui.info(HELP);
        return 0;
    }

    try {
        if (wantsTui(options)) {
            return await require('./lib/app').run(options);
        }

        return await runPlain(options);
    } catch (err) {
        ui.error(err.message);
        return 1;
    }
}

main().then(function (code) {
    process.exit(code);
});
