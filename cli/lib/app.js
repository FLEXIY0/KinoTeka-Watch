'use strict';

// Экраны интерфейса и переходы между ними:
//
//   поиск ─► фильм ─┬─► плееры ────────────────► просмотр
//                   └─► сезоны ─► серии ─► плееры ─► просмотр
//
// Esc всегда возвращает на шаг назад, после выхода из mpv возвращаемся
// на тот же экран — чтобы сразу включить следующую серию.

var ansi = require('./ansi');
var tui = require('./tui');
var api = require('./api');
var poster = require('./poster');
var stream = require('./stream');
var mpv = require('./mpv');
var config = require('./config');

var style = ansi.style;
var glyph = ansi.glyph;

var POSTER_COLS = 22;
var POSTER_ROWS = 13;
var GAP = 2;

// Размеры карточки под текущий размер терминала
function metrics() {
    var screen = tui.size();
    var width = Math.max(44, Math.min(screen.cols - 4, 78));
    var withPoster = screen.cols >= 66 && screen.rows >= 20;
    var rightWidth = width - 4 - (withPoster ? POSTER_COLS + GAP : 0);

    return {
        width: width,
        rightWidth: rightWidth,
        withPoster: withPoster,
        listRows: Math.max(4, Math.min(screen.rows - 12, 12))
    };
}

function footer(hints) {
    return style.muted(hints.join('  ' + glyph.dot + '  '));
}

// Склейка обложки и правой колонки в одну сетку
function columns(posterLines, rightLines, rightWidth) {
    var rows = Math.max(posterLines.length, rightLines.length);
    var lines = [];

    for (var i = 0; i < rows; i++) {
        var left = posterLines[i] !== undefined ? posterLines[i] : ansi.repeat(' ', POSTER_COLS);
        var right = rightLines[i] !== undefined ? rightLines[i] : '';
        lines.push(' ' + left + style.reset + ansi.repeat(' ', GAP) + ansi.pad(right, rightWidth));
    }

    return lines;
}

// Строка «1999 · фантастика, боевик · 136 мин · ★ 8.5»
function metaLine(film) {
    var parts = [];

    if (film.year) parts.push(String(film.year));
    if (film.genres && film.genres.length > 0) parts.push(film.genres.slice(0, 2).join(', '));
    if (film.length) parts.push(film.length + ' мин');
    if (film.rating) parts.push((ansi.ascii ? '*' : '★') + ' ' + film.rating);

    return parts.join(' ' + glyph.dot + ' ');
}

// Шапка правой колонки: название, мета, описание
function filmHeader(film, width, descriptionLines) {
    var lines = [style.bold(ansi.truncate(film.title, width))];

    if (film.original && film.original !== film.title) {
        lines.push(style.muted(ansi.truncate(film.original, width)));
    }

    lines.push(style.muted(ansi.truncate(metaLine(film), width)));
    lines.push('');

    if (descriptionLines > 0 && film.description) {
        ansi.wrap(film.description, width, descriptionLines).forEach(function (line) {
            lines.push(style.muted(line));
        });
        lines.push('');
    }

    return lines;
}

// Экран ввода одной строки (используется для ключа API)
async function inputScreen(title, label, hintLines, initial) {
    var value = initial || '';

    while (true) {
        var size = metrics();
        var content = [''];

        hintLines.forEach(function (line) {
            ansi.wrap(line, size.width - 6, 4).forEach(function (wrapped) {
                content.push('  ' + style.muted(wrapped));
            });
        });

        content.push('');
        content.push('  ' + tui.field(label, value, true));
        content.push('');

        tui.paint(tui.box(title, content, size.width,
            footer(['Enter сохранить', 'Esc отмена'])));

        var key = await tui.readKey();

        if (key.name === 'escape') return null;
        if (key.name === 'return') return value.trim();

        var edited = tui.editText(value, key);
        if (edited !== null) value = edited;
    }
}

