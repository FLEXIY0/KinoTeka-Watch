'use strict';

// Экраны интерфейса и переходы между ними:
//
//   поиск (с историей) ─► фильм ─┬─► плееры ─► озвучка ─► качество ─► mpv ─► [след. серия]
//                                └─► сезоны ─► серии (с ✓) ─► плееры ─► озвучка ─► качество ─► mpv
//                                └─► настройки (Ctrl+S)
//                                └─► история (Ctrl+H)
//
// Esc всегда возвращает на шаг назад. При завершении серии сериала
// автоматически предлагается и запускается следующая (Binge-Watching).

var ansi = require('./ansi');
var tui = require('./tui');
var api = require('./api');
var poster = require('./poster');
var stream = require('./stream');
var mpv = require('./mpv');
var config = require('./config');
var history = require('./history');
var themes = require('./themes');
var i18n = require('./i18n');

var t = i18n.t;

var style = ansi.style;
var glyph = ansi.glyph;

var POSTER_COLS = 22;
var POSTER_ROWS = 13;
var GAP = 2;

// Размеры карточки под текущий размер терминала (адаптивная растяжка)
function metrics() {
    var screen = tui.size();
    var width = Math.max(50, Math.min(screen.cols - 4, 110));
    var withPoster = screen.cols >= 66 && screen.rows >= 18;
    var rightWidth = width - 4 - (withPoster ? POSTER_COLS + GAP : 0);

    return {
        width: width,
        rightWidth: rightWidth,
        withPoster: withPoster,
        listRows: Math.max(5, Math.min(screen.rows - 10, 20))
    };
}

