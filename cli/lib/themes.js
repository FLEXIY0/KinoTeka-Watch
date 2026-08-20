'use strict';

// Коллекция тем оформления и продвинутый адаптивный ANSI/ASCII генератор на 27 шрифтах.

var ansi = require('./ansi');
var figlet;
try {
    figlet = require('figlet');
} catch (e) {
    figlet = null;
}

var BUILTIN_LOGOS = {
    lineart: {
        full: [
            '┌─┐ ┬ ┌┐┌ ┌─┐ ┌┬┐ ┌─┐ ┬┌─ ┌─┐',
            '├┴┐ │ │││ │ │  │  ├┤  ├┴┐ ├─┤',
            '┴ ┴ ┴ ┘└┘ └─┘  ┴  └─┘ ┴ ┴ ┴ ┴'
        ],
        short: [
            '┌─┐ ┌┬┐ ┬ ┬',
            '├┴┐  │  │││',
            '┴ ┴  ┴  └┴┘'
        ]
    },
    monument: {
        full: [
            '██   ██  ██  ███    ██   ██████   ████████  ████████  ██   ██   █████  ',
            '██  ██   ██  ████   ██  ██    ██     ██     ██        ██  ██   ██   ██ ',
            '█████    ██  ██ ██  ██  ██    ██     ██     ██████    █████    ███████ ',
            '██  ██   ██  ██  ██ ██  ██    ██     ██     ██        ██  ██   ██   ██ ',
            '██   ██  ██  ██   ████   ██████      ██     ████████  ██   ██  ██   ██ '
        ],
        short: [
            '██   ██  ████████  ██      ██',
            '██  ██      ██     ██  ██  ██',
            '█████       ██     ██  ██  ██',
            '██  ██      ██     ██  ██  ██',
            '██   ██     ██      ███  ███ '
        ]
    },
    cyber: {
        full: [
            '╦╔═ ╦ ╔╗╔ ╔═╗ ╔╦╗ ╔═╗ ╦╔═ ╔═╗',
            '╠╩╗ ║ ║║║ ║ ║  ║  ║╣  ╠╩╗ ╠═╣',
            '╩ ╩ ╩ ╝╚╝ ╚═╝  ╩  ╚═╝ ╩ ╩ ╩ ╩'
        ],
        short: [
            '╦╔═ ╔╦╗ ╦ ╦',
            '╠╩╗  ║  ║║║',
            '╩ ╩  ╩  ╚╩╝'
        ]
    },
    gothic: {
        full: [
            '  ▄▄▄  ▄ ▄▄   ▄  ▄▄▄  ▄▄▄▄▄ ▄▄▄▄ ▄▄▄  ▄   ▄ ',
            '  █  █ █ █ █  █ █   █   █   █    █  █ █   █ ',
            '  █▀▀▄ █ █  █ █ █   █   █   █▀▀  █▀▀▄ █▀▀▀█ ',
            '  █  █ █ █   ██  ▀▄▄▀   █   █▄▄▄ █  █ █   █ '
        ],
        short: [
            ' ▄▄▄ ▄▄▄▄▄ ▄   ▄ ',
            ' █  █  █   █ █ █ ',
            ' █▀▀▄  █   █▀▄▀█ ',
            ' █  █  █   █   █ '
        ]
    }
};

var FIGLET_FONT_MAP = {
    ansi_shadow: 'ANSI Shadow',
    slant: 'Slant',
    doom: 'Doom',
    standard: 'Standard',
    big: 'Big',
    small: 'Small',
    graffiti: 'Graffiti',
    sub_zero: 'Sub-Zero',
    speed: 'Speed',
    ghost: 'Ghost',
    larry3d: 'Larry 3D',
    ogre: 'Ogre',
    rectangles: 'Rectangles',
    delta_corps: 'Delta Corps Priest 1',
    cybermedium: 'Cybermedium',
    calvin_s: 'Calvin S',
    epic: 'Epic',
    elite: 'Elite',
    modular: 'Modular',
    '3d_ascii': '3D-ASCII',
    '3x5': '3x5',
    alligator: 'Alligator'
};

var FONT_KEYS = [
    'auto',
    'ansi_shadow',
    'slant',
    'doom',
    'standard',
    'big',
    'small',
    'graffiti',
    'sub_zero',
    'speed',
    'ghost',
    'larry3d',
    'ogre',
    'rectangles',
    'delta_corps',
    'cybermedium',
    'calvin_s',
    'epic',
    'elite',
    'modular',
    '3d_ascii',
    '3x5',
    'alligator',
    'lineart',
    'monument',
    'cyber',
    'gothic',
    'off'
];

