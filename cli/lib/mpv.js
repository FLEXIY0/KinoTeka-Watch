'use strict';

// Запуск mpv с потоком.
// Referer и User-Agent обязательны: CDN балансеров отдают сегменты
// только с теми же заголовками, с какими их запрашивал бы браузер.

var spawn = require('child_process').spawn;
var config = require('./config');

function buildArgs(stream, title, extraArgs) {
    var userConfig = config.read();

    var args = [
        '--user-agent=' + (stream.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'),
        '--referrer=' + stream.referer,
        // В --http-header-fields значения разделяются запятой
        '--http-header-fields=Origin: ' + stream.origin
    ];

    if (title) {
        args.push('--force-media-title=' + title);
    }

    // Передача конкретной звуковой дорожки (--aid)
    if (stream.audioId !== undefined && stream.audioId !== null) {
        args.push('--aid=' + stream.audioId);
    }

    // Субтитры, если доступны
    if (stream.subtitleUrl) {
        args.push('--sub-file=' + stream.subtitleUrl);
    } else if (stream.subtitles && stream.subtitles.length > 0) {
        stream.subtitles.forEach(function (sub) {
            if (sub && sub.url) {
                args.push('--sub-file=' + sub.url);
            }
        });
    }

    // Настройки пользователя из конфига (Fullscreen, HWDEC, Custom Args)
    if (userConfig.mpvFullscreen) {
        args.push('--fs');
    }
    if (userConfig.mpvHardwareDec && userConfig.mpvHardwareDec !== 'no') {
        args.push('--hwdec=' + userConfig.mpvHardwareDec);
    }
    if (userConfig.mpvCustomArgs && Array.isArray(userConfig.mpvCustomArgs)) {
        args = args.concat(userConfig.mpvCustomArgs);
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
    buildArgs: buildArgs,
    buildCommand: buildCommand,
    play: play
};