function footer(hints) {
    return hints.map(function (h) {
        var spaceIdx = h.indexOf(' ');
        if (spaceIdx > 0) {
            var key = h.slice(0, spaceIdx);
            var label = h.slice(spaceIdx + 1);
            return style.secondary('[' + key + ']') + ' ' + style.muted(label);
        }
        return style.muted(h);
    }).join('  ');
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

// Строка «1999 · фантастика · 136 мин · ★ 8.5»
function metaLine(film) {
    var parts = [];

    if (film.year) parts.push(String(film.year));
    if (film.genres && film.genres.length > 0) parts.push(film.genres.slice(0, 2).join(', '));
    if (film.length) parts.push(film.length + ' мин');
    if (film.rating) parts.push((ansi.ascii ? '*' : '★') + ' ' + film.rating);

    return parts.join(' ' + glyph.dot + ' ');
}

// Шапка правой колонки
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

// Экран ввода одной строки
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

// Экран с сообщением
async function messageScreen(title, lines, hint) {
    var size = metrics();
    var content = [''];

    lines.forEach(function (line) {
        ansi.wrap(line, size.width - 6, 8).forEach(function (wrapped) {
            content.push('  ' + wrapped);
        });
    });

    content.push('');

    tui.paint(tui.box(title, content, size.width, footer([hint || 'любая клавиша — назад'])));
    await tui.readKey();
}

// Экран настроек (Settings)
async function settingsScreen() {
    var cfg = config.read();
    var selected = 0;

    var langOptions = ['ru', 'en'];
    var langLabels = ['Русский (RU)', 'English (EN)'];

    var playerOptions = ['', 'Collaps', 'Alloha', 'Kodik', 'Veoveo', 'Turbo'];
    var playerLabels = ['Авто (первый лучший)', 'Collaps ⚡ (прямой поток)', 'Alloha ⚡', 'Kodik ⚡', 'Veoveo ⚡', 'Turbo'];

    var qualityOptions = ['', '1080', '720', '480', 'max', 'min'];
    var qualityLabels = ['Спрашивать всегда', '1080p (FHD)', '720p (HD)', '480p (SD)', 'Максимальное (4K/FHD)', 'Минимальное (трафик)'];

    var hwdecOptions = ['auto-safe', 'no', 'nvdec', 'vaapi', 'd3d11va'];
    var hwdecLabels = ['Авто (auto-safe)', 'Выкл (no)', 'NVIDIA (nvdec)', 'Intel/AMD Linux (vaapi)', 'Windows (d3d11va)'];

    var modeOptions = [false, true];
    var modeLabels = ['Гибридный ⚡ (прямой + браузер)', 'Только прямой ⚡ (без запуска Chromium)'];

    var themeOptions = ['classic_bw', 'monument', 'cyberpunk', 'cinema', 'matrix', 'nordic'];
    var themeLabels = [
        'Classic Monochrome (Классическая Ч/Б)',
        'Monument Dark (Монументальный Графит)',
        'Neon Cyberpunk (Неон / Киберпанк)',
        'Cinema Noir & Gold (Тёмное Золото / Премиум)',
        'Matrix Hacker (Матрица / Зелёный)',
        'Nordic Frost (Северный Ледник / Минимал)'
    ];

    var bannerOptions = ['auto', 'slant', 'monument', 'cyber', 'gothic', 'lineart', 'classic_figlet', 'off'];
    var bannerLabels = [
        'Авто (из темы)',
        'Slant (3D Наклонный)',
        'Monument (Монолитные блоки)',
        'Cyber (Кибернетика)',
        'Gothic (Готика)',
        'Line-Art (Тонкие рамки)',
        'Classic Figlet (ASCII)',
        'Выключить (без баннера)'
    ];

    while (true) {
        var size = metrics();

        var items = [
            {
                key: 'lang',
                label: t('lang_label'),
                valueText: langLabels[langOptions.indexOf(cfg.lang || 'ru')] || 'Русский (RU)'
            },
            {
                key: 'theme',
                label: t('theme_label'),
                valueText: themeLabels[themeOptions.indexOf(cfg.theme || 'classic_bw')] || (cfg.theme || 'classic_bw')
            },
            {
                key: 'bannerStyle',
                label: 'Стиль ANSI логотипа',
                valueText: bannerLabels[bannerOptions.indexOf(cfg.bannerStyle || 'auto')] || (cfg.bannerStyle || 'Авто')
            },
            {
                key: 'openStand',
                label: t('stand_label'),
                valueText: t('stand_btn')
            },
            {
                key: 'preferredPlayer',
                label: t('player_label'),
                valueText: playerLabels[playerOptions.indexOf(cfg.preferredPlayer || '')] || (cfg.preferredPlayer || 'Авто')
            },
            {
                key: 'preferredTranslation',
                label: t('translation_label'),
                valueText: cfg.preferredTranslation ? ('«' + cfg.preferredTranslation + '»') : 'Выбирать вручную'
            },
            {
                key: 'preferredQuality',
                label: t('quality_label'),
                valueText: qualityLabels[qualityOptions.indexOf(cfg.preferredQuality || '')] || (cfg.preferredQuality || 'Спрашивать')
            },
            {
                key: 'directOnly',
                label: t('mode_label'),
                valueText: modeLabels[cfg.directOnly ? 1 : 0]
            },
            {
                key: 'mpvFullscreen',
                label: t('fullscreen_label'),
                valueText: cfg.mpvFullscreen ? 'Включено (--fs)' : 'В окне'
            },
            {
                key: 'mpvHardwareDec',
                label: t('hwdec_label'),
                valueText: hwdecLabels[hwdecOptions.indexOf(cfg.mpvHardwareDec || 'auto-safe')] || (cfg.mpvHardwareDec || 'auto-safe')
            },
            {
                key: 'kinoboxApiUrl',
                label: t('mirror_label'),
                valueText: cfg.kinoboxApiUrl ? ansi.truncate(cfg.kinoboxApiUrl, 26) : 'По умолчанию (fbphdplay.top)'
            },
            {
                key: 'kinopoiskApiKey',
                label: t('key_label'),
                valueText: cfg.kinopoiskApiKey ? (cfg.kinopoiskApiKey.slice(0, 8) + '…' + cfg.kinopoiskApiKey.slice(-4)) : t('key_not_set')
            }
        ];

        var content = [
            '',
            '  ' + style.bold(t('settings_title')),
            '  ' + style.muted(t('settings_sub')),
            ''
        ];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var isActive = i === selected;
            var marker = isActive ? style.accent(glyph.arrow + ' ') : '  ';
            var line = marker + style.bold(item.label) + ': ' + style.accent(item.valueText);
            content.push('  ' + line);
        }

        content.push('');

        tui.paint(tui.box(t('settings_title'), content, size.width,
            footer([glyph.up + glyph.down + ' ' + t('key_nav'), 'Enter ' + t('key_enter'), 'Esc ' + t('key_back')])));

        var key = await tui.readKey();

        if (key.name === 'escape') break;

        if (key.name === 'up') {
            selected = (selected - 1 + items.length) % items.length;
            continue;
        }

        if (key.name === 'down') {
            selected = (selected + 1) % items.length;
            continue;
        }

        if (key.name === 'return' || key.name === 'space' || key.name === 'right' || key.name === 'left') {
            var cur = items[selected];

            if (cur.key === 'lang') {
                var curLIdx = langOptions.indexOf(cfg.lang || 'ru');
                var nextLIdx = (curLIdx + (key.name === 'left' ? -1 : 1) + langOptions.length) % langOptions.length;
                cfg.lang = langOptions[nextLIdx];
                config.save({ lang: cfg.lang });
            } else if (cur.key === 'theme' || cur.key === 'bannerStyle' || cur.key === 'openStand') {
                var standRes = await require('./stand').runStand();
                if (standRes) {
                    cfg.theme = standRes.theme;
                    cfg.bannerStyle = standRes.bannerStyle;
                }
            } else if (cur.key === 'preferredPlayer') {
                var curPIdx = playerOptions.indexOf(cfg.preferredPlayer || '');
                var nextPIdx = (curPIdx + (key.name === 'left' ? -1 : 1) + playerOptions.length) % playerOptions.length;
                cfg.preferredPlayer = playerOptions[nextPIdx];
                config.save({ preferredPlayer: cfg.preferredPlayer });
            } else if (cur.key === 'preferredTranslation') {
                var newTr = await inputScreen(t('translation_label'), 'Озвучка', [
                    'Название студии или переводчика (например: LostFilm, Дублированный, Goblin, Кубик в кубе).',
                    'Если поле пустое — озвучка будет выбираться вручную из списка.'
                ], cfg.preferredTranslation || '');
                if (newTr !== null) {
                    cfg.preferredTranslation = newTr;
                    config.save({ preferredTranslation: newTr });
                }
            } else if (cur.key === 'preferredQuality') {
                var curQIdx = qualityOptions.indexOf(cfg.preferredQuality || '');
                var nextQIdx = (curQIdx + (key.name === 'left' ? -1 : 1) + qualityOptions.length) % qualityOptions.length;
                cfg.preferredQuality = qualityOptions[nextQIdx];
                config.save({ preferredQuality: cfg.preferredQuality });
            } else if (cur.key === 'directOnly') {
                cfg.directOnly = !cfg.directOnly;
                config.save({ directOnly: cfg.directOnly });
            } else if (cur.key === 'mpvFullscreen') {
                cfg.mpvFullscreen = !cfg.mpvFullscreen;
                config.save({ mpvFullscreen: cfg.mpvFullscreen });
            } else if (cur.key === 'mpvHardwareDec') {
                var curHIdx = hwdecOptions.indexOf(cfg.mpvHardwareDec || 'auto-safe');
                var nextHIdx = (curHIdx + (key.name === 'left' ? -1 : 1) + hwdecOptions.length) % hwdecOptions.length;
                cfg.mpvHardwareDec = hwdecOptions[nextHIdx];
                config.save({ mpvHardwareDec: cfg.mpvHardwareDec });
            } else if (cur.key === 'kinoboxApiUrl') {
                var newMirror = await inputScreen(t('mirror_label'), 'URL', [
                    'Базовый URL зеркала Kinobox API (например: https://fbphdplay.top/api/players).',
                    'Оставь пустым для использования стандартных зеркал.'
                ], cfg.kinoboxApiUrl || '');
                if (newMirror !== null) {
                    cfg.kinoboxApiUrl = newMirror;
                    config.save({ kinoboxApiUrl: newMirror });
                }
            } else if (cur.key === 'kinopoiskApiKey') {
                var newKey = await inputScreen(t('key_label'), 'Ключ', [
                    'Ключ с сайта kinopoiskapiunofficial.tech',
                    'Даёт поиск с подсказками, обложки, описания и серии.'
                ], cfg.kinopoiskApiKey || '');
                if (newKey !== null) {
                    cfg.kinopoiskApiKey = newKey;
                    config.save({ kinopoiskApiKey: newKey });
                }
            }
        }
    }
}

