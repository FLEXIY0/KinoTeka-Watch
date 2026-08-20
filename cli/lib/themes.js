'use strict';

// Коллекция визуальных тем оформления и динамическая генерация ANSI/ASCII шрифтов через FIGlet.

var ansi = require('./ansi');
var figlet;
try {
    figlet = require('figlet');
} catch (e) {
    figlet = null;
}

var BUILTIN_LOGOS = {
    lineart: [
        '┌─┐ ┬ ┌┐┌ ┌─┐ ┌┬┐ ┌─┐ ┬┌─ ┌─┐',
        '├┴┐ │ │││ │ │  │  ├┤  ├┴┐ ├─┤',
        '┴ ┴ ┴ ┘└┘ └─┘  ┴  └─┘ ┴ ┴ ┴ ┴'
    ],
    monument: [
        '██   ██  ██  ███    ██   ██████   ████████  ████████  ██   ██   █████  ',
        '██  ██   ██  ████   ██  ██    ██     ██     ██        ██  ██   ██   ██ ',
        '█████    ██  ██ ██  ██  ██    ██     ██     ██████    █████    ███████ ',
        '██  ██   ██  ██  ██ ██  ██    ██     ██     ██        ██  ██   ██   ██ ',
        '██   ██  ██  ██   ████   ██████      ██     ████████  ██   ██  ██   ██ '
    ],
    gothic: [
        '  ▄▄▄  ▄ ▄▄   ▄  ▄▄▄  ▄▄▄▄▄ ▄▄▄▄ ▄▄▄  ▄   ▄ ',
        '  █  █ █ █ █  █ █   █   █   █    █  █ █   █ ',
        '  █▀▀▄ █ █  █ █ █   █   █   █▀▀  █▀▀▄ █▀▀▀█ ',
        '  █  █ █ █   ██  ▀▄▄▀   █   █▄▄▄ █  █ █   █ '
    ],
    cyber: [
        '╦╔═ ╦ ╔╗╔ ╔═╗ ╔╦╗ ╔═╗ ╦╔═ ╔═╗',
        '╠╩╗ ║ ║║║ ║ ║  ║  ║╣  ╠╩╗ ╠═╣',
        '╩ ╩ ╩ ╝╚╝ ╚═╝  ╩  ╚═╝ ╩ ╩ ╩ ╩'
    ]
};

var FIGLET_FONT_MAP = {
    ansi_shadow: 'ANSI Shadow',
    slant: 'Slant',
    doom: 'Doom',
    standard: 'Standard',
    small: 'Small',
    cybermedium: 'Cybermedium',
    big: 'Big'
};

var FONT_KEYS = [
    'auto',
    'ansi_shadow',
    'slant',
    'doom',
    'standard',
    'small',
    'monument',
    'lineart',
    'cyber',
    'gothic',
    'off'
];

var FONT_LABELS = {
    auto: 'Авто (из темы)',
    ansi_shadow: 'ANSI Shadow (3D Блоки)',
    slant: 'Slant (Наклонный 3D)',
    doom: 'Doom (Классика игр)',
    standard: 'Standard (ASCII)',
    small: 'Small (Компактный)',
    monument: 'Monument (Монолит)',
    lineart: 'Line-Art (Тонкие рамки)',
    cyber: 'Cyber (Кибернетика)',
    gothic: 'Gothic (Готика)',
    off: 'Выключить (без баннера)'
};

var THEMES = {
    classic_bw: {
        id: 'classic_bw',
        name: 'Classic Monochrome',
        tagline: 'Строгий минимализм, чистый монохром',
        logoStyle: 'lineart',
        colors: {
            accent: [255, 255, 255],
            secondary: [210, 210, 210],
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
        logoStyle: 'gothic',
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
        logoStyle: 'lineart',
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

// Генерация цветного ANSI логотипа с горизонтальным градиентом
function renderLogo(themeId, bannerStyle, maxWidth) {
    if (bannerStyle === 'off') {
        return [];
    }

    var theme = THEMES[themeId] || THEMES.classic_bw;
    var styleKey = (bannerStyle && bannerStyle !== 'auto') ? bannerStyle : (theme.logoStyle || 'slant');

    var rawLines = null;

    // 1. Проверяем генератор figlet
    if (figlet && FIGLET_FONT_MAP[styleKey]) {
        try {
            var fontName = FIGLET_FONT_MAP[styleKey];
            var text = (maxWidth && maxWidth < 65) ? 'KTW' : 'KINOTEKA';
            var generated = figlet.textSync(text, { font: fontName });
            if (generated) {
                rawLines = generated.split('\n').filter(function (l) { return l.length > 0; });
            }
        } catch (e) {
            rawLines = null;
        }
    }

    // 2. Встроенные шрифты
    if (!rawLines) {
        rawLines = BUILTIN_LOGOS[styleKey] || BUILTIN_LOGOS.lineart;
    }

    var c1 = theme.colors.accent;
    var c2 = theme.colors.secondary || theme.colors.highlight;

    if (theme.id === 'classic_bw') {
        return rawLines.map(function (l) {
            return ansi.style.bold(ansi.fg(240, 240, 240) + l + ansi.style.reset);
        });
    }

    var rendered = [];
    rawLines.forEach(function (line) {
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