var FONT_LABELS = {
    auto: 'Авто (из темы)',
    ansi_shadow: 'ANSI Shadow (3D Блоки)',
    slant: 'Slant (Наклонный 3D)',
    doom: 'Doom (Игровой)',
    standard: 'Standard (ASCII)',
    big: 'Big (Крупный жирный)',
    small: 'Small (Компактный)',
    graffiti: 'Graffiti (Стрит-арт)',
    sub_zero: 'Sub-Zero (Кибер-изометрик)',
    speed: 'Speed (Скоростной)',
    ghost: 'Ghost (Призрачный)',
    larry3d: 'Larry 3D (3D Ретро)',
    ogre: 'Ogre (Готический)',
    rectangles: 'Rectangles (Блоки)',
    delta_corps: 'Delta Corps (Sci-Fi)',
    cybermedium: 'Cybermedium (Киберпанк)',
    calvin_s: 'Calvin S (Мини 3D)',
    epic: 'Epic (Эпичный)',
    elite: 'Elite (Скрипт)',
    modular: 'Modular (Модульный)',
    '3d_ascii': '3D-ASCII (Каркасный 3D)',
    '3x5': '3x5 (Микро)',
    alligator: 'Alligator (Сегментный)',
    lineart: 'Line-Art (Тонкие рамки)',
    monument: 'Monument (Монолит)',
    cyber: 'Cyber (Двойной контур)',
    gothic: 'Gothic (Готика)',
    off: 'Выключить (без баннера)'
};

var THEMES = {
    classic_bw: {
        id: 'classic_bw',
        name: 'Classic Monochrome',
        tagline: 'Строгий минимализм, чистый монохром',
        logoStyle: 'ansi_shadow',
        colors: {
            accent: [255, 255, 255],
            secondary: [200, 200, 200],
            highlight: [255, 255, 255],
            muted: [120, 120, 120],
            border: [130, 130, 130],
            good: [230, 230, 230],
            warn: [190, 190, 190],
            bad: [140, 140, 140],
            titleBg: [15, 15, 15],
            cardBg: [0, 0, 0]
        },
        glyphs: {
            tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│',
            arrow: '>', caret: '█', dot: '·', up: '^', down: 'v', star: '★'
        }
    },
    monument: {
        id: 'monument',
        name: 'Monument Dark',
        tagline: 'Монументальные блоки, глубокий графит',
        logoStyle: 'monument',
        colors: {
            accent: [235, 240, 245],
            secondary: [160, 175, 190],
            highlight: [255, 255, 255],
            muted: [100, 110, 125],
            border: [70, 80, 95],
            good: [180, 220, 190],
            warn: [220, 200, 150],
            bad: [200, 110, 110],
            titleBg: [20, 24, 30],
            cardBg: [12, 15, 20]
        },
        glyphs: {
            tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│',
            arrow: '■', caret: '▌', dot: '·', up: '▲', down: '▼', star: '★'
        }
    },
    cyberpunk: {
        id: 'cyberpunk',
        name: 'Neon Cyberpunk',
        tagline: 'Электрический циан, неоновый пурпур',
        logoStyle: 'slant',
        colors: {
            accent: [0, 240, 255],
            secondary: [255, 0, 127],
            highlight: [157, 0, 255],
            muted: [90, 105, 135],
            border: [110, 0, 200],
            good: [0, 255, 160],
            warn: [255, 215, 0],
            bad: [255, 45, 85],
            titleBg: [30, 10, 48],
            cardBg: [12, 10, 22]
        },
        glyphs: {
            tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║',
            arrow: '▶', caret: '▋', dot: '◆', up: '▲', down: '▼', star: '★'
        }
    },
    cinema: {
        id: 'cinema',
        name: 'Cinema Noir & Gold',
        tagline: 'Обсидиан и бархатное золото',
        logoStyle: 'doom',
        colors: {
            accent: [245, 185, 65],
            secondary: [255, 220, 130],
            highlight: [255, 140, 50],
            muted: [130, 125, 120],
            border: [160, 120, 45],
            good: [130, 210, 130],
            warn: [255, 190, 60],
            bad: [220, 80, 80],
            titleBg: [28, 22, 15],
            cardBg: [15, 14, 16]
        },
        glyphs: {
            tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
            arrow: '❯', caret: '▎', dot: '·', up: '↑', down: '↓', star: '★'
        }
    },
    matrix: {
        id: 'matrix',
        name: 'Matrix Hacker',
        tagline: 'Фосфорный монохром, кибернетика',
        logoStyle: 'cyber',
        colors: {
            accent: [0, 255, 110],
            secondary: [140, 255, 180],
            highlight: [0, 200, 80],
            muted: [45, 115, 65],
            border: [0, 160, 65],
            good: [50, 255, 140],
            warn: [200, 255, 50],
            bad: [255, 70, 70],
            titleBg: [5, 22, 10],
            cardBg: [2, 12, 5]
        },
        glyphs: {
            tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│',
            arrow: '»', caret: '█', dot: '▪', up: '▲', down: '▼', star: '★'
        }
    },
    nordic: {
        id: 'nordic',
        name: 'Nordic Frost',
        tagline: 'Арктический синий и белый ледник',
        logoStyle: 'small',
        colors: {
            accent: [136, 192, 208],
            secondary: [129, 161, 193],
            highlight: [236, 239, 244],
            muted: [94, 129, 172],
            border: [76, 86, 106],
            good: [163, 190, 140],
            warn: [235, 203, 139],
            bad: [191, 97, 106],
            titleBg: [46, 52, 64],
            cardBg: [36, 41, 51]
        },
        glyphs: {
            tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
            arrow: '›', caret: '▌', dot: '·', up: '↑', down: '↓', star: '★'
        }
    }
};