// Экран истории просмотров: интерактивная карточная галерея (History Card Gallery)
async function historyScreen() {
    var selected = 0;
    var cachedPosters = {};

    while (true) {
        var size = metrics();
        var items = history.getRecent(50);

        if (items.length === 0) {
            await messageScreen(t('history_title'), [
                t('empty_history'),
                '',
                t('empty_history_sub')
            ], 'любая клавиша — назад');
            return null;
        }

        selected = Math.max(0, Math.min(selected, items.length - 1));
        var chosen = items[selected];

        var posterLines = [];
        if (size.withPoster && chosen.poster) {
            if (!cachedPosters[chosen.filmId]) {
                cachedPosters[chosen.filmId] = await poster.render(chosen.poster, chosen.title, POSTER_COLS, POSTER_ROWS).catch(function () { return []; });
            }
            posterLines = cachedPosters[chosen.filmId] || [];
        }

        var rightLines = [];
        rightLines.push(style.bold(ansi.truncate(chosen.title, size.rightWidth)));
        var typeInfo = chosen.serial ? 'Сериал' : 'Фильм';
        if (chosen.year) {
            rightLines.push(style.muted(String(chosen.year) + ' · ' + typeInfo));
        } else {
            rightLines.push(style.muted(typeInfo));
        }
        rightLines.push('');

        if (chosen.serial && chosen.season && chosen.episode) {
            var numStr = 'S' + (chosen.season < 10 ? '0' : '') + chosen.season + 'E' + (chosen.episode < 10 ? '0' : '') + chosen.episode;
            rightLines.push(style.bold('Остановились: ') + style.accent('[' + numStr + ']'));
        }

        if (chosen.timePos > 0 && chosen.duration > 0) {
            var filled = Math.min(10, Math.max(1, Math.round(chosen.percentage / 10)));
            var bar = ansi.repeat('▰', filled) + ansi.repeat('▱', 10 - filled);
            rightLines.push(style.bold('Таймкод: ') + style.good(bar + ' ' + chosen.percentage + '%'));
            rightLines.push(style.muted('  ' + history.formatTime(chosen.timePos) + ' / ' + history.formatTime(chosen.duration)));
        } else if (chosen.watched) {
            rightLines.push(style.good('✓ Полностью просмотрено'));
        }
        rightLines.push('');

        if (chosen.serial) {
            var watchedCount = history.getWatchedEpisodesCount(chosen.filmId);
            rightLines.push(style.bold('Просмотрено: ') + style.accent(watchedCount + ' сер.') + style.muted(' · [r] сбросить'));
        }

        if (chosen.player) {
            rightLines.push(style.muted('Плеер: ' + chosen.player + (chosen.translation ? (' · ' + chosen.translation) : '')));
        }

        var cardLines = size.withPoster && posterLines.length > 0
            ? columns(posterLines, rightLines, size.rightWidth)
            : rightLines.map(function (l) { return '  ' + l; });

        var content = [''];
        cardLines.forEach(function (l) { content.push(l); });
        content.push('');

        var headerTitle = t('history_title') + ' (' + (selected + 1) + '/' + items.length + ')';
        tui.paint(tui.box(headerTitle, content, size.width,
            footer(['←/→ карточки', 'Enter ' + t('key_play'), 'r ' + t('key_reset'), 'd ' + t('key_delete'), 'Esc ' + t('key_back')])));

        var key = await tui.readKey();

        if (key.name === 'escape') return null;

        if (key.name === 'left' || key.name === 'up') {
            selected = (selected - 1 + items.length) % items.length;
            continue;
        }

        if (key.name === 'right' || key.name === 'down') {
            selected = (selected + 1) % items.length;
            continue;
        }

        // Сбросить прогресс сериала / фильма
        if (key.name === 'r') {
            history.resetSerial(chosen.filmId);
            continue;
        }

        // Удалить фильм из истории
        if (key.name === 'd' || key.name === 'delete') {
            history.remove(chosen.filmId);
            delete cachedPosters[chosen.filmId];
            if (selected >= items.length - 1) selected = Math.max(0, items.length - 2);
            continue;
        }

        if (key.name === 'return' || key.name === 'space') {
            return {
                id: chosen.filmId,
                title: chosen.title,
                year: chosen.year,
                poster: chosen.poster,
                serial: chosen.serial,
                resumeSeason: chosen.season,
                resumeEpisode: chosen.episode,
                resumeTime: chosen.timePos,
                resumePlayer: chosen.player,
                resumeTranslation: chosen.translation
            };
        }
    }
}

