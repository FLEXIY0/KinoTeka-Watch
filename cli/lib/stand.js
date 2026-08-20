'use strict';

// Интерактивный выставочный стенд тем оформления (Theme Showcase Stand) для KTW.
// Позволяет в реальном времени переключать темы и сразу видеть все элементы интерфейса.

var ansi = require('./ansi');
var tui = require('./tui');
var themes = require('./themes');
var config = require('./config');

var style = ansi.style;

function renderStand(themeId) {
    var theme = themes.THEMES[themeId] || themes.THEMES.cyberpunk;
    var logoLines = themes.renderLogo(themeId);
    var g = theme.glyphs;
    var c = theme.colors;

    function colorFg(rgb, text) {
        return ansi.fg(rgb[0], rgb[1], rgb[2]) + text + ansi.style.reset;
    }

    var size = tui.size();
    var width = Math.max(56, Math.min(size.cols - 4, 84));
    var inner = width - 2;

    var head = colorFg(c.border, g.tl + g.h + ' ') + style.bold(colorFg(c.accent, theme.name)) + ' ' +
        colorFg(c.border, ansi.repeat(g.h, Math.max(0, inner - ansi.visibleWidth(theme.name) - 3)) + g.tr);

    var lines = [head];

    function addRow(text) {
        lines.push(colorFg(c.border, g.v) + ansi.pad(text, inner) + colorFg(c.border, g.v));
    }

    addRow('');
    // 1. Логотип по центру
    logoLines.forEach(function (l) {
        var len = ansi.visibleWidth(l);
        var indent = ansi.repeat(' ', Math.max(0, Math.floor((inner - len) / 2)));
        addRow(indent + l);
    });

    addRow('');
    var tagline = style.muted(theme.tagline);
    var tagIndent = ansi.repeat(' ', Math.max(0, Math.floor((inner - ansi.visibleWidth(tagline)) / 2)));
    addRow(tagIndent + tagline);
    addRow('');

    // 2. Палитра цветов (Swatches)
    var swatches = [
        colorFg(c.accent, '■ Accent'),
        colorFg(c.secondary, '■ Secondary'),
        colorFg(c.highlight, '■ Highlight'),
        colorFg(c.border, '■ Border'),
        colorFg(c.good, '■ ⚡ Direct'),
        colorFg(c.warn, '■ 1080p'),
        colorFg(c.bad, '■ 4K')
    ].join('   ');
    var swatchIndent = ansi.repeat(' ', Math.max(0, Math.floor((inner - ansi.visibleWidth(swatches)) / 2)));
    addRow(swatchIndent + swatches);
    addRow('');

    // 3. Разделитель
    addRow(colorFg(c.border, '  ' + ansi.repeat(g.h, inner - 4)));
    addRow('');

    // 4. Пример карточки фильма и элементов управления
    addRow('  ' + colorFg(c.accent, g.film + ' ') + style.bold('Матрица') + style.muted(' (The Matrix · 1999 · ★ 8.5)'));
    addRow('  ' + colorFg(c.secondary, '  ' + g.arrow + ' ') + style.bold(colorFg(c.accent, 'Collaps')) +
        colorFg(c.good, ' ⚡[прямой]') + style.muted(' · 15 озв. · FHD (1080p)'));
    addRow('    ' + style.muted('  Alloha ⚡ · 7 озв. · BDRip'));
    addRow('    ' + style.muted('  Kodik ⚡ · 4 озв. · 720p'));
    addRow('');

    addRow('  ' + style.bold('Озвучка: ') + colorFg(c.secondary, '«Кубик в кубе»') +
        style.muted('  ' + g.dot + '  ') + style.bold('Качество: ') + colorFg(c.warn, '1080p FHD') +
        style.muted(' (4200 кбит/с)'));
    addRow('  ' + style.bold('Прогресс: ') + colorFg(c.good, '01:14:20 / 02:16:00 (54%) ') +
        colorFg(c.accent, '▰▰▰▰▰▰▰▱▱▱▱▱'));
    addRow('');

    // 5. Нижняя рамка
    lines.push(colorFg(c.border, g.bl + ansi.repeat(g.h, inner) + g.br));

    // Навигация
    var themeKeys = Object.keys(themes.THEMES);
    var currentIndex = themeKeys.indexOf(themeId);
    var navStr = '←/→ тема (' + (currentIndex + 1) + '/' + themeKeys.length + ')  ·  Enter применить тему  ·  Esc назад';
    var navCentered = Math.max(0, Math.floor((width - ansi.visibleWidth(navStr)) / 2));
    lines.push('');
    lines.push(ansi.repeat(' ', navCentered) + style.muted(navStr));

    return lines;
}

async function runStand() {
    var themeKeys = Object.keys(themes.THEMES);
    var currentConfig = config.read();
    var currentIndex = Math.max(0, themeKeys.indexOf(currentConfig.theme || 'cyberpunk'));

    tui.enter();

    try {
        while (true) {
            var activeThemeId = themeKeys[currentIndex];
            tui.paint(renderStand(activeThemeId));

            var key = await tui.readKey();

            if (key.name === 'escape') {
                return null;
            }

            if (key.name === 'left' || key.name === 'up') {
                currentIndex = (currentIndex - 1 + themeKeys.length) % themeKeys.length;
                continue;
            }

            if (key.name === 'right' || key.name === 'down') {
                currentIndex = (currentIndex + 1) % themeKeys.length;
                continue;
            }

            if (key.name === 'return' || key.name === 'space') {
                var selectedTheme = themeKeys[currentIndex];
                config.save({ theme: selectedTheme });
                return selectedTheme;
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
