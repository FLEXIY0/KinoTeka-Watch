'use strict';

// Коллекция визуальных стилей, цветовых палитр и ANSI арта для KTW.

var ansi = require('./ansi');

var LOGOS = {
    // 1. Компактный градиентный баннер
    sleek: [
        '█▀▀█ █ █ █ █▀▀█ ▀▀█▀▀ █▀▀ █ █ █▀▀█',
        '█▄▄▀ █ █▀▄ █  █   █   █▀▀ █▀▄ █▄▄█',
        '▀  ▀ ▀ ▀ ▀ ▀▀▀▀   ▀   ▀▀▀ ▀ ▀ ▀  ▀'
    ],
    // 2. Киберпанк / Неон 3D
    cyber: [
        '╦╔═ ╦ ╔╗╔ ╔═╗ ╔╦╗ ╔═╗ ╦╔═ ╔═╗',
        '╠╩╗ ║ ║║║ ║ ║  ║  ║╣  ╠╩╗ ╠═╣',
        '╩ ╩ ╩ ╝╚╝ ╚═╝  ╩  ╚═╝ ╩ ╩ ╩ ╩'
    ],
    // 3. Кинолента / Киноплёнка
    cinema: [
        '░█▀▀░█░█░█▀▀░█▀▀█ ░▀█▀░█▀▀░█░█░█▀▀█',
        '░█░░░█▀▄░█▀▀░█░░█ ░░█░░█▀▀░█▀▄░█▄▄█',
        '░▀▀▀░▀░▀░▀▀▀░▀▀▀▀ ░░▀░░▀▀▀░▀░▀░▀░░▀'
    ],
    // 4. Минималистичный микро-логотип
    mini: [
        '▰▰▰ KINOTEKA WATCH ▰▰▰'
    ]
};

var THEMES = {
    cyberpunk: {
        id: 'cyberpunk',
        name: 'Neon Cyberpunk (Неон / Киберпанк)',
        tagline: 'Электрический циан, неоновый пурпур и глитч-эффекты',
        logoStyle: 'cyber',
        colors: {
            accent: [0, 240, 255],     // Electric Cyan
            secondary: [255, 0, 127],  // Neon Pink/Magenta
            highlight: [157, 0, 255],  // Purple Glow
            muted: [100, 115, 145],    // Slate Blue
            border: [120, 0, 220],     // Deep Neon Violet
            good: [0, 255, 160],       // Mint Neon
            warn: [255, 215, 0],       // Gold
            bad: [255, 45, 85],        // Crimson
            titleBg: [35, 10, 55],
            cardBg: [15, 12, 28]
        },
        glyphs: {
            tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║',
            arrow: '▶', caret: '▋', dot: '◆', up: '▲', down: '▼', star: '★', film: '🎞️'
        }
    },
    cinema: {
        id: 'cinema',
        name: 'Cinema Noir & Gold (Тёмное Золото / Премиум Кино)',
        tagline: 'Глубокий обсидиан, бархатное золото и эстетика IMAX',
        logoStyle: 'cinema',
        colors: {
            accent: [245, 185, 65],    // Warm Amber Gold
            secondary: [255, 220, 130],// Soft Champagne
            highlight: [255, 140, 50], // Sunset Copper
            muted: [135, 130, 125],    // Muted Gray
            border: [170, 125, 45],    // Antique Bronze
            good: [130, 220, 130],     // Emerald
            warn: [255, 190, 60],      // Amber
            bad: [230, 80, 80],        // Ruby
            titleBg: [30, 25, 18],
            cardBg: [18, 18, 20]
        },
        glyphs: {
            tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
            arrow: '❯', caret: '▎', dot: '✦', up: '↑', down: '↓', star: '★', film: '🎬'
        }
    },
    matrix: {
        id: 'matrix',
        name: 'Matrix Hacker (Матрица / Зелёный Терминал)',
        tagline: 'Классический фосфорный монохром и кибернетический дух',
        logoStyle: 'sleek',
        colors: {
            accent: [0, 255, 110],     // Phosphor Green
            secondary: [140, 255, 180],// Light Mint
            highlight: [0, 200, 80],   // Matrix Code Green
            muted: [50, 125, 75],      // Dim Forest
            border: [0, 170, 70],      // Deep Green
            good: [50, 255, 140],
            warn: [200, 255, 50],
            bad: [255, 70, 70],
            titleBg: [5, 25, 10],
            cardBg: [2, 15, 5]
        },
        glyphs: {
            tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│',
            arrow: '»', caret: '█', dot: '▪', up: '▲', down: '▼', star: '★', film: '▤'
        }
    },
    tokyo: {
        id: 'tokyo',
        name: 'Tokyo Night & Synthwave (Токио Ночь / Синтвейв)',
        tagline: 'Фиолетовые сумерки, лавандовый и пастельный циан',
        logoStyle: 'sleek',
        colors: {
            accent: [125, 207, 255],   // Sky Cyan
            secondary: [187, 154, 247],// Soft Lavender
            highlight: [247, 118, 142],// Rose Pink
            muted: [100, 110, 145],    // Slate Purple
            border: [140, 100, 210],   // Violet
            good: [158, 206, 106],     // Lime
            warn: [224, 175, 104],     // Warm Ochre
            bad: [247, 118, 142],
            titleBg: [26, 27, 38],
            cardBg: [19, 20, 30]
        },
        glyphs: {
            tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
            arrow: '➜', caret: '▏', dot: '•', up: '↑', down: '↓', star: '★', film: '📼'
        }
    },
    nordic: {
        id: 'nordic',
        name: 'Nordic Frost (Северный Ледник / Минимализм)',
        tagline: 'Арктический синий, чистый белый и морозный минимализм',
        logoStyle: 'sleek',
        colors: {
            accent: [136, 192, 208],   // Frost Blue
            secondary: [129, 161, 193],// Ice Blue
            highlight: [236, 239, 244],// Snow White
            muted: [94, 129, 172],     // Steel Blue
            border: [76, 86, 106],     // Dark Slate
            good: [163, 190, 140],     // Sage Green
            warn: [235, 203, 139],     // Warm Sand
            bad: [191, 97, 106],       // Polar Red
            titleBg: [46, 52, 64],
            cardBg: [36, 41, 51]
        },
        glyphs: {
            tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│',
            arrow: '›', caret: '▌', dot: '·', up: '↑', down: '↓', star: '★', film: '❄'
        }
    }
};

// Генерация цветного ANSI логотипа с горизонтальным градиентом
function renderLogo(themeId) {
    var theme = THEMES[themeId] || THEMES.cyberpunk;
    var rawLines = LOGOS[theme.logoStyle] || LOGOS.sleek;
    var c1 = theme.colors.accent;
    var c2 = theme.colors.secondary || theme.colors.highlight;

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
    LOGOS: LOGOS,
    THEMES: THEMES,
    renderLogo: renderLogo
};
