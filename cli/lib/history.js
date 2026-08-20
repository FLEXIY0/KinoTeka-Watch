'use strict';

// Управление историей просмотров, сохранением прогресса и отметками серий.
// Хранится локально в ~/.config/ktw/history.json.

var fs = require('fs');
var path = require('path');
var config = require('./config');

var HISTORY_FILE = path.join(config.CONFIG_DIR, 'history.json');
var MAX_ITEMS = 50;

// Чтение файла истории
function read() {
    try {
        if (!fs.existsSync(HISTORY_FILE)) {
            return { items: [], watchedEpisodes: {} };
        }
        var content = fs.readFileSync(HISTORY_FILE, 'utf8');
        var data = JSON.parse(content);
        return {
            items: Array.isArray(data.items) ? data.items : [],
            watchedEpisodes: (typeof data.watchedEpisodes === 'object' && data.watchedEpisodes) ? data.watchedEpisodes : {}
        };
    } catch (err) {
        return { items: [], watchedEpisodes: {} };
    }
}

// Запись файла истории
function write(data) {
    try {
        config.ensureDir();
        var payload = {
            items: (data.items || []).slice(0, MAX_ITEMS),
            watchedEpisodes: data.watchedEpisodes || {}
        };
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2) + '\n', { mode: 384 /* 0600 */ });
    } catch (err) {
        // Ошибки записи истории не должны прерывать просмотр
    }
}

// Форматирование секунд в ЧЧ:ММ:СС или ММ:СС
function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    var total = Math.floor(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;

    var mm = m < 10 ? '0' + m : String(m);
    var ss = s < 10 ? '0' + s : String(s);

    if (h > 0) {
        var hh = h < 10 ? '0' + h : String(h);
        return hh + ':' + mm + ':' + ss;
    }
    return mm + ':' + ss;
}

// Сохранить прогресс просмотра (вызывается во время и после mpv)
function saveProgress(entry) {
    if (!entry || !entry.filmId) return;

    var data = read();
    var filmId = String(entry.filmId);
    var season = entry.season ? Number(entry.season) : null;
    var episode = entry.episode ? Number(entry.episode) : null;
    var timePos = Math.max(0, Math.floor(entry.timePos || 0));
    var duration = Math.max(0, Math.floor(entry.duration || 0));
    var percentage = duration > 0 ? Math.min(100, Math.round((timePos / duration) * 100)) : 0;
    var watched = entry.watched || (percentage >= 85);

    // Удаляем предыдущую запись об этом фильме/сериале
    data.items = data.items.filter(function (item) {
        return String(item.filmId) !== filmId;
    });

    var record = {
        filmId: filmId,
        title: entry.title || 'Без названия',
        year: entry.year || '',
        poster: entry.poster || '',
        serial: !!entry.serial,
        season: season,
        episode: episode,
        player: entry.player || '',
        translation: entry.translation || '',
        quality: entry.quality || '',
        timePos: timePos,
        duration: duration,
        percentage: percentage,
        watched: watched,
        updatedAt: Date.now()
    };

    // Добавляем свежую запись в начало списка
    data.items.unshift(record);

    // Если серия досмотрена, помечаем её в watchedEpisodes
    if (season && episode && (watched || percentage >= 80)) {
        if (!data.watchedEpisodes[filmId]) {
            data.watchedEpisodes[filmId] = [];
        }
        var epKey = season + '_' + episode;
        if (data.watchedEpisodes[filmId].indexOf(epKey) === -1) {
            data.watchedEpisodes[filmId].push(epKey);
        }
    }

    write(data);
}

// Получить сохранённый прогресс фильма или конкретной серии
function getProgress(filmId, season, episode) {
    if (!filmId) return null;
    var data = read();
    var idStr = String(filmId);

    return data.items.find(function (item) {
        if (String(item.filmId) !== idStr) return false;
        if (season || episode) {
            return item.season === Number(season) && item.episode === Number(episode);
        }
        return true;
    }) || null;
}

// Проверить, просмотрена ли серия
function isEpisodeWatched(filmId, season, episode) {
    if (!filmId || !season || !episode) return false;
    var data = read();
    var list = data.watchedEpisodes[String(filmId)];
    if (!Array.isArray(list)) return false;
    return list.indexOf(Number(season) + '_' + Number(episode)) >= 0;
}

// Получить список последних недосмотренных / просмотренных фильмов
function getRecent(limit) {
    var data = read();
    return data.items.slice(0, limit || 10);
}

// Удалить фильм из истории
function remove(filmId) {
    var data = read();
    var idStr = String(filmId);
    data.items = data.items.filter(function (item) { return String(item.filmId) !== idStr; });
    delete data.watchedEpisodes[idStr];
    write(data);
}

// Очистить всю историю
function clear() {
    write({ items: [], watchedEpisodes: {} });
}

module.exports = {
    HISTORY_FILE: HISTORY_FILE,
    read: read,
    write: write,
    formatTime: formatTime,
    saveProgress: saveProgress,
    getProgress: getProgress,
    isEpisodeWatched: isEpisodeWatched,
    getRecent: getRecent,
    remove: remove,
    clear: clear
};
