'use strict';

// Коллекция визуальных тем оформления и динамический ANSI генератор на cfonts и figlet.

var ansi = require('./ansi');

var cfonts;
try {
    cfonts = require('cfonts');
} catch (e) {
    cfonts = null;
}

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
    ]
};

var FONT_KEYS = [
    'auto',
    'block',
    'slick',
    'grid',
    'shade',
    'pallet',
    'chrome',
    'simple3d',
    'slant',
    'doom',
    'standard',
    'tiny',
    'lineart',
    'off'
];

var FONT_LABELS = {
    auto: 'Авто (под тему)',
    block: 'Block (3D ANSI Блоки)',
    slick: 'Slick (Диагональный изометрик)',
    grid: 'Grid (Матричная сетка)',
    shade: 'Shade (Текстурный градиент)',
    pallet: 'Pallet (Теневой)',
    chrome: 'Chrome (Кибер контур)',
    simple3d: 'Simple3D (Наклонный 3D)',
    slant: 'Slant (Классика Slant)',
    doom: 'Doom (Игровой)',
    standard: 'Standard (ASCII)',
    tiny: 'Tiny (Компактный)',
    lineart: 'Line-Art (Тонкие рамки)',
    off: 'Выключить (без баннера)'
};

var THEMES = {
    classic_bw: {
        id: 'classic_bw',
        name: 'Classic Monochrome',
        tagline: 'Строгий минимализм, чистый монохром',
        logoStyle: 'block',
        hexColors: ['#ffffff', '#888888'],
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
        logoStyle: 'block',
        hexColors: ['#ebf0f5', '#788c9e'],
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
        logoStyle: 'block',
        hexColors: ['#00f0ff', '#ff007f'],
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
        logoStyle: 'shade',
        hexColors: ['#f5b941', '#ff8c32'],
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
        logoStyle: 'grid',
        hexColors: ['#00ff6e', '#8cffb4'],
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
        logoStyle: 'slick',
        hexColors: ['#88c0d0', '#81a1c1'],
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

var CFONTS_LIST = ['block', 'slick', 'grid', 'shade', 'pallet', 'chrome', 'simple3d', 'tiny'];

// Динамическая генерация цветного ANSI логотипа
function renderLogo(themeId, bannerStyle, maxWidth) {
    if (bannerStyle === 'off') {
        return [];
    }

    var theme = THEMES[themeId] || THEMES.classic_bw;
    var styleKey = (bannerStyle && bannerStyle !== 'auto') ? bannerStyle : (theme.logoStyle || 'block');
    var isShort = (maxWidth && maxWidth < 70);
    var text = isShort ? 'KTW' : 'KINOTEKA';

    // 1. Генерация через cfonts (нативные градиенты и ANSI тени)
    if (cfonts && CFONTS_LIST.indexOf(styleKey) >= 0) {
        try {
            var rendered = cfonts.render(text, {
                font: styleKey,
                gradient: theme.hexColors || ['#00f0ff', '#ff007f'],
                transitionGradient: true,
                letterSpacing: 1,
                lineHeight: 1,
                space: false
            });
            if (rendered && Array.isArray(rendered.array) && rendered.array.length > 0) {
                return rendered.array.filter(function (l) { return l.trim().length > 0; });
            }
        } catch (e) {
            // fallback
        }
    }

    // 2. Генерация через figlet (Slant, Doom, Standard)
    var FIGLET_MAP = {
        slant: 'Slant',
        doom: 'Doom',
        standard: 'Standard'
    };

    if (figlet && FIGLET_MAP[styleKey]) {
        try {
            var fontName = FIGLET_MAP[styleKey];
            var generated = figlet.textSync(text, { font: fontName });
            if (generated) {
                var lines = generated.split('\n').filter(function (l) { return l.length > 0; });
                var c1 = theme.colors.accent;
                var c2 = theme.colors.secondary || theme.colors.highlight;
                return lines.map(function (line) {
                    var len = line.length;
                    var colLine = '';
                    for (var i = 0; i < len; i++) {
                        var ratio = len > 1 ? (i / (len - 1)) : 0;
                        var r = Math.round(c1[0] + ratio * (c2[0] - c1[0]));
                        var g = Math.round(c1[1] + ratio * (c2[1] - c1[1]));
                        var b = Math.round(c1[2] + ratio * (c2[2] - c1[2]));
                        colLine += ansi.fg(r, g, b) + line[i];
                    }
                    return colLine + ansi.style.reset;
                });
            }
        } catch (e) {
            // fallback
        }
    }

    // 3. Встроенный минималистичный fallback
    var rawLines = BUILTIN_LOGOS[styleKey] || BUILTIN_LOGOS.lineart;
    return rawLines.map(function (l) {
        return ansi.style.bold(ansi.fg(theme.colors.accent[0], theme.colors.accent[1], theme.colors.accent[2]) + l + ansi.style.reset);
    });
}

module.exports = {
    CFONTS_LIST: CFONTS_LIST,
    FONT_KEYS: FONT_KEYS,
    FONT_LABELS: FONT_LABELS,
    THEMES: THEMES,
    renderLogo: renderLogo
};
