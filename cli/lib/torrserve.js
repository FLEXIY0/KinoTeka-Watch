'use strict';

// Полная автономная интеграция с TorrServer (MatriX).
// Если сервер не установлен или не запущен — KTW автоматически скачивает
// официальный бинарник TorrServer MatriX с GitHub releases в ~/.config/ktw/bin/
// и поднимает локальный сервис на 127.0.0.1:8090 без ручных настроек.

var fs = require('fs');
var path = require('path');
var os = require('os');
var https = require('https');
var http = require('http');
var child_process = require('child_process');
var config = require('./config');

var DEFAULT_TORRSERVE_URL = 'http://127.0.0.1:8090';
var BIN_DIR = path.join(config.CONFIG_DIR, 'bin');
var DATA_DIR = path.join(config.CONFIG_DIR, 'torrserver_data');

function getBinaryName() {
    var platform = os.platform();
    var arch = os.arch();

    if (platform === 'win32') {
        return 'TorrServer-windows-amd64.exe';
    } else if (platform === 'darwin') {
        return arch === 'arm64' ? 'TorrServer-darwin-arm64' : 'TorrServer-darwin-amd64';
    } else {
        // Linux (Ubuntu, Debian, Arch, etc.)
        return arch === 'arm64' ? 'TorrServer-linux-arm64' : 'TorrServer-linux-amd64';
    }
}

function getBinaryPath() {
    var name = os.platform() === 'win32' ? 'torrserver.exe' : 'torrserver';
    return path.join(BIN_DIR, name);
}

function downloadFile(url, destPath, onProgress) {
    return new Promise(function (resolve, reject) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        function get(currentUrl, redirects) {
            if (redirects > 5) return reject(new Error('Слишком много перенаправлений'));
            var client = currentUrl.indexOf('https:') === 0 ? https : http;

            var req = client.get(currentUrl, {
                rejectUnauthorized: false,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }, function (res) {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return get(res.headers.location, redirects + 1);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error('HTTP ' + res.statusCode));
                }

                var total = parseInt(res.headers['content-length'] || '0', 10);
                var downloaded = 0;
                var fileStream = fs.createWriteStream(destPath);

                res.on('data', function (chunk) {
                    downloaded += chunk.length;
                    if (onProgress) onProgress(downloaded, total);
                });

                res.pipe(fileStream);

                fileStream.on('finish', function () {
                    fileStream.close(function () {
                        try {
                            if (os.platform() !== 'win32') {
                                fs.chmodSync(destPath, 0o755);
                            }
                        } catch (e) {}
                        resolve(destPath);
                    });
                });

                fileStream.on('error', function (err) {
                    try { fs.unlinkSync(destPath); } catch (e) {}
                    reject(err);
                });
            });

            req.on('error', reject);
            req.setTimeout(60000, function () {
                req.destroy();
                reject(new Error('Таймаут скачивания TorrServer'));
            });
        }

        get(url, 0);
    });
}

// Проверка доступности TorrServer
async function checkAvailability(customUrl, timeoutMs) {
    var baseUrl = (customUrl || config.read().torrserveUrl || DEFAULT_TORRSERVE_URL).replace(/\/+$/, '');
    return new Promise(function (resolve) {
        try {
            var u = new URL(baseUrl + '/echo');
            var client = u.protocol === 'https:' ? https : http;
            var req = client.get(u, {
                rejectUnauthorized: false,
                timeout: timeoutMs || 1500
            }, function (res) {
                var body = '';
                res.on('data', function (c) { body += c; });
                res.on('end', function () {
                    resolve({ ok: res.statusCode === 200, version: body.trim() || 'MatriX', url: baseUrl });
                });
            });
            req.on('error', function () { resolve({ ok: false, version: null, url: baseUrl }); });
            req.on('timeout', function () { req.destroy(); resolve({ ok: false, version: null, url: baseUrl }); });
        } catch (e) {
            resolve({ ok: false, version: null, url: baseUrl });
        }
    });
}

// Фоновый запуск TorrServer
async function startServerDaemon() {
    var binPath = getBinaryPath();
    if (!fs.existsSync(binPath)) {
        throw new Error('Бинарник TorrServer не найден: ' + binPath);
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });

    var args = ['-d', DATA_DIR, '-p', '8090'];
    var child = child_process.spawn(binPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    child.unref();

    // Ждем запуска 4 секунды
    for (var i = 0; i < 20; i++) {
        await new Promise(function (r) { setTimeout(r, 200); });
        var status = await checkAvailability('http://127.0.0.1:8090', 500);
        if (status.ok) return status;
    }

    throw new Error('TorrServer не запустился за 4 секунды');
}