// Экран с сообщением; ждёт любую клавишу
async function messageScreen(title, lines, hint) {
    var size = metrics();
    var content = [''];

    lines.forEach(function (line) {
        ansi.wrap(line, size.width - 6, 6).forEach(function (wrapped) {
            content.push('  ' + wrapped);
        });
    });

    content.push('');

    tui.paint(tui.box(title, content, size.width, footer([hint || 'любая клавиша — назад'])));
    await tui.readKey();
}

// Экран 1 — поиск с живыми подсказками, как на сайте.
// Без ключа Кинопоиска подсказок нет: там мы идём сразу в Kinobox по названию.
async function searchScreen(state, apiKey) {
    var query = state.query || '';
    var results = state.results || [];
    var selected = 0;
    var status = null;
    var pendingSearch = !!apiKey && query.length >= 2 && results.length === 0;

    function render(spinnerFrame) {
        var size = metrics();
        var content = [''];

        content.push('  ' + tui.field('Фильм', query, true));
        content.push('');

        if (spinnerFrame) {
            content.push('  ' + style.accent(spinnerFrame) + ' ' + style.muted('ищу…'));
        } else if (status) {
            content.push('  ' + style.muted(ansi.truncate(status, size.width - 6)));
        } else if (!apiKey) {
            content.push('  ' + style.muted('без ключа: ищу сразу по названию, без постеров'));
            content.push('  ' + style.muted('и списка серий — Ctrl+K, чтобы вставить ключ'));
        } else if (results.length > 0) {
            var items = results.map(function (film) {
                var hint = [film.year, film.rating ? (ansi.ascii ? '*' : '★') + ' ' + film.rating : '']
                    .filter(Boolean).join(' ' + glyph.dot + ' ');
                return { label: film.title, hint: hint };
            });

            tui.list(items, selected, size.listRows, size.width - 4).forEach(function (line) {
                content.push(line);
            });
        } else {
            content.push('  ' + style.muted('начни печатать название и нажми Enter'));
        }

        content.push('');

        var hints = apiKey
            ? [glyph.up + glyph.down + ' выбор', 'Enter открыть', 'Ctrl+K ключ', 'Esc выход']
            : ['Enter искать', 'Ctrl+K ключ', 'Esc выход'];

        return tui.box('ktw', content, size.width, footer(hints));
    }

    async function runSearch() {
        if (query.trim().length < 2) {
            status = 'слишком короткий запрос';
            results = [];
            return;
        }

        status = null;

        try {
            results = await tui.withSpinner(api.searchFilms(query.trim(), apiKey), render);
            selected = 0;
            if (results.length === 0) status = 'ничего не нашлось по запросу «' + query.trim() + '»';
        } catch (err) {
            results = [];
            status = err.message;
        }
    }

    while (true) {
        tui.paint(render());

        // Пауза перед поиском, чтобы не дёргать API на каждую букву
        var key = await tui.readKey(pendingSearch ? 400 : 0);

        if (key === null) {
            pendingSearch = false;
            await runSearch();
            continue;
        }

        if (key.name === 'escape') return null;

        // Ctrl+K — вставить ключ Кинопоиска, не выходя из программы
        if (key.ctrl && key.name === 'k') {
            state.query = query;
            return 'key';
        }

        if (key.name === 'return') {
            // Без ключа искать нечем: отдаём название сразу в Kinobox
            if (!apiKey) {
                if (query.trim().length < 2) continue;
                state.query = query;
                return { id: null, title: query.trim(), keyless: true };
            }

            if (results.length > 0) {
                state.query = query;
                state.results = results;
                return results[selected];
            }

            pendingSearch = false;
            await runSearch();
            continue;
        }

        if (key.name === 'up') {
            if (results.length > 0) selected = (selected - 1 + results.length) % results.length;
            continue;
        }

        if (key.name === 'down') {
            if (results.length > 0) selected = (selected + 1) % results.length;
            continue;
        }

        var edited = tui.editText(query, key);

        if (edited !== null && edited !== query) {
            query = edited;
            status = null;
            results = [];
            selected = 0;
            pendingSearch = !!apiKey && query.trim().length >= 2;
        }
    }
}

