'use strict';

// Работа с внешними API: поиск фильмов (Кинопоиск) и список плееров (Kinobox).
// Ровно те же эндпоинты, что использует сайт:
//   - script-search.js  -> kinopoiskapiunofficial.tech
//   - kinobox.js        -> api.kinobox.tv/api/players

var KINOPOISK_SEARCH = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';
var KINOBOX_PLAYERS = 'https://api.kinobox.tv/api/players';

// Браузерный UA — балансеры отдают поток только «настоящим» клиентам
var USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// GET с таймаутом и разбором JSON
async function fetchJson(url, headers, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 15000);

    try {
        var res = await fetch(url, {
            headers: Object.assign({ 'User-Agent': USER_AGENT, 'Accept': 'application/json' }, headers || {}),
            signal: controller.signal
        });

        if (!res.ok) {
            throw new Error('HTTP ' + res.status + ' от ' + new URL(url).host);
        }

        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Таймаут запроса к ' + new URL(url).host);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// Поиск фильмов по названию
async function searchFilms(query, apiKey) {
    if (!apiKey) {
        throw new Error('Нет ключа Кинопоиска. Задай KINOPOISK_API_KEY или запусти с --key');
    }

    var url = KINOPOISK_SEARCH + '?keyword=' + encodeURIComponent(query);
    var data = await fetchJson(url, { 'X-API-KEY': apiKey });
    var films = data && data.films ? data.films : [];

    return films.map(function (film) {
        return {
            id: film.filmId,
            title: film.nameRu || film.nameEn || film.nameOriginal || 'Без названия',
            original: film.nameEn || film.nameOriginal || '',
            year: film.year || '',
            type: film.type === 'TV_SERIES' || film.type === 'MINI_SERIES' ? 'сериал' : 'фильм',
            rating: film.rating && film.rating !== 'null' ? film.rating : '',
            description: film.description || ''
        };
    });
}

// Список доступных плееров (балансеров) для фильма
async function getPlayers(kinopoiskId) {
    var url = KINOBOX_PLAYERS + '?kinopoisk=' + encodeURIComponent(kinopoiskId);
    var data = await fetchJson(url, { 'Referer': 'https://kinobox.tv/', 'Origin': 'https://kinobox.tv' });

    if (data && data.error) {
        throw new Error(data.error.title || 'Kinobox вернул ошибку');
    }

    var list = data && data.data ? data.data : [];

    return list
        .filter(function (item) { return item && item.iframeUrl; })
        .map(function (item) {
            var translation = item.translations && item.translations[0] ? item.translations[0] : {};
            return {
                source: item.type || 'unknown',
                translation: translation.name || 'Не указано',
                quality: translation.quality || '-',
                iframeUrl: normalizeUrl(item.iframeUrl)
            };
        });
}

// У Kinobox часть ссылок приходит протокол-относительными (//host/...)
function normalizeUrl(url) {
    if (url.indexOf('//') === 0) return 'https:' + url;
    return url;
}

// Добавление номера сезона/серии в адрес iframe (понимают Alloha, Collaps, Videocdn, Kodik)
function withEpisode(iframeUrl, season, episode) {
    if (!season && !episode) return iframeUrl;

    var url = new URL(iframeUrl);
    if (season) url.searchParams.set('season', String(season));
    if (episode) url.searchParams.set('episode', String(episode));

    return url.toString();
}

module.exports = {
    USER_AGENT: USER_AGENT,
    searchFilms: searchFilms,
    getPlayers: getPlayers,
    withEpisode: withEpisode
};
