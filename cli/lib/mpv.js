'use strict';

// Запуск mpv с потоком.
// Referer и User-Agent обязательны: CDN балансеров отдают сегменты
// только с теми же заголовками, с какими их запрашивал бы браузер.

var spawn = require('child_process').spawn;

function buildArgs(stream, title, extraArgs) {
    var args = [
        '--user-agent=' + stream.userAgent,
        '--referrer=' + stream.referer,
        // В --http-header-fields значения разделяются запятой,
        // поэтому сюда кладём только Origin — в нём запятых не бывает
        '--http-header-fields=Origin: ' + stream.origin
    ];

    if (title) {
        args.push('--force-media-title=' + title);
    }

    if (extraArgs && extraArgs.length > 0) {
        args = args.concat(extraArgs);
    }

    args.push(stream.url);

    return args;
}

// Строка команды для копипаста (когда mpv нет или указан --no-mpv)
function buildCommand(stream, title, extraArgs) {
    var quoted = buildArgs(stream, title, extraArgs).map(function (arg) {
        return /[^\w@%+=:,./-]/.test(arg) ? "'" + arg.replace(/'/g, "'\\''") + "'" : arg;
    });

    return 'mpv ' + quoted.join(' ');
}

// Запуск mpv; резолвится кодом выхода
function play(stream, title, extraArgs) {
    return new Promise(function (resolve, reject) {
        var child = spawn('mpv', buildArgs(stream, title, extraArgs), { stdio: 'inherit' });

        child.on('error', function (err) {
            if (err.code === 'ENOENT') {
                reject(new Error('mpv не найден в PATH. Установи mpv или запусти с --no-mpv'));
                return;
            }
            reject(err);
        });

        child.on('exit', function (code) {
            resolve(code === null ? 0 : code);
        });
    });
}

module.exports = {
    play: play,
    buildCommand: buildCommand
};