// Генерация цветного ANSI логотипа с адаптивным масштабированием
function renderLogo(themeId, bannerStyle, maxWidth, bannerSize) {
    if (bannerStyle === 'off') {
        return [];
    }

    var theme = THEMES[themeId] || THEMES.classic_bw;
    var styleKey = (bannerStyle && bannerStyle !== 'auto') ? bannerStyle : (theme.logoStyle || 'slant');
    var maxW = (maxWidth && maxWidth > 20) ? (maxWidth - 2) : 80;
    var sizeMode = bannerSize || 'auto';

    var rawLines = null;

    // Вспомогательная функция для получения сырых строк через figlet
    function getFigletRaw(text, fontKey) {
        if (!figlet) return null;
        var fontName = FIGLET_FONT_MAP[fontKey];
        if (!fontName) return null;
        try {
            var gen = figlet.textSync(text, { font: fontName });
            if (!gen) return null;
            var arr = gen.split('\n').filter(function (l) { return l.length > 0; });
            return arr.length > 0 ? arr : null;
        } catch (e) {
            return null;
        }
    }

    // 1. Если это figlet шрифт
    if (FIGLET_FONT_MAP[styleKey]) {
        if (sizeMode === 'compact') {
            rawLines = getFigletRaw('KTW', styleKey);
        } else if (sizeMode === 'mini') {
            rawLines = getFigletRaw('ktw', 'calvin_s') || getFigletRaw('ktw', 'small') || getFigletRaw('ktw', styleKey);
        } else if (sizeMode === 'full') {
            rawLines = getFigletRaw('KINOTEKA', styleKey);
        } else {
            // Режим 'auto': проверяем, помещается ли полное слово KINOTEKA
            var fullCandidate = getFigletRaw('KINOTEKA', styleKey);
            if (fullCandidate) {
                var candidateW = Math.max.apply(null, fullCandidate.map(function (l) { return l.length; }));
                if (candidateW <= maxW) {
                    rawLines = fullCandidate;
                } else {
                    // Переключаемся на компактный KTW
                    rawLines = getFigletRaw('KTW', styleKey);
                }
            }
        }
    }

    // 2. Если это встроенный шрифт
    if (!rawLines && BUILTIN_LOGOS[styleKey]) {
        var bObj = BUILTIN_LOGOS[styleKey];
        if (sizeMode === 'compact' || sizeMode === 'mini') {
            rawLines = bObj.short || bObj.full;
        } else if (sizeMode === 'full') {
            rawLines = bObj.full;
        } else {
            var bFullW = Math.max.apply(null, bObj.full.map(function (l) { return l.length; }));
            rawLines = (bFullW <= maxW) ? bObj.full : (bObj.short || bObj.full);
        }
    }

    // Фоллбэк, если ничего не найдено
    if (!rawLines) {
        rawLines = BUILTIN_LOGOS.lineart.full;
    }

    // 3. Обрезаем строки, если они всё же превышают maxW (гарантия неломания рамок)
    var safeLines = rawLines.map(function (l) {
        return l.length > maxW ? l.slice(0, maxW) : l;
    });

    var c1 = theme.colors.accent;
    var c2 = theme.colors.secondary || theme.colors.highlight;

    // В монохроме красим ярким белым/серым
    if (theme.id === 'classic_bw') {
        return safeLines.map(function (l) {
            return ansi.style.bold(ansi.fg(240, 240, 240) + l + ansi.style.reset);
        });
    }

    // Раскрашиваем горизонтальным градиентом
    var rendered = [];
    safeLines.forEach(function (line) {
        var len = line.length;
        var coloredLine = '';
        for (var i = 0; i < len; i++) {
            var ratio = len > 1 ? (i / (len - 1)) : 0;
            var r = Math.round(c1[0] + ratio * (c2[0] - c1[0]));
            var g = Math.round(c1[1] + ratio * (c2[1] - c1[1]));
            var b = Math.round(c1[2] + ratio * (c2[2] - c1[2]));
            coloredLine += ansi.fg(r, g, b) + line[i];
        }
        coloredLine += ansi.style.reset;
        rendered.push(coloredLine);
    });

    return rendered;
}

module.exports = {
    BUILTIN_LOGOS: BUILTIN_LOGOS,
    FIGLET_FONT_MAP: FIGLET_FONT_MAP,
    FONT_KEYS: FONT_KEYS,
    FONT_LABELS: FONT_LABELS,
    THEMES: THEMES,
    renderLogo: renderLogo
};