// Универсальный экран выбора с обложкой слева
async function pickerScreen(film, posterLines, title, items, hints, descriptionLines, initialIndex) {
    var selected = initialIndex && initialIndex < items.length ? initialIndex : 0;

    while (true) {
        var size = metrics();
        var right = filmHeader(film, size.rightWidth, descriptionLines);

        right.push(style.bold(title));

        if (items.length === 0) {
            right.push(style.muted('пусто'));
        } else {
            tui.list(items, selected, size.listRows, size.rightWidth + 2).forEach(function (line) {
                right.push(line.replace(/^ {2}/, ''));
            });
        }

        var content = size.withPoster
            ? columns(posterLines, right, size.rightWidth)
            : right.map(function (line) { return ' ' + ansi.pad(line, size.width - 3); });

        tui.paint(tui.box(null, [''].concat(content, ['']), size.width, footer(hints)));

        var key = await tui.readKey();

        if (key.name === 'escape') return 'back';
        if (key.name === 'return' && items.length > 0) return selected;
        if (key.name === 'up') selected = (selected - 1 + items.length) % items.length;
        if (key.name === 'down') selected = (selected + 1) % items.length;
        if (key.name === 'pageup') selected = Math.max(0, selected - size.listRows);
        if (key.name === 'pagedown') selected = Math.min(items.length - 1, selected + size.listRows);
        if (key.name === 'home') selected = 0;
        if (key.name === 'end') selected = items.length - 1;
    }
}

// Выбор качества из мастер-плейлиста. Балансер отдаёт один адрес, внутри
// которого несколько дорожек — mpv по умолчанию берёт самую жирную.
// variants приходят уже загруженными: сеть отдельно, интерактив отдельно,
// иначе спиннер затирал бы экран выбора.
async function pickQuality(film, posterLines, found, variants, options, state) {
    // Одна дорожка или не HLS — выбирать нечего
    if (variants.length < 2) return found;

    var chosen = options.quality ? stream.pickVariant(variants, options.quality) : null;

    if (!chosen) {
        var items = variants.map(function (item) {
            return {
                label: item.label,
                hint: item.bandwidth ? Math.round(item.bandwidth / 1000) + ' кбит/с' : ''
            };
        });

        // Прошлый выбор подставляем заранее — обычно качество не меняют
        var preselect = 0;
        variants.forEach(function (item, index) {
            if (state.quality && item.height === state.quality) preselect = index;
        });

        var index = await pickerScreen(film, posterLines, 'Качество', items,
            [glyph.up + glyph.down + ' выбор', 'Enter смотреть', 'Esc назад'], 0, preselect);

        if (index === 'back') return null;
        chosen = variants[index];
    }

    state.quality = chosen.height;

    return {
        url: chosen.url,
        referer: found.referer,
        origin: found.origin,
        userAgent: found.userAgent,
        label: chosen.label
    };
}

