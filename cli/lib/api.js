'use strict';

// Работа с внешними API: поиск фильмов (Кинопоиск) и список плееров (Kinobox).
// Ровно те же эндпоинты, что использует сайт:
//   - script-search.js  -> kinopoiskapiunofficial.tech
//   - kinobox.js        -> api.kinobox.tv/api/players

var KINOPOISK_SEARCH = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';
var KINOPOISK_FILMS = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';
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
        var isSerial = film.type === 'TV_SERIES' || film.type === 'MINI_SERIES';

        return {
            id: film.filmId,
            title: film.nameRu || film.nameEn || film.nameOriginal || 'Без названия',
            original: film.nameEn || film.nameOriginal || '',
            year: film.year || '',
            type: isSerial ? 'сериал' : 'фильм',
            serial: isSerial,
            rating: film.rating && film.rating !== 'null' ? film.rating : '',
            description: film.description || '',
            poster: film.posterUrlPreview || film.posterUrl || '',
            genres: (film.genres || []).map(function (genre) { return genre.genre; }),
            countries: (film.countries || []).map(function (country) { return country.country; })
        };
    });
}

// Карточка фильма по id (нужна, когда фильм открыт напрямую, без поиска)
async function getFilm(kinopoiskId, apiKey) {
    if (!apiKey) {
        throw new Error('Нет ключа Кинопоиска. Задай KINOPOISK_API_KEY или запусти с --key');
    }

    var data = await fetchJson(KINOPOISK_FILMS + '/' + kinopoiskId, { 'X-API-KEY': apiKey });
    var isSerial = data.serial || data.type === 'TV_SERIES' || data.type === 'MINI_SERIES';

    return {
        id: data.kinopoiskId || kinopoiskId,
        title: data.nameRu || data.nameEn || data.nameOriginal || 'Без названия',
        original: data.nameOriginal || data.nameEn || '',
        year: data.year || '',
        type: isSerial ? 'сериал' : 'фильм',
        serial: isSerial,
        rating: data.ratingKinopoisk || '',
        description: data.description || data.shortDescription || '',
        poster: data.posterUrlPreview || data.posterUrl || '',
        length: data.filmLength || null,
        genres: (data.genres || []).map(function (genre) { return genre.genre; }),
        countries: (data.countries || []).map(function (country) { return country.country; })
    };
}

// Сезоны и серии; для не-сериалов вернётся пустой список
async function getSeasons(kinopoiskId, apiKey) {
    var data = await fetchJson(KINOPOISK_FILMS + '/' + kinopoiskId + '/seasons', { 'X-API-KEY': apiKey });
    var items = data && data.items ? data.items : [];

    return items.map(function (season) {
        return {
            number: season.number,
            episodes: (season.episodes || []).map(function (episode) {
                return {
                    number: episode.episodeNumber,
                    title: episode.nameRu || episode.nameEn || '',
                    date: episode.releaseDate || ''
                };
            })
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

// id Кинопоиска из аргумента: число или ссылка вида kinopoisk.ru/film/301/
function parseFilmId(query) {
    if (/^\d+$/.test(String(query || '').trim())) return String(query).trim();

    var match = String(query || '').match(/kinopoisk\.[a-z]+\/(?:film|series)\/(\d+)/i);
    return match ? match[1] : null;
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
    parseFilmId: parseFilmId,
    getFilm: getFilm,
    getSeasons: getSeasons,
    getPlayers: getPlayers,
    withEpisode: withEpisode
};
