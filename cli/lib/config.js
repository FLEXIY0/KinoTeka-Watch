'use strict';

// Настройки ktw: ключ API и путь к Chromium.
// Живут в ~/.config/ktw/config.json, но переменные окружения важнее.

var fs = require('fs');
var os = require('os');
var path = require('path');

var CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'ktw');
var CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function read() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (err) {
        return {};
    }
}

function save(patch) {
    var config = Object.assign(read(), patch);
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });

    return config;
}

// Ключ API: аргумент -> окружение -> локальный kinopoisk-key.js -> конфиг
function resolveApiKey(explicitKey) {
    if (explicitKey) return explicitKey;
    if (process.env.KINOPOISK_API_KEY) return process.env.KINOPOISK_API_KEY;

    var localKeyFile = path.join(__dirname, '..', '..', 'kinopoisk-key.js');

    if (fs.existsSync(localKeyFile)) {
        var match = fs.readFileSync(localKeyFile, 'utf8').match(/KINOPOISK_API_KEY\s*=\s*['"]([^'"]+)['"]/);
        if (match) return match[1];
    }

    return read().kinopoiskApiKey || null;
}

// Путь к Chromium: если в конфиге записан свой, отдаём его puppeteer
function applyChromiumPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return;

    var chromiumPath = read().chromiumPath;
    if (chromiumPath && fs.existsSync(chromiumPath)) {
        process.env.PUPPETEER_EXECUTABLE_PATH = chromiumPath;
    }
}

module.exports = {
    file: CONFIG_FILE,
    read: read,
    save: save,
    resolveApiKey: resolveApiKey,
    applyChromiumPath: applyChromiumPath
};