// Извлечение потока и передача его в mpv
async function playStream(film, player, translation, season, episode, options, state, posterLines) {
    var source = translation && translation.iframeUrl ? translation.iframeUrl : player.iframeUrl;
    var iframeUrl = api.withEpisode(source, season, episode);
    var label = film.title + (season ? ' · S' + season + 'E' + episode : '');
    var found;

    // Что происходит прямо сейчас: «жму play», «пропустил рекламный ролик»…
    var progress = '';

    function render(frame) {
        var size = metrics();

        return tui.box(null, [
            '',
            '  ' + style.accent(frame || '') + ' ' + style.bold('Достаю поток'),
            '',
            '  ' + style.muted(ansi.truncate(label, size.width - 6)),
            '  ' + style.muted(ansi.truncate('плеер ' + player.source +
                (translation ? ' · ' + translation.name : '') + ' · ' + player.quality, size.width - 6)),
            '',
            '  ' + style.muted(ansi.truncate(progress, size.width - 6)),
            ''
        ], size.width, footer(['реклама пропускается автоматически']));
    }

    try {
        found = await tui.withSpinner(stream.resolveStream(iframeUrl, {
            timeout: options.timeout,
            headful: options.headful,
            onProgress: function (message) { progress = message; }
        }), render);
    } catch (err) {
        await messageScreen('Не вышло', [err.message], 'любая клавиша — назад');
        return false;
    }

    if (!found) {
        await messageScreen('Поток не найден', [
            'Плеер ' + player.source + ' не отдал поток за ' + Math.round(options.timeout / 1000) + ' с.',
            '',
            'Попробуй другой плеер, подними ожидание через --timeout',
            'или запусти с --headful, чтобы увидеть, на чём всё встало.'
        ], 'любая клавиша — к списку плееров');
        return false;
    }

    // Контента не дождались — отдаём что поймали, но предупреждаем
    if (found.suspicious) {
        await messageScreen('Похоже, это реклама', [
            'За ' + Math.round(options.timeout / 1000) + ' с плеер ' + player.source +
            ' так и не отдал сам фильм — поймался только рекламный ролик.',
            '',
            'Надёжнее выбрать другой балансер: Esc вернёт к списку.',
            'Если хочется всё же попробовать — можно продолжить.'
        ], 'любая клавиша — продолжить');
    }

    // Сначала тянем мастер-плейлист под спиннером, потом уже спрашиваем
    var variants = await tui.withSpinner(stream.readVariants(found), function (frame) {
        var size = metrics();
        return tui.box(null, ['', '  ' + style.accent(frame) + ' ' + style.muted('смотрю, какие есть качества…'), ''],
            size.width, footer(['почти всё']));
    });

    var selected = await pickQuality(film, posterLines, found, variants, options, state);
    if (!selected) return false;

    found = selected;

    var title = film.title + (film.year ? ' (' + film.year + ')' : '') +
        (season ? ' · S' + season + 'E' + episode : '') +
        (found.label ? ' · ' + found.label : '');

    // На время просмотра отдаём терминал mpv
    tui.exit();

    try {
        await mpv.play(found, title, options.mpvArgs);
    } catch (err) {
        tui.enter();
        await messageScreen('mpv не запустился', [
            err.message,
            '',
            'Ссылка на поток:',
            found.url
        ], 'любая клавиша — назад');
        return true;
    }

    tui.enter();
    return true;
}