// Экран 1 — поиск с живыми подсказками и блоком «Продолжить просмотр»
async function searchScreen(state, apiKey) {
    var query = state.query || '';
    var results = state.results || [];
    var selected = 0;
    var status = null;
    var pendingSearch = !!apiKey && query.length >= 2 && results.length === 0;

    var recentHistory = history.getRecent(4);

    function render(spinnerFrame) {
        var size = metrics();
        var content = [''];

        if (query.trim().length === 0 && !spinnerFrame) {
            var cfg = config.read();
            var logoLines = themes.renderLogo(cfg.theme || 'classic_bw', cfg.bannerStyle || 'auto');
            logoLines.forEach(function (l) {
                var len = ansi.visibleWidth(l);
                var indent = ansi.repeat(' ', Math.max(0, Math.floor((size.width - 6 - len) / 2)));
                content.push('  ' + indent + l);
            });
            if (logoLines.length > 0) content.push('');
        }

        content.push('  ' + tui.field('Поиск', query, true));
        content.push('');

        if (spinnerFrame) {
            content.push('  ' + style.accent(spinnerFrame) + ' ' + style.muted('поиск…'));
        } else if (status) {
            content.push('  ' + style.muted(ansi.truncate(status, size.width - 6)));
        } else if (results.length > 0) {
            var items = results.map(function (film) {
                var ratingStr = film.rating ? style.warn('★ ' + film.rating) : '';
                var yearStr = film.year ? String(film.year) : '';
                var typeStr = film.type ? style.muted(film.type) : '';
                var hint = [ratingStr, yearStr, typeStr].filter(Boolean).join(' ' + glyph.dot + ' ');
                return {
                    label: film.title,
                    hint: hint
                };
            });

            tui.list(items, selected, size.listRows, size.width - 4).forEach(function (line) {
                content.push(line);
            });
        } else if (query.trim().length === 0 && recentHistory.length > 0) {
            content.push('  ' + style.bold('Продолжить просмотр:'));
            var hItems = recentHistory.map(function (item) {
                var epTag = item.season && item.episode ? ' (S' + item.season + 'E' + item.episode + ')' : '';
                var label = item.title + epTag;
                var prog = '';
                if (item.timePos > 0 && item.duration > 0) {
                    var filled = Math.min(5, Math.max(1, Math.round(item.percentage / 20)));
                    var bar = ansi.repeat('▰', filled) + ansi.repeat('▱', 5 - filled);
                    prog = style.good(bar + ' ' + item.percentage + '%') + ' · ' + history.formatTime(item.timePos);
                } else if (item.watched) {
                    prog = style.good('✓ ' + t('watched'));
                }
                return { label: label, hint: prog };
            });
            tui.list(hItems, selected, Math.min(4, size.listRows), size.width - 4).forEach(function (line) {
                content.push(line);
            });
        } else if (!apiKey) {
            content.push('  ' + style.muted('поиск по базе Kinobox  ·  Ctrl+K ключ  ·  Ctrl+S настройки  ·  Ctrl+H история'));
        } else {
            content.push('  ' + style.muted('введите название и нажмите Enter  ·  Ctrl+S настройки  ·  Ctrl+H история'));
        }

        content.push('');

        var hints = [glyph.up + glyph.down + ' ' + t('key_nav'), 'Enter ' + t('key_open'), 'Ctrl+S ' + t('key_settings'), 'Ctrl+H ' + t('key_history'), 'Esc ' + t('key_exit')];
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

        var key = await tui.readKey(pendingSearch ? 400 : 0);

        if (key === null) {
            pendingSearch = false;
            await runSearch();
            continue;
        }

        if (key.name === 'escape') return null;

        // Ctrl+S / F1 — открыть настройки
        if ((key.ctrl && key.name === 's') || key.name === 'f1') {
            state.query = query;
            return 'settings';
        }

        // Ctrl+H / F2 / Ctrl+Y / \x08 — открыть историю
        if ((key.ctrl && key.name === 'h') || key.name === 'f2' || (key.ctrl && key.name === 'y') || key.str === '\x08' || key.str === '\b') {
            state.query = query;
            return 'history';
        }

        // Ctrl+K / F3 — вставить ключ Кинопоиска
        if ((key.ctrl && key.name === 'k') || key.name === 'f3') {
            state.query = query;
            return 'key';
        }

        if (key.name === 'return') {
            // Если запрос пустой и выбран пункт из истории
            if (query.trim().length === 0 && recentHistory.length > 0 && selected < recentHistory.length) {
                var h = recentHistory[selected];
                return {
                    id: h.filmId,
                    title: h.title,
                    year: h.year,
                    poster: h.poster,
                    serial: h.serial,
                    resumeSeason: h.season,
                    resumeEpisode: h.episode,
                    resumeTime: h.timePos,
                    resumePlayer: h.player,
                    resumeTranslation: h.translation
                };
            }

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

        var maxItems = results.length > 0 ? results.length : (query.trim().length === 0 ? recentHistory.length : 0);

        if (key.name === 'up' && maxItems > 0) {
            selected = (selected - 1 + maxItems) % maxItems;
            continue;
        }

        if (key.name === 'down' && maxItems > 0) {
            selected = (selected + 1) % maxItems;
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
        if (key.ctrl && key.name === 's') return 'settings';
        if (key.ctrl && key.name === 'h') return 'history';
        if (key.name === 'return' && items.length > 0) return selected;
        if (key.name === 'up') selected = (selected - 1 + items.length) % items.length;
        if (key.name === 'down') selected = (selected + 1) % items.length;
        if (key.name === 'pageup') selected = Math.max(0, selected - size.listRows);
        if (key.name === 'pagedown') selected = Math.min(items.length - 1, selected + size.listRows);
        if (key.name === 'home') selected = 0;
        if (key.name === 'end') selected = items.length - 1;
    }
}

// Выбор качества из мастер-плейлиста
async function pickQuality(film, posterLines, found, variants, options, state, player) {
    var userConfig = config.read();
    var wanted = options.quality || userConfig.preferredQuality;
    var chosen = wanted ? stream.pickVariant(variants, wanted) : null;

    if (!chosen) {
        var items = variants.map(function (item) {
            return {
                label: item.label,
                hint: item.bandwidth ? Math.round(item.bandwidth / 1000) + ' кбит/с' : ''
            };
        });

        if (items.length === 0) {
            items = [{
                label: 'как есть',
                hint: player && player.quality && player.quality !== '-'
                    ? player.quality
                    : 'балансер отдал одну дорожку'
            }];
        }

        var preselect = 0;
        variants.forEach(function (item, index) {
            if (state.quality && item.height === state.quality) preselect = index;
        });

        var index = await pickerScreen(film, posterLines, 'Качество', items,
            [glyph.up + glyph.down + ' выбор', 'Enter смотреть', 'Esc назад'], 0, preselect);

        if (index === 'back') return null;
        if (index === 'settings') return 'settings';
        if (variants.length === 0) return found;

        chosen = variants[index];
    }

    if (!chosen) return found;

    state.quality = chosen.height;

    return {
        url: chosen.url,
        referer: found.referer,
        origin: found.origin,
        userAgent: found.userAgent,
        label: chosen.label,
        audioId: found.audioId,
        subtitles: found.subtitles,
        direct: found.direct
    };
}

// Интерактивный экран обратного отсчета для авто-перехода к следующей серии (Binge-Watching)
async function nextEpisodeCountdown(film, nextSeason, nextEpisode, countdownSeconds) {
    var remaining = countdownSeconds || 5;

    while (remaining > 0) {
        var size = metrics();
        var content = [
            '',
            '  ' + style.accent('✓') + ' ' + style.bold('Серия завершена!'),
            '',
            '  ' + style.bold(film.title),
            '  ' + style.accent('Следующая: Сезон ' + nextSeason + ', Серия ' + nextEpisode),
            '',
            '  ' + style.muted('Автозапуск через ' + remaining + ' сек…'),
            ''
        ];

        tui.paint(tui.box('Binge-Watching', content, size.width,
            footer(['Enter смотреть сейчас', 'Esc остановить просмотр'])));

        var key = await tui.readKey(1000);

        if (key === null) {
            remaining--;
            continue;
        }

        if (key.name === 'escape') return false;
        if (key.name === 'return' || key.name === 'space') return true;
    }

    return true;
}

// Извлечение потока и воспроизведение в mpv
async function playStream(film, player, translation, season, episode, options, state, posterLines, startTime) {
    var userConfig = config.read();
    var source = translation && translation.iframeUrl ? translation.iframeUrl : player.iframeUrl;
    var iframeUrl = api.withEpisode(source, season, episode);
    var label = film.title + (season ? ' · S' + season + 'E' + episode : '');
    var found;

    var progress = 'проверяю прямое извлечение ⚡';

    function render(frame) {
        var size = metrics();

        return tui.box(null, [
            '',
            '  ' + style.accent(frame || '⚡') + ' ' + style.bold('Достаю поток'),
            '',
            '  ' + style.muted(ansi.truncate(label, size.width - 6)),
            '  ' + style.muted(ansi.truncate('плеер ' + player.source +
                (translation ? ' · ' + translation.name : '') + ' · ' + player.quality, size.width - 6)),
            '',
            '  ' + style.muted(ansi.truncate(progress, size.width - 6)),
            ''
        ], size.width, footer(['прямой парсинг ⚡ или защита от рекламы']));
    }

    try {
        found = await tui.withSpinner(stream.resolveStream(iframeUrl, {
            season: season,
            episode: episode,
            timeout: options.timeout || userConfig.timeout,
            headful: options.headful,
            directOnly: userConfig.directOnly,
            onProgress: function (message) { progress = message; }
        }), render);
    } catch (err) {
        await messageScreen('Не вышло', [err.message], 'любая клавиша — назад');
        return { ok: false };
    }

    if (!found) {
        await messageScreen('Поток не найден', [
            'Плеер ' + player.source + ' не отдал поток.',
            '',
            'Попробуй другой балансер (например, Collaps ⚡)',
            'или открой Настройки по Ctrl+S.'
        ], 'любая клавиша — к списку плееров');
        return { ok: false };
    }

    if (found.suspicious) {
        await messageScreen('Похоже, это реклама', [
            'Плеер ' + player.source + ' вернул только рекламный ролик.',
            '',
            'Надёжнее выбрать другой балансер (например, Collaps ⚡).'
        ], 'любая клавиша — продолжить');
    }

    if (translation && translation.audioId !== undefined) {
        found.audioId = translation.audioId;
    }

    if (found.audioTracks && found.audioTracks.length > 0 && translation && translation.name) {
        var wantedAudio = translation.name.toLowerCase();
        var matchedTrack = found.audioTracks.find(function (t) {
            return t.name.toLowerCase().indexOf(wantedAudio) >= 0 ||
                wantedAudio.indexOf(t.name.toLowerCase()) >= 0;
        });
        if (matchedTrack) {
            found.audioId = matchedTrack.audioId;
        }
    }

    // Загружаем мастер-плейлист
    var variants = await tui.withSpinner(stream.readVariants(found), function (frame) {
        var size = metrics();
        return tui.box(null, ['', '  ' + style.accent(frame) + ' ' + style.muted('проверяю доступные качества…'), ''],
            size.width, footer(['почти всё']));
    });

    var selectedQuality = await pickQuality(film, posterLines, found, variants, options, state, player);
    if (!selectedQuality) return { ok: false };
    if (selectedQuality === 'settings') return { ok: false, settings: true };

    found = selectedQuality;
    found.startTime = startTime || 0;
    found.filmInfo = film;
    found.season = season;
    found.episode = episode;
    found.player = player.source;
    found.translation = translation ? translation.name : '';

    var streamTitle = film.title + (film.year ? ' (' + film.year + ')' : '') +
        (season ? ' · S' + season + 'E' + episode : '') +
        (translation && translation.name ? ' · ' + translation.name : '') +
        (found.label ? ' · ' + found.label : '');

    // Запуск mpv с IPC отслеживанием
    tui.exit();

    var playResult;
    try {
        playResult = await mpv.play(found, streamTitle, options.mpvArgs);
    } catch (err) {
        tui.enter();
        await messageScreen('mpv не запустился', [
            err.message,
            '',
            'Ссылка на поток:',
            found.url
        ], 'любая клавиша — назад');
        return { ok: true, eofReached: false };
    }

    tui.enter();
    return {
        ok: true,
        eofReached: playResult.eofReached,
        timePos: playResult.timePos,
        duration: playResult.duration
    };
}

// Экран обратного отсчета для автозапуска следующей серии (Binge-Watching)
async function nextEpisodeCountdown(film, nextSeason, nextEp, totalSeconds) {
    totalSeconds = totalSeconds || 5;
    var remaining = totalSeconds;

    while (remaining > 0) {
        var size = metrics();
        var numStr = 'S' + (nextSeason < 10 ? '0' : '') + nextSeason + 'E' + (nextEp < 10 ? '0' : '') + nextEp;
        var barFilled = Math.max(1, remaining);
        var bar = ansi.repeat('▰', barFilled) + ansi.repeat('▱', totalSeconds - barFilled);

        var content = [
            '',
            '  ' + style.bold('Следующая серия'),
            '',
            '  ' + style.accent('[' + numStr + '] ') + style.bold(film.title),
            '  ' + style.muted('Автозапуск через: ') + style.warn(remaining + ' с.'),
            '',
            '  ' + style.muted('Enter запустить сейчас · Esc отмена'),
            ''
        ];

        tui.paint(tui.box('Автопереход', content, size.width,
            footer(['Enter запуск', 'Esc отмена'])));

        var key = await tui.readKey(1000);
        if (key && (key.name === 'escape' || key.name === 'q')) {
            return false;
        }
        if (key && (key.name === 'return' || key.name === 'space')) {
            return true;
        }

        remaining--;
    }

    return true;
}

// Главный цикл приложения
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
    var translation = null;
    var autoUsed = false;
    var screen = options.settings ? 'settings' : 'search';
    var startTime = 0;

    var directId = api.parseFilmId(options.query);
    if (directId) {
        film = { id: directId, title: 'Кинопоиск #' + directId };
        state.query = '';
        screen = 'load';
    }

    tui.enter();

    try {
        while (true) {
            var userConfig = config.read();

            if (screen === 'search') {
                film = await searchScreen(state, apiKey);
                if (!film) return 0;

                if (film === 'settings') {
                    await settingsScreen();
                    apiKey = config.resolveApiKey(options.key);
                    continue;
                }

                if (film === 'history') {
                    screen = 'history';
                    continue;
                }

                if (film === 'key') {
                    screen = 'apikey';
                    continue;
                }

                // Если выбран пункт из истории с сохраненным прогрессом
                if (film.resumeTime !== undefined) {
                    startTime = film.resumeTime;
                    season = film.resumeSeason;
                    episode = film.resumeEpisode;
                } else {
                    startTime = 0;
                }

                screen = film.keyless ? 'players' : 'load';
                players = [];
                posterLines = [];
                seasons = [];
                continue;
            }

            if (screen === 'history') {
                var chosenHistory = await historyScreen();
                if (!chosenHistory) {
                    screen = 'search';
                    continue;
                }
                film = chosenHistory;
                startTime = chosenHistory.resumeTime || 0;
                season = chosenHistory.resumeSeason || null;
                episode = chosenHistory.resumeEpisode || null;
                screen = 'load';
                players = [];
                posterLines = [];
                seasons = [];
                continue;
            }

            if (screen === 'apikey') {
                var enteredKey = await inputScreen('Ключ Кинопоиска', 'Ключ', [
                    'Бесплатный ключ выдают на kinopoiskapiunofficial.tech —',
                    'регистрация занимает минуту.',
                    '',
                    'С ключом появятся поиск с подсказками, обложки,',
                    'описания и список сезонов с сериями.'
                ], apiKey || '');

                if (enteredKey && !/^[\x20-\x7E]+$/.test(enteredKey)) {
                    await messageScreen('Некорректный ключ', [
                        'В ключе присутствуют недопустимые символы.'
                    ], 'любая клавиша — повторить');
                    continue;
                }

                if (enteredKey) {
                    apiKey = enteredKey;
                    config.save({ kinopoiskApiKey: enteredKey });
                }

                screen = 'search';
                continue;
            }

            if (screen === 'load') {
                var size = metrics();

                try {
                    var loaded = await tui.withSpinner((async function () {
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

                // Проверяем сохраненную позицию в истории для фильмов
                if (!film.serial && !startTime && film.id) {
                    var savedProg = history.getProgress(film.id);
                    if (savedProg && savedProg.timePos > 60 && !savedProg.watched) {
                        var resumeChoices = [
                            { label: '▶ Продолжить с ' + history.formatTime(savedProg.timePos), hint: savedProg.percentage + '%' },
                            { label: '↺ Начать с начала', hint: '00:00' }
                        ];
                        var rIndex = await pickerScreen(film, posterLines, 'Возобновление', resumeChoices,
                            [glyph.up + glyph.down + ' выбор', 'Enter подтвердить', 'Esc назад'], 2);
                        if (rIndex === 0) startTime = savedProg.timePos;
                    }
                }

                screen = seasons.length > 0 && !(season && episode) ? 'seasons' : 'players';
                continue;
            }

            if (screen === 'seasons') {
                var totalEpCount = seasons.reduce(function (acc, s) { return acc + (s.episodes ? s.episodes.length : 0); }, 0);
                var watchedEpCount = history.getWatchedEpisodesCount(film.id);
                var seasonItems = seasons.map(function (item) {
                    var watchedInSeason = item.episodes ? item.episodes.filter(function (e) {
                        return history.isEpisodeWatched(film.id, item.number, e.number);
                    }).length : 0;
                    var seasonStat = watchedInSeason > 0 ? (watchedInSeason + '/' + item.episodes.length + ' сер.') : (item.episodes.length + ' сер.');
                    return {
                        label: 'Сезон ' + item.number,
                        hint: seasonStat
                    };
                });

                var heading = totalEpCount > 0
                    ? ('Сезоны · ' + watchedEpCount + '/' + totalEpCount + ' сер. (' + Math.round((watchedEpCount / totalEpCount) * 100) + '%)')
                    : 'Сезоны';

                var seasonIndex = await pickerScreen(film, posterLines, heading, seasonItems,
                    [glyph.up + glyph.down + ' выбор', 'Enter дальше', 'Ctrl+S настройки', 'Esc назад'], 3);

                if (seasonIndex === 'back') {
                    screen = 'search';
                    continue;
                }

                if (seasonIndex === 'settings') {
                    await settingsScreen();
                    continue;
                }

                season = seasons[seasonIndex].number;
                screen = 'episodes';
                continue;
            }

            if (screen === 'episodes') {
                var current = seasons.filter(function (item) { return item.number === season; })[0];
                var episodeItems = (current ? current.episodes : []).map(function (item) {
                    var isWatched = history.isEpisodeWatched(film.id, season, item.number);
                    var epProg = history.getProgress(film.id, season, item.number);
                    var mark = isWatched ? style.good('✓') : (epProg && epProg.timePos > 0 ? style.accent('▶') : ' ');
                    var numStr = 'S' + (season < 10 ? '0' : '') + season + 'E' + (item.number < 10 ? '0' : '') + item.number;
                    var titleStr = item.title ? (' ' + item.title) : '';
                    var hint = '';
                    if (isWatched) {
                        hint = style.good('✓ ' + t('watched'));
                    } else if (epProg && epProg.timePos > 0) {
                        var filled = Math.min(5, Math.max(1, Math.round(epProg.percentage / 20)));
                        var bar = ansi.repeat('▰', filled) + ansi.repeat('▱', 5 - filled);
                        hint = style.good(bar + ' ' + epProg.percentage + '%') + ' · ' + history.formatTime(epProg.timePos);
                    } else if (item.date) {
                        hint = String(item.date).slice(0, 10);
                    }
                    return {
                        label: mark + ' ' + numStr + titleStr,
                        hint: hint
                    };
                });

                var episodeIndex = await pickerScreen(film, posterLines, 'Серии', episodeItems,
                    [glyph.up + glyph.down + ' выбор', 'Enter дальше', 'Ctrl+S настройки', 'Esc назад'], 0);

                if (episodeIndex === 'back') {
                    screen = 'seasons';
                    continue;
                }

                if (episodeIndex === 'settings') {
                    await settingsScreen();
                    continue;
                }

                episode = current.episodes[episodeIndex].number;

                // Проверяем сохраненную позицию для этой серии
                var epProg = history.getProgress(film.id, season, episode);
                if (epProg && epProg.timePos > 60 && !epProg.watched) {
                    var epResumeChoices = [
                        { label: 'Продолжить с ' + history.formatTime(epProg.timePos), hint: epProg.percentage + '%' },
                        { label: 'Начать с начала', hint: '00:00' }
                    ];
                    var epRIndex = await pickerScreen(film, posterLines, 'Возобновление серии', epResumeChoices,
                        [glyph.up + glyph.down + ' выбор', 'Enter подтвердить', 'Esc назад'], 0);
                    if (epRIndex === 0) startTime = epProg.timePos;
                    else startTime = 0;
                } else {
                    startTime = 0;
                }

                screen = 'players';
                continue;
            }

            if (screen === 'players') {
                if (players.length === 0) {
                    var playersSize = metrics();
                    stream.warmup(options.headful);

                    var playersRequest = film.id
                        ? api.getPlayers(film.id)
                        : api.getPlayersByTitle(film.title);

                    try {
                        players = await tui.withSpinner(playersRequest, function (frame) {
                            return tui.box(null, ['', '  ' + style.accent(frame) + ' ' + style.muted('ищу доступные плееры…'), ''],
                                playersSize.width, footer(['Esc — назад']));
                        });
                    } catch (err) {
                        await messageScreen('Плееры недоступны', [err.message], 'любая клавиша — назад');
                        screen = seasons.length > 0 ? 'episodes' : 'search';
                        continue;
                    }

                    if (players.length === 0) {
                        await messageScreen('Пусто', ['Для «' + film.title + '» нет доступных плееров.'],
                            'любая клавиша — назад');
                        screen = seasons.length > 0 ? 'episodes' : 'search';
                        continue;
                    }
                }

                var chosenPlayer = null;

                var preferredP = options.player || (!autoUsed ? userConfig.preferredPlayer : null);
                if (preferredP) {
                    var wantedP = preferredP.toLowerCase();
                    chosenPlayer = players.find(function (item) {
                        return item.source.toLowerCase().indexOf(wantedP) === 0;
                    }) || null;
                }

                if (!chosenPlayer) {
                    var playerItems = players.map(function (item) {
                        var directBadge = item.direct ? style.good(' [прямой]') : '';
                        var trCount = item.translations ? (item.translations.length + ' озв.') : '';
                        var qBadge = item.quality || '';
                        return {
                            label: item.source + directBadge,
                            hint: [trCount, qBadge].filter(Boolean).join(' · ')
                        };
                    });

                    var heading = season ? 'Плееры · S' + season + 'E' + episode : 'Плееры';
                    var playerIndex = await pickerScreen(film, posterLines, heading, playerItems,
                        [glyph.up + glyph.down + ' выбор', 'Enter смотреть', 'Ctrl+S настройки', 'Esc назад'], season ? 0 : 3);

                    if (playerIndex === 'back') {
                        screen = seasons.length > 0 ? 'episodes' : 'search';
                        if (screen === 'search') {
                            film = null;
                            players = [];
                        }
                        continue;
                    }

                    if (playerIndex === 'settings') {
                        await settingsScreen();
                        continue;
                    }

                    chosenPlayer = players[playerIndex];
                }

                player = chosenPlayer;
                screen = 'translations';
                continue;
            }

            if (screen === 'translations') {
                var variants = player.translations || [];
                translation = null;

                var preferredTr = options.translation || (!autoUsed ? userConfig.preferredTranslation : null);
                if (preferredTr && variants.length > 0) {
                    var wantedTr = preferredTr.toLowerCase();
                    translation = variants.find(function (item) {
                        return item.name.toLowerCase().indexOf(wantedTr) >= 0;
                    }) || null;
                }

                if (!translation) {
                    var translationItems = variants.map(function (item) {
                        return {
                            label: item.name,
                            hint: item.quality || ''
                        };
                    });

                    if (translationItems.length === 0) {
                        translationItems = [{
                            label: 'по умолчанию',
                            hint: 'балансер не разделяет озвучки'
                        }];
                    }

                    var translationIndex = await pickerScreen(film, posterLines,
                        'Озвучка · ' + player.source + (player.direct ? ' ⚡' : ''), translationItems,
                        [glyph.up + glyph.down + ' выбор', 'Enter смотреть', 'Ctrl+S настройки', 'Esc назад'], 0);

                    if (translationIndex === 'back') {
                        screen = 'players';
                        continue;
                    }

                    if (translationIndex === 'settings') {
                        await settingsScreen();
                        continue;
                    }

                    translation = variants[translationIndex] || null;
                }

                var playResult = await playStream(film, player, translation, season, episode, options, state, posterLines, startTime);
                autoUsed = true;
                startTime = 0;

                if (playResult.settings) {
                    await settingsScreen();
                    continue;
                }

                // Режим Binge-Watching для сериалов: если серия завершена, предлагаем следующую
                if (film.serial && season && episode && playResult.eofReached && seasons.length > 0) {
                    var curSeasonObj = seasons.find(function (s) { return s.number === season; });
                    var nextEpNum = episode + 1;
                    var hasNextInCurSeason = curSeasonObj && curSeasonObj.episodes.some(function (e) { return e.number === nextEpNum; });
                    var nextSeasonNum = season;

                    if (!hasNextInCurSeason) {
                        var nextSeasonObj = seasons.find(function (s) { return s.number === season + 1; });
                        if (nextSeasonObj && nextSeasonObj.episodes.length > 0) {
                            nextSeasonNum = season + 1;
                            nextEpNum = nextSeasonObj.episodes[0].number;
                            hasNextInCurSeason = true;
                        }
                    }

                    if (hasNextInCurSeason) {
                        var autoNext = await nextEpisodeCountdown(film, nextSeasonNum, nextEpNum, 5);
                        if (autoNext) {
                            season = nextSeasonNum;
                            episode = nextEpNum;
                            screen = 'translations';
                            continue;
                        }
                    }
                }

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
