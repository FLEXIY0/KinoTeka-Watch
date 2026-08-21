'use strict';

// Интеграция с TorrServer (MatriX) для прямого воспроизведения торрентов в 4K / 1080p.
// Если TorrServer запущен локально (127.0.0.1:8090) или указан в настройках,
// KTW может отправлять поток сразу в mpv без предварительного скачивания файла на диск.

var http = require('./http');
var config = require('./config');

var DEFAULT_TORRSERVE_URL = 'http://127.0.0.1:8090';

// Проверка доступности TorrServer
async function checkAvailability(customUrl, timeoutMs) {
    var baseUrl = (customUrl || config.read().torrserveUrl || DEFAULT_TORRSERVE_URL).replace(/\/+$/, '');
    try {
        var res = await http.request(baseUrl + '/echo', {
            timeout: timeoutMs || 2500
        });
        if (res.ok) {
            return {
                ok: true,
                url: baseUrl,
                version: res.body ? res.body.trim() : 'MatriX'
            };
        }
    } catch (e) {}

    // Запасная проверка через /settings
    try {
        var res2 = await http.request(baseUrl + '/settings', {
            method: 'POST',
            body: JSON.stringify({ action: 'get' }),
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs || 2000
        });
        if (res2.ok) {
            return {
                ok: true,
                url: baseUrl,
                version: 'MatriX'
            };
        }
    } catch (e) {}

    return {
        ok: false,
        url: baseUrl,
        version: null
    };
}

// Генерация прямой ссылки на поток из magnet / хэша торрента
function buildStreamUrl(magnetOrHash, fileIndex, customUrl) {
    var baseUrl = (customUrl || config.read().torrserveUrl || DEFAULT_TORRSERVE_URL).replace(/\/+$/, '');
    var linkParam = encodeURIComponent(magnetOrHash);
    var indexParam = typeof fileIndex === 'number' ? ('&index=' + fileIndex) : '';
    return baseUrl + '/stream?link=' + linkParam + indexParam + '&play';
}

// Добавление торрента в базу TorrServer
async function addTorrent(magnetOrHash, title, posterUrl, customUrl) {
    var baseUrl = (customUrl || config.read().torrserveUrl || DEFAULT_TORRSERVE_URL).replace(/\/+$/, '');
    try {
        var res = await http.request(baseUrl + '/torrents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'add',
                link: magnetOrHash,
                title: title || '',
                poster: posterUrl || '',
                data: '',
                save_to_db: true
            }),
            timeout: 5000
        });
        if (res.ok && res.body) {
            return JSON.parse(res.body);
        }
    } catch (e) {}
    return null;
}

// Получение списка файлов внутри торрента из TorrServer
async function getTorrentFiles(magnetOrHash, customUrl) {
    var baseUrl = (customUrl || config.read().torrserveUrl || DEFAULT_TORRSERVE_URL).replace(/\/+$/, '');
    try {
        var res = await http.request(baseUrl + '/torrents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get',
                hash: magnetOrHash.replace(/^magnet:\?xt=urn:btih:/i, '').split('&')[0]
            }),
            timeout: 5000
        });
        if (res.ok && res.body) {
            var data = JSON.parse(res.body);
            if (data && Array.isArray(data.file_stats)) {
                return data.file_stats.map(function (f, idx) {
                    return {
                        id: f.id !== undefined ? f.id : idx,
                        name: f.path || f.name || ('Файл ' + (idx + 1)),
                        length: f.length || 0
                    };
                });
            }
        }
    } catch (e) {}
    return [];
}

module.exports = {
    DEFAULT_TORRSERVE_URL: DEFAULT_TORRSERVE_URL,
    checkAvailability: checkAvailability,
    buildStreamUrl: buildStreamUrl,
    addTorrent: addTorrent,
    getTorrentFiles: getTorrentFiles
};
