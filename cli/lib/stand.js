'use strict';

// Интерактивный выставочный стенд живой настройки стилей оформления и ANSI шрифтов для KTW.

var ansi = require('./ansi');
var tui = require('./tui');
var themes = require('./themes');
var config = require('./config');

var style = ansi.style;

function renderStand(themeId, bannerStyle) {
    var theme = themes.THEMES[themeId] || themes.THEMES.classic_bw;
    var size = tui.size();
    var width = Math.max(56, Math.min(size.cols - 4, 88));
    var inner = width - 2;

    var logoLines = themes.renderLogo(themeId, bannerStyle, inner);
    var g = theme.glyphs;
    var c = theme.colors;

    function colorFg(rgb, text) {
        return ansi.fg(rgb[0], rgb[1], rgb[2]) + text + ansi.style.reset;
    }

    var fontLabel = themes.FONT_LABELS[bannerStyle] || bannerStyle;
    var headerTitle = theme.name + '  ·  Шрифт: ' + fontLabel;

    var head = colorFg(c.border, g.tl + g.h + ' ') + style.bold(colorFg(c.accent, headerTitle)) + ' ' +
        colorFg(c.border, ansi.repeat(g.h, Math.max(0, inner - ansi.visibleWidth(headerTitle) - 3)) + g.tr);

    var lines = [head];

    function addRow(text) {
        lines.push(colorFg(c.border, g.v) + ansi.pad(text, inner) + colorFg(c.border, g.v));
    }

    addRow('');
    // 1. Динамический логотип
    if (logoLines.length > 0) {
        logoLines.forEach(function (l) {
            var len = ansi.visibleWidth(l);
            var indent = ansi.repeat(' ', Math.max(0, Math.floor((inner - len) / 2)));
            addRow(indent + l);
        });
        addRow('');
    } else {
        var noLogo = style.muted('[ Баннер выключен ]');
        var noLogoIndent = ansi.repeat(' ', Math.max(0, Math.floor((inner - ansi.visibleWidth(noLogo)) / 2)));
        addRow(noLogoIndent + noLogo);
        addRow('');
    }

    // 2. Описание темы
    var tagline = style.muted(theme.tagline);
    var tagIndent = ansi.repeat(' ', Math.max(0, Math.floor((inner - ansi.visibleWidth(tagline)) / 2)));
    addRow(tagIndent + tagline);
    addRow('');

    // 3. Палитра цветов
    var swatches = [
        colorFg(c.accent, '■ Accent'),
        colorFg(c.secondary, '■ Secondary'),
        colorFg(c.highlight, '■ Highlight'),
        colorFg(c.border, '■ Border'),
        colorFg(c.good, '■ Direct'),
        colorFg(c.warn, '■ 1080p')
    ].join('   ');
    var swatchIndent = ansi.repeat(' ', Math.max(0, Math.floor((inner - ansi.visibleWidth(swatches)) / 2)));
    addRow(swatchIndent + swatches);
    addRow('');

    // 4. Разделитель
    addRow(colorFg(c.border, '  ' + ansi.repeat(g.h, inner - 4)));
    addRow('');

    // 5. Живой пример интерфейса с прогресс-баром и плеерами
    addRow('  ' + style.bold('Матрица') + style.muted(' (The Matrix · 1999 · ★ 8.5)'));
    addRow('  ' + colorFg(c.secondary, '  ' + g.arrow + ' ') + style.bold(colorFg(c.accent, 'Collaps')) +
        colorFg(c.good, ' [прямой]') + style.muted(' · 15 озв. · 1080p FHD'));
    addRow('    ' + style.muted('  Alloha [прямой] · 7 озв. · 720p'));
    addRow('    ' + style.muted('  Kodik [прямой] · 4 озв. · 720p'));
    addRow('');

    addRow('  ' + style.bold('Озвучка: ') + colorFg(c.secondary, '«Кубик в кубе»') +
        style.muted('  ·  ') + style.bold('Качество: ') + colorFg(c.warn, '1080p') +
        style.muted(' (4200 кбит/с)'));
    addRow('  ' + style.bold('Прогресс: ') + colorFg(c.good, '▰▰▰▰▰▰▰▱▱▱▱▱ 54%') + style.muted(' · 01:14:20 / 02:16:00'));
    addRow('');

    // 6. Нижняя рамка
    lines.push(colorFg(c.border, g.bl + ansi.repeat(g.h, inner) + g.br));

    // Навигация
    var themeKeys = Object.keys(themes.THEMES);
    var currentIndex = themeKeys.indexOf(themeId);
    var fontKeys = themes.FONT_KEYS;
    var fontIndex = fontKeys.indexOf(bannerStyle);

    var navStr = '←/→ тема (' + (currentIndex + 1) + '/' + themeKeys.length + ')  ·  ↑/↓ шрифт (' + (fontIndex + 1) + '/' + fontKeys.length + ')  ·  Enter применить  ·  Esc назад';
    var navCentered = Math.max(0, Math.floor((width - ansi.visibleWidth(navStr)) / 2));
    lines.push('');
    lines.push(ansi.repeat(' ', navCentered) + style.muted(navStr));

    return lines;
}

async function runStand() {
    var themeKeys = Object.keys(themes.THEMES);
    var fontKeys = themes.FONT_KEYS;
    var currentConfig = config.read();

    var currentIndex = Math.max(0, themeKeys.indexOf(currentConfig.theme || 'classic_bw'));
    var fontIndex = Math.max(0, fontKeys.indexOf(currentConfig.bannerStyle || 'auto'));

    tui.enter();

    try {
        while (true) {
            var activeThemeId = themeKeys[currentIndex];
            var activeBanner = fontKeys[fontIndex];
            tui.paint(renderStand(activeThemeId, activeBanner));

            var key = await tui.readKey();

            if (key.name === 'escape') {
                return null;
            }

            if (key.name === 'tab' || key.name === 'down') {
                fontIndex = (fontIndex + 1) % fontKeys.length;
                continue;
            }

            if (key.name === 'up') {
                fontIndex = (fontIndex - 1 + fontKeys.length) % fontKeys.length;
                continue;
            }

            if (key.name === 'left') {
                currentIndex = (currentIndex - 1 + themeKeys.length) % themeKeys.length;
                continue;
            }

            if (key.name === 'right') {
                currentIndex = (currentIndex + 1) % themeKeys.length;
                continue;
            }

            if (key.name === 'return' || key.name === 'space') {
                var selectedTheme = themeKeys[currentIndex];
                var selectedFont = fontKeys[fontIndex];
                config.save({ theme: selectedTheme, bannerStyle: selectedFont });
                return { theme: selectedTheme, bannerStyle: selectedFont };
            }
        }
    } finally {
        tui.exit();
    }
}

module.exports = {
    renderStand: renderStand,
    runStand: runStand
};
