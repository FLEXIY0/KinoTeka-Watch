'use strict';

// Низкоуровневые примитивы терминала: цвета, ширина строк, рамки.
// Глубина цвета определяется по окружению, чтобы не рассыпаться
// на старых терминалах (linux console, urxvt без truecolor).

// Любая CSI-последовательность: считать её ширину нельзя ни в каком виде
var CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

var depth = detectDepth();
var ascii = !!process.env.KTW_ASCII || /^(dumb|vt100|vt102)$/.test(process.env.TERM || '');

function detectDepth() {
    if (process.env.NO_COLOR) return 0;
    if (!process.stdout.isTTY) return 0;

    var colorterm = process.env.COLORTERM || '';
    if (/truecolor|24bit/i.test(colorterm)) return 3;

    var term = process.env.TERM || '';
    if (/256(color)?/.test(term)) return 2;
    if (/^(xterm|screen|tmux|rxvt|linux|vt220|ansi)/.test(term)) return 1;

    return 0;
}

// Приведение RGB к палитре xterm-256
function to256(r, g, b) {
    if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
        var gray = Math.round((r + g + b) / 3);
        if (gray < 8) return 16;
        if (gray > 248) return 231;
        return 232 + Math.round(((gray - 8) / 247) * 23);
    }

    return 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);
}

function fg(r, g, b) {
    if (depth === 0) return '';
    if (depth === 3) return '\x1b[38;2;' + r + ';' + g + ';' + b + 'm';
    if (depth === 2) return '\x1b[38;5;' + to256(r, g, b) + 'm';
    return '';
}

function bg(r, g, b) {
    if (depth === 0) return '';
    if (depth === 3) return '\x1b[48;2;' + r + ';' + g + ';' + b + 'm';
    if (depth === 2) return '\x1b[48;5;' + to256(r, g, b) + 'm';
    return '';
}

function sgr(code, text) {
    return depth === 0 ? text : '\x1b[' + code + 'm' + text + '\x1b[0m';
}

var style = {
    reset: depth === 0 ? '' : '\x1b[0m',
    bold: function (t) { return sgr('1', t); },
    dim: function (t) { return sgr('2', t); },
    italic: function (t) { return sgr('3', t); },
    inverse: function (t) { return sgr('7', t); },
    accent: function (t) { return depth === 0 ? t : fg(120, 200, 255) + t + '\x1b[0m'; },
    muted: function (t) { return depth === 0 ? t : fg(120, 125, 135) + t + '\x1b[0m'; },
    border: function (t) { return depth === 0 ? t : fg(80, 85, 95) + t + '\x1b[0m'; },
    good: function (t) { return depth === 0 ? t : fg(120, 220, 150) + t + '\x1b[0m'; },
    warn: function (t) { return depth === 0 ? t : fg(240, 200, 110) + t + '\x1b[0m'; },
    bad: function (t) { return depth === 0 ? t : fg(240, 120, 120) + t + '\x1b[0m'; }
};

// Символы рамок; для совсем древних терминалов — ASCII
var glyph = ascii
    ? { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', arrow: '>', caret: '_', dot: '*', up: '^', down: 'v' }
    : { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', arrow: '❯', caret: '▏', dot: '·', up: '↑', down: '↓' };

// Видимая ширина строки без управляющих последовательностей
function visibleWidth(text) {
    return Array.from(String(text).replace(CSI_RE, '')).length;
}

function strip(text) {
    return String(text).replace(CSI_RE, '');
}

// Убираем всё, кроме раскраски: chafa любит подмешивать управление курсором
function keepColorsOnly(text) {
    return String(text).replace(CSI_RE, function (match) {
        return /m$/.test(match) ? match : '';
    });
}

function repeat(char, count) {
    return count > 0 ? new Array(count + 1).join(char) : '';
}

// Дополнение до нужной ширины с учётом невидимых последовательностей
function pad(text, width) {
    return text + repeat(' ', width - visibleWidth(text));
}

// Обрезка по видимой ширине; вызывать до раскраски
function truncate(text, width) {
    var chars = Array.from(String(text));
    if (chars.length <= width) return String(text);
    if (width <= 1) return chars.slice(0, width).join('');

    return chars.slice(0, width - 1).join('') + '…';
}

// Разбивка текста по словам
function wrap(text, width, maxLines) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';

    for (var i = 0; i < words.length; i++) {
        var candidate = line ? line + ' ' + words[i] : words[i];

        if (visibleWidth(candidate) > width && line) {
            lines.push(line);
            line = words[i];
            if (maxLines && lines.length === maxLines) break;
        } else {
            line = candidate;
        }
    }

    if (line && (!maxLines || lines.length < maxLines)) lines.push(line);

    if (maxLines && lines.length === maxLines && words.length > 0) {
        var last = lines[maxLines - 1];
        var joined = lines.join(' ');
        if (visibleWidth(joined) < visibleWidth(String(text))) {
            lines[maxLines - 1] = truncate(last, width - 1) + '…';
        }
    }

    return lines;
}

module.exports = {
    depth: depth,
    ascii: ascii,
    style: style,
    glyph: glyph,
    fg: fg,
    bg: bg,
    visibleWidth: visibleWidth,
    strip: strip,
    keepColorsOnly: keepColorsOnly,
    repeat: repeat,
    pad: pad,
    truncate: truncate,
    wrap: wrap
};