// Главный цикл: переходы между экранами
async function run(options) {
    var apiKey = config.resolveApiKey(options.key);
    config.applyChromiumPath();

    var state = { query: options.query || '', results: [] };
    var film = null;
    var posterLines = [];
    var seasons = [];
    var season = options.season ? Number(options.season) : null;
    var episode = options.episode ? Number(options.episode) : null;
    var players = [];
    var player = null;
    var autoUsed = false;
    var screen = 'search';

    // Фильм передали id или ссылкой — поиск не нужен
    var directId = api.parseFilmId(options.query);

    if (directId) {
        film = { id: directId, title: 'Кинопоиск #' + directId };
        state.query = '';
        screen = 'load';
    }

    tui.enter();

    try {
        while (true) {
            if (screen === 'search') {
                film = await searchScreen(state, apiKey);
                if (!film) return 0;

                if (film === 'key') {
                    screen = 'apikey';
                    continue;
                }

                // Без ключа карточку загружать нечем — сразу к плеерам
                screen = film.keyless ? 'players' : 'load';
                players = [];
                posterLines = [];
                seasons = [];
                continue;
            }

            // Ввод ключа Кинопоиска с сохранением в конфиг
            if (screen === 'apikey') {
                var enteredKey = await inputScreen('Ключ Кинопоиска', 'Ключ', [
                    'Бесплатный ключ выдают на kinopoiskapiunofficial.tech —',
                    'регистрация занимает минуту.',
                    '',
                    'С ключом появятся выбор среди похожих фильмов, обложки,',
                    'описания и список сезонов с сериями.'
                ], '');

                // Ключ уезжает в HTTP-заголовок, а туда нельзя ничего,
                // кроме латиницы: иначе Node ругается про ByteString
                if (enteredKey && !/^[\x20-\x7E]+$/.test(enteredKey)) {
                    await messageScreen('Так не годится', [
                        'В ключе есть символы вне латиницы — скорее всего,',
                        'скопировалось лишнее. Ключ выглядит примерно так:',
                        '',
                        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
                    ], 'любая клавиша — ввести заново');

                    screen = 'apikey';
                    continue;
                }

                if (enteredKey) {
                    apiKey = enteredKey;

                    try {
                        config.save({ kinopoiskApiKey: enteredKey });
                    } catch (err) {
                        await messageScreen('Не сохранилось', [
                            'Ключ приняли на этот запуск, но записать в конфиг не вышло:',
                            err.message
                        ], 'любая клавиша — дальше');
                    }
                }

                screen = 'search';
                continue;
            }

            // Догружаем карточку, обложку и сезоны
            if (screen === 'load') {
                var size = metrics();

                try {
                    var loaded = await tui.withSpinner((async function () {
                        // Карточка из поиска беднее полной: нет хронометража и большого постера
                        var details = await api.getFilm(film.id, apiKey).catch(function () { return film; });
                        var art = size.withPoster
                            ? await poster.render(details.poster, details.title, POSTER_COLS, POSTER_ROWS)
                            : [];
                        var list = details.serial ? await api.getSeasons(details.id, apiKey).catch(function () { return []; }) : [];

                        return { details: details, art: art, seasons: list };
                    })(), function (frame) {
                        return tui.box(null, ['', '  ' + style.accent(frame) + ' ' + style.muted('загружаю карточку…'), ''],
                            size.width, footer(['Esc — назад']));
                    });

                    film = Object.assign({}, film, loaded.details);
                    posterLines = loaded.art;
                    seasons = loaded.seasons;
                } catch (err) {
                    await messageScreen('Не вышло', [err.message], 'любая клавиша — назад');
                    screen = 'search';
                    continue;
                }

                screen = seasons.length > 0 && !(season && episode) ? 'seasons' : 'players';
                continue;
            }

            if (screen === 'seasons') {
                var seasonItems = seasons.map(function (item) {
                    return {
                        label: 'Сезон ' + item.number,
                        hint: item.episodes.length + ' сер.'
                    };
                });

                var seasonIndex = await pickerScreen(film, posterLines, 'Сезоны', seasonItems,
                    [glyph.up + glyph.down + ' выбор', 'Enter дальше', 'Esc назад'], 3);

                if (seasonIndex === 'back') {
                    screen = 'search';
                    continue;
                }

                season = seasons[seasonIndex].number;
                screen = 'episodes';
                continue;
            }

            if (screen === 'episodes') {
                var current = seasons.filter(function (item) { return item.number === season; })[0];
                var episodeItems = (current ? current.episodes : []).map(function (item) {
                    return {
                        label: 'S' + season + 'E' + item.number + (item.title ? '  ' + item.title : ''),
                        hint: item.date ? String(item.date).slice(0, 10) : ''
                    };
                });

                var episodeIndex = await pickerScreen(film, posterLines, 'Серии', episodeItems,
                    [glyph.up + glyph.down + ' выбор', 'Enter дальше', 'Esc назад'], 0);

                if (episodeIndex === 'back') {
                    screen = 'seasons';
                    continue;
                }

                episode = current.episodes[episodeIndex].number;
                screen = 'players';
                continue;
            }

            if (screen === 'players') {
                if (players.length === 0) {
                    var playersSize = metrics();

                    // Пока пользователь выбирает плеер и озвучку, поднимаем
                    // браузер: его старт — самая долгая часть извлечения
                    stream.warmup(options.headful);

                    var playersRequest = film.id
                        ? api.getPlayers(film.id)
                        : api.getPlayersByTitle(film.title);

                    try {
                        players = await tui.withSpinner(playersRequest, function (frame) {
                            return tui.box(null, ['', '  ' + style.accent(frame) + ' ' + style.muted('ищу плееры…'), ''],
                                playersSize.width, footer(['Esc — назад']));
                        });
                    } catch (err) {
                        await messageScreen('Плееры недоступны', [err.message], 'любая клавиша — назад');
                        screen = seasons.length > 0 ? 'episodes' : 'search';
                        continue;
                    }
                }

                if (players.length === 0) {
                    await messageScreen('Пусто', ['Для «' + film.title + '» нет доступных плееров.'],
                        'любая клавиша — назад');
                    screen = seasons.length > 0 ? 'episodes' : 'search';
                    continue;
                }

                // --player выбирает балансер без участия пользователя,
                // но только в первый раз — иначе после просмотра начнётся круг
                var chosen = null;

                if (options.player && !autoUsed) {
                    var wanted = options.player.toLowerCase();
                    chosen = players.filter(function (item) {
                        return item.source.toLowerCase().indexOf(wanted) === 0;
                    })[0] || null;
                }

                if (!chosen) {
                    var playerItems = players.map(function (item) {
                        return {
                            label: item.source,
                            hint: ansi.truncate(item.translation, 22) + ' ' + glyph.dot + ' ' + item.quality
                        };
                    });

                    var heading = season ? 'Плееры · S' + season + 'E' + episode : 'Плееры';
                    var playerIndex = await pickerScreen(film, posterLines, heading, playerItems,
                        [glyph.up + glyph.down + ' выбор', 'Enter смотреть', 'Esc назад'], season ? 0 : 3);

                    if (playerIndex === 'back') {
                        screen = seasons.length > 0 ? 'episodes' : 'search';
                        if (screen === 'search') {
                            film = null;
                            players = [];
                        }
                        continue;
                    }

                    chosen = players[playerIndex];
                }

                player = chosen;
                screen = 'translations';
                continue;
            }

            // Озвучки спрашиваем, только если есть из чего выбирать
            if (screen === 'translations') {
                var variants = player.translations || [];
                var translation = null;

                if (options.translation && !autoUsed) {
                    var wantedTranslation = options.translation.toLowerCase();
                    translation = variants.filter(function (item) {
                        return item.name.toLowerCase().indexOf(wantedTranslation) >= 0;
                    })[0] || null;
                }

                if (!translation && variants.length === 1) {
                    translation = variants[0];
                }

                if (!translation && variants.length > 1) {
                    var translationItems = variants.map(function (item) {
                        return { label: item.name, hint: item.quality };
                    });

                    var translationIndex = await pickerScreen(film, posterLines,
                        'Озвучка · ' + player.source, translationItems,
                        [glyph.up + glyph.down + ' выбор', 'Enter смотреть', 'Esc назад'], 0);

                    if (translationIndex === 'back') {
                        screen = 'players';
                        continue;
                    }

                    translation = variants[translationIndex];
                }

                await playStream(film, player, translation, season, episode, options, state, posterLines);
                autoUsed = true;

                // После просмотра логичнее всего вернуться к выбору серии
                screen = seasons.length > 0 ? 'episodes' : 'players';
                continue;
            }

            return 0;
        }
    } finally {
        tui.exit();
        await stream.shutdown();
    }
}

module.exports = {
    run: run
};
