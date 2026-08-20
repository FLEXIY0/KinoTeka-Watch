'use strict';

// Работа с внешними API: поиск фильмов (Кинопоиск) и список плееров (Kinobox).
// Ровно те же эндпоинты, что использует сайт:
//   - script-search.js  -> kinopoiskapiunofficial.tech
//   - kinobox.js        -> api.kinobox.tv/api/players

var extractors = require('./extractors');
var config = require('./config');

var KINOPOISK_SEARCH = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';
var KINOPOISK_FILMS = 'https://kinopoiskapiunofficial.tech/api/v2.2/films';

// Зеркала списка плееров. Первым идёт то, которое использует сам сайт:
// api.kinobox.tv отвечает не отовсюду, а fbphdplay.top отдаёт тот же JSON.
// Своё зеркало можно подставить через KTW_KINOBOX_API или в настройках TUI.
var KINOBOX_MIRRORS = [
    'https://fbphdplay.top/api/players',
    'https://api.kinobox.tv/api/players'
];

// Браузерный UA
var USER_AGENT = extractors.USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Node прячет причину сетевой ошибки в err.cause, наружу отдавая
// бесполезное «fetch failed». Достаём и переводим на человеческий.
function describeNetworkError(err) {
    var cause = err && err.cause ? err.cause : null;
    var code = (cause && cause.code) || err.code || '';

    switch (code) {
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
            return 'не разрешается имя хоста — нет интернета или не работает DNS';
        case 'ECONNREFUSED':
            return 'соединение отклонено';
        case 'ECONNRESET':
            return 'соединение сброшено — возможно, хост режет провайдер';
        case 'ETIMEDOUT':
        case 'UND_ERR_CONNECT_TIMEOUT':
        case 'UND_ERR_HEADERS_TIMEOUT':
            return 'хост не отвечает';
        case 'CERT_HAS_EXPIRED':
        case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
        case 'SELF_SIGNED_CERT_IN_CHAIN':
            return 'проблема с сертификатом — возможно, трафик идёт через прокси';
        default:
            return (cause && cause.message) || err.message || 'неизвестная ошибка';
    }
}

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
            var reason = 'HTTP ' + res.status;

            if (res.status === 401 || res.status === 403) {
                reason = 'ключ API не принят (' + res.status + ')';
            } else if (res.status === 402 || res.status === 429) {
                reason = 'исчерпан лимит запросов к API (' + res.status + ')';
            }

            var httpError = new Error(reason + ' — ' + new URL(url).host);
            httpError.status = res.status;
            throw httpError;
        }

        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Таймаут запроса к ' + new URL(url).host);
        }

        if (err.name === 'TypeError' || /fetch failed/i.test(err.message)) {
            throw new Error(new URL(url).host + ': ' + describeNetworkError(err));
        }

        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// Поиск фильмов по названию
async function searchFilms(query, apiKey) {
    if (!apiKey) {
        throw new Error('Нет ключа Кинопоиска. Задай KINOPOISK_API_KEY или введи по Ctrl+K / в Настройках');
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

// Карточка фильма по id
async function getFilm(kinopoiskId, apiKey) {
    if (!apiKey) {
        throw new Error('Нет ключа Кинопоиска. Задай KINOPOISK_API_KEY или введи по Ctrl+K / в Настройках');
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

// Сезоны и серии
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

// Разбор ответа Kinobox
function normalizePlayers(list) {
    var players = list
        .filter(function (item) { return item && item.iframeUrl; })
        .map(function (item) {
            var seen = {};
            var translations = (item.translations || [])
                .filter(function (translation) { return translation && translation.name; })
                .map(function (translation) {
                    return {
                        id: translation.id !== undefined ? translation.id : null,
                        name: translation.name,
                        quality: translation.quality || '',
                        iframeUrl: normalizeUrl(translation.iframeUrl || item.iframeUrl)
                    };
                })
                .filter(function (translation) {
                    var key = translation.name + '|' + translation.iframeUrl;
                    if (seen[key]) return false;
                    seen[key] = true;
                    return true;
                });

            var quality = translations.map(function (translation) { return translation.quality; })
                .filter(Boolean)[0] || '-';

            var directFast = extractors.isDirectSupported(item.type, item.iframeUrl);

            return {
                source: item.type || 'unknown',
                translation: translations.length > 0 ? translations[0].name : 'Не указано',
                quality: quality,
                translations: translations,
                iframeUrl: normalizeUrl(item.iframeUrl),
                direct: directFast
            };
        });

    // Прямые быстрые плееры (Collaps, Kodik) ставим первыми для мгновенного отклика
    players.sort(function (a, b) {
        return (b.direct ? 1 : 0) - (a.direct ? 1 : 0);
    });

    return players;
}

// Список доступных плееров
async function requestPlayers(param, value) {
    var configuredMirror = config.resolveKinoboxApi();
    var mirrors = configuredMirror
        ? [configuredMirror].concat(KINOBOX_MIRRORS.filter(function (m) { return m !== configuredMirror; }))
        : KINOBOX_MIRRORS.slice();

    var lastError = null;

    for (var i = 0; i < mirrors.length; i++) {
        var mirrorBase = mirrors[i];
        var url = mirrorBase + (mirrorBase.indexOf('?') >= 0 ? '&' : '?') + param + '=' + encodeURIComponent(value);

        try {
            var data = await fetchJson(url, {
                'Referer': 'https://kinobox.tv/',
                'Origin': 'https://kinobox.tv'
            });

            if (data && data.error) {
                throw new Error(data.error.title || 'Kinobox вернул ошибку');
            }

            var players = normalizePlayers(data && data.data ? data.data : []);
            if (players.length > 0) return players;

            lastError = new Error('пустой список плееров');
        } catch (err) {
            lastError = err;
        }
    }

    throw new Error('Плееры не получены: ' + (lastError ? lastError.message : 'нет ответа'));
}

function getPlayers(kinopoiskId) {
    return requestPlayers('kinopoisk', kinopoiskId);
}

function getPlayersByTitle(title) {
    return requestPlayers('title', title);
}

function parseFilmId(query) {
    if (/^\d+$/.test(String(query || '').trim())) return String(query).trim();

    var match = String(query || '').match(/kinopoisk\.[a-z]+\/(?:film|series)\/(\d+)/i);
    return match ? match[1] : null;
}

function normalizeUrl(url) {
    if (url.indexOf('//') === 0) return 'https:' + url;
    return url;
}

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
    getPlayersByTitle: getPlayersByTitle,
    withEpisode: withEpisode
};
