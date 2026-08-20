'use strict';

// Запуск mpv с потоком и отслеживанием прогресса через IPC сокет.
// Referer и User-Agent обязательны: CDN балансеров отдают сегменты
// только с теми же заголовками, с какими их запрашивал бы браузер.

var spawn = require('child_process').spawn;
var net = require('net');
var fs = require('fs');
var path = require('path');
var os = require('os');
var config = require('./config');
var history = require('./history');

// Генерация пути к IPC сокету
function generateSocketPath() {
    var id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    if (process.platform === 'win32') {
        return '\\\\.\\pipe\\ktw-mpv-' + id;
    }
    return path.join(os.tmpdir(), 'ktw-mpv-' + id + '.sock');
}

function buildArgs(stream, title, extraArgs, socketPath) {
    var userConfig = config.read();

    var args = [
        '--user-agent=' + (stream.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'),
        '--referrer=' + stream.referer,
        '--http-header-fields=Origin: ' + stream.origin,
        '--really-quiet',
        '--msg-level=all=no',
        '--terminal=no',
        '--cache=yes',
        '--demuxer-max-bytes=250MiB',
        '--demuxer-max-back-bytes=100MiB',
        '--demuxer-readahead-secs=180',
        '--hr-seek=yes',
        '--hr-seek-framedrop=yes',
        '--input-cursor=yes',
        '--osc=yes',
        '--script-opts=osc-scalewindowed=1.2,osc-scalefullscreen=1.2,osc-visibility=auto'
    ];

    if (title) {
        args.push('--force-media-title=' + title);
    }

    // Привязка к IPC сокету для сохранения прогресса и отслеживания таймкода
    if (socketPath) {
        args.push('--input-ipc-server=' + socketPath);
    }

    // Возобновление с нужной секунды (--start)
    if (stream.startTime && Number(stream.startTime) > 0) {
        args.push('--start=' + Math.floor(Number(stream.startTime)));
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

    // Настройки пользователя из конфига
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

// Подключение к MPV IPC сокету и отслеживание времени воспроизведения
function monitorIpc(socketPath, onProgress) {
    var client = null;
    var timer = null;
    var attempts = 0;
    var state = { timePos: 0, duration: 0, eofReached: false };

    function sendCommand(command, reqId) {
        if (!client || client.destroyed) return;
        try {
            var msg = JSON.stringify({ command: command, request_id: reqId || 0 }) + '\n';
            client.write(msg);
        } catch (e) {}
    }

    function tryConnect() {
        if (attempts++ > 40) return; // 4 секунды попыток

        client = net.createConnection(socketPath, function () {
            // Запрашиваем наблюдение за свойствами
            sendCommand(['observe_property', 1, 'time-pos']);
            sendCommand(['observe_property', 2, 'duration']);
            sendCommand(['observe_property', 3, 'eof-reached']);

            // Периодический опрос
            timer = setInterval(function () {
                sendCommand(['get_property', 'time-pos'], 10);
                sendCommand(['get_property', 'duration'], 11);
                sendCommand(['get_property', 'eof-reached'], 12);
            }, 2000);
        });

        client.on('data', function (data) {
            var lines = data.toString().split('\n');
            lines.forEach(function (line) {
                if (!line.trim()) return;
                try {
                    var parsed = JSON.parse(line);
                    if (parsed.name === 'time-pos' && typeof parsed.data === 'number') {
                        state.timePos = parsed.data;
                    } else if (parsed.name === 'duration' && typeof parsed.data === 'number') {
                        state.duration = parsed.data;
                    } else if (parsed.name === 'eof-reached' && typeof parsed.data === 'boolean') {
                        state.eofReached = parsed.data;
                    } else if (parsed.request_id === 10 && typeof parsed.data === 'number') {
                        state.timePos = parsed.data;
                    } else if (parsed.request_id === 11 && typeof parsed.data === 'number') {
                        state.duration = parsed.data;
                    } else if (parsed.request_id === 12 && typeof parsed.data === 'boolean') {
                        state.eofReached = parsed.data;
                    }

                    if (onProgress && (state.timePos > 0 || state.duration > 0)) {
                        onProgress(state);
                    }
                } catch (e) {}
            });
        });

        client.on('error', function () {
            setTimeout(tryConnect, 100);
        });
    }

    setTimeout(tryConnect, 200);

    return {
        getState: function () { return state; },
        close: function () {
            if (timer) clearInterval(timer);
            if (client) {
                try { client.end(); client.destroy(); } catch (e) {}
            }
        }
    };
}

// Запуск mpv; резолвится объектом с кодом выхода и последним состоянием { code, timePos, duration, eofReached }
function play(stream, title, extraArgs, onProgressCallback) {
    return new Promise(function (resolve, reject) {
        var socketPath = generateSocketPath();
        var ipc = monitorIpc(socketPath, function (state) {
            if (stream.filmInfo) {
                history.saveProgress({
                    filmId: stream.filmInfo.id,
                    title: stream.filmInfo.title,
                    year: stream.filmInfo.year,
                    poster: stream.filmInfo.poster,
                    serial: stream.filmInfo.serial,
                    season: stream.season,
                    episode: stream.episode,
                    player: stream.player,
                    translation: stream.translation,
                    quality: stream.label,
                    timePos: state.timePos,
                    duration: state.duration,
                    watched: state.eofReached || (state.duration > 0 && state.timePos / state.duration > 0.85)
                });
            }
            if (onProgressCallback) onProgressCallback(state);
        });

        var args = buildArgs(stream, title, extraArgs, socketPath);
        var child = spawn('mpv', args, { stdio: ['ignore', 'ignore', 'ignore'] });

        function cleanupSocket() {
            ipc.close();
            if (process.platform !== 'win32') {
                try { if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath); } catch (e) {}
            }
        }

        child.on('error', function (err) {
            cleanupSocket();
            if (err.code === 'ENOENT') {
                reject(new Error('mpv не найден в PATH. Установи mpv или запусти с --no-mpv'));
                return;
            }
            reject(err);
        });

        child.on('exit', function (code) {
            var finalState = ipc.getState();
            cleanupSocket();

            // Сохраняем финальный прогресс
            if (stream.filmInfo) {
                history.saveProgress({
                    filmId: stream.filmInfo.id,
                    title: stream.filmInfo.title,
                    year: stream.filmInfo.year,
                    poster: stream.filmInfo.poster,
                    serial: stream.filmInfo.serial,
                    season: stream.season,
                    episode: stream.episode,
                    player: stream.player,
                    translation: stream.translation,
                    quality: stream.label,
                    timePos: finalState.timePos,
                    duration: finalState.duration,
                    watched: finalState.eofReached || (finalState.duration > 0 && finalState.timePos / finalState.duration > 0.85)
                });
            }

            resolve({
                code: code === null ? 0 : code,
                timePos: finalState.timePos,
                duration: finalState.duration,
                eofReached: finalState.eofReached || (finalState.duration > 0 && finalState.timePos / finalState.duration > 0.85)
            });
        });
    });
}

module.exports = {
    buildArgs: buildArgs,
    buildCommand: buildCommand,
    generateSocketPath: generateSocketPath,
    play: play
};