// Гарантированный запуск из коробки: автоскачивание + старт
async function ensureRunning(onProgress) {
    var customUrl = config.read().torrserveUrl;
    var targetUrl = (customUrl || DEFAULT_TORRSERVE_URL).replace(/\/+$/, '');

    // 1. Если указан внешний сервер или локальный уже работает
    var cur = await checkAvailability(targetUrl, 1200);
    if (cur.ok) return cur;

    // Если указан не localhost/127.0.0.1, мы не можем скачать удаленный сервер
    if (targetUrl.indexOf('127.0.0.1') < 0 && targetUrl.indexOf('localhost') < 0) {
        throw new Error('Внешний TorrServer ' + targetUrl + ' недоступен');
    }

    // 2. Локальный бинарник скачан?
    var binPath = getBinaryPath();
    if (!fs.existsSync(binPath)) {
        var remoteName = getBinaryName();
        var downloadUrl = 'https://github.com/YouROK/TorrServer/releases/latest/download/' + remoteName;
        if (onProgress) onProgress('Скачиваю TorrServer MatriX...');
        await downloadFile(downloadUrl, binPath, function (done, total) {
            if (onProgress && total > 0) {
                var mbDone = (done / (1024 * 1024)).toFixed(1);
                var mbTotal = (total / (1024 * 1024)).toFixed(1);
                var pct = Math.round((done / total) * 100);
                onProgress('Скачиваю TorrServer: ' + mbDone + ' / ' + mbTotal + ' МБ (' + pct + '%)');
            }
        });
    }

    // 3. Запуск демона
    if (onProgress) onProgress('Запускаю фоновый сервис TorrServer...');
    return await startServerDaemon();
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
    return new Promise(function (resolve) {
        try {
            var u = new URL(baseUrl + '/torrents');
            var client = u.protocol === 'https:' ? https : http;
            var payload = JSON.stringify({
                action: 'add',
                link: magnetOrHash,
                title: title || '',
                poster: posterUrl || '',
                data: '',
                save_to_db: true
            });
            var req = client.request(u, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 5000
            }, function (res) {
                var body = '';
                res.on('data', function (c) { body += c; });
                res.on('end', function () {
                    try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
                });
            });
            req.on('error', function () { resolve(null); });
            req.write(payload);
            req.end();
        } catch (e) {
            resolve(null);
        }
    });
}

// Получение списка файлов внутри торрента из TorrServer
async function getTorrentFiles(magnetOrHash, customUrl) {
    var baseUrl = (customUrl || config.read().torrserveUrl || DEFAULT_TORRSERVE_URL).replace(/\/+$/, '');
    return new Promise(function (resolve) {
        try {
            var hash = magnetOrHash.replace(/^magnet:\?xt=urn:btih:/i, '').split('&')[0];
            var u = new URL(baseUrl + '/torrents');
            var client = u.protocol === 'https:' ? https : http;
            var payload = JSON.stringify({
                action: 'get',
                hash: hash
            });
            var req = client.request(u, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 5000
            }, function (res) {
                var body = '';
                res.on('data', function (c) { body += c; });
                res.on('end', function () {
                    try {
                        var data = JSON.parse(body);
                        if (data && Array.isArray(data.file_stats)) {
                            resolve(data.file_stats.map(function (f, idx) {
                                return {
                                    id: f.id !== undefined ? f.id : idx,
                                    name: f.path || f.name || ('Файл ' + (idx + 1)),
                                    length: f.length || 0
                                };
                            }));
                            return;
                        }
                    } catch (e) {}
                    resolve([]);
                });
            });
            req.on('error', function () { resolve([]); });
            req.write(payload);
            req.end();
        } catch (e) {
            resolve([]);
        }
    });
}

// Поиск торрентов через агрегатор JacRed
async function searchTorrents(query, season, episode) {
    var searchQuery = query;
    if (season) {
        searchQuery += ' s' + (season < 10 ? '0' : '') + season;
        if (episode) {
            searchQuery += 'e' + (episode < 10 ? '0' : '') + episode;
        }
    }

    var urls = [
        'https://jac.red/api/v1/search?query=' + encodeURIComponent(searchQuery),
        'https://jacred.xyz/api/v1/search?query=' + encodeURIComponent(searchQuery)
    ];

    for (var u of urls) {
        try {
            var raw = await new Promise(function (resolve, reject) {
                var client = u.indexOf('https:') === 0 ? https : http;
                var req = client.get(u, {
                    rejectUnauthorized: false,
                    timeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                }, function (res) {
                    var c = [];
                    res.on('data', function (d) { c.push(d); });
                    res.on('end', function () { resolve(Buffer.concat(c).toString('utf8')); });
                });
                req.on('error', reject);
                req.on('timeout', function () { req.destroy(); reject(new Error('timeout')); });
            });

            var data = JSON.parse(raw);
            if (Array.isArray(data) && data.length > 0) {
                return data.map(function (item) {
                    var quality = '1080p';
                    if (item.info && item.info.quality) {
                        quality = item.info.quality >= 2160 ? '4K UHD' : (item.info.quality + 'p');
                    } else if (/2160p|4k|uhd/i.test(item.title)) {
                        quality = '4K UHD';
                    } else if (/720p/i.test(item.title)) {
                        quality = '720p';
                    }

                    var sizeStr = '';
                    if (item.info && item.info.sizeName) {
                        sizeStr = item.info.sizeName;
                    } else if (item.size) {
                        sizeStr = (item.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
                    }

                    var voices = (item.info && item.info.voices) ? item.info.voices.join(', ') : '';

                    return {
                        title: item.title,
                        quality: quality,
                        size: sizeStr,
                        seeds: item.seeders || 0,
                        peers: item.leechers || 0,
                        voices: voices,
                        magnet: item.magnetUrl || item.downloadUrl,
                        indexer: item.indexer || 'Torrent'
                    };
                });
            }
        } catch (e) {}
    }

    return [];
}

module.exports = {
    DEFAULT_TORRSERVE_URL: DEFAULT_TORRSERVE_URL,
    getBinaryName: getBinaryName,
    getBinaryPath: getBinaryPath,
    checkAvailability: checkAvailability,
    ensureRunning: ensureRunning,
    startServerDaemon: startServerDaemon,
    buildStreamUrl: buildStreamUrl,
    addTorrent: addTorrent,
    getTorrentFiles: getTorrentFiles,
    searchTorrents: searchTorrents
};
