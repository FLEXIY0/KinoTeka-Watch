// Скрипт поиска фильмов
// Использование неофициального API Кинопоиска для надежного поиска

// API ключ для неофициального API Кинопоиска
const KINOPOISK_API_KEY = window.KINOPOISK_API_KEY || 'KINOPOISK_API_KEY_PLACEHOLDER';
const KINOPOISK_API_BASE = 'https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword';

// Текущая информация о фильме для возможного закрепления
let currentFilmInfo = null;

// Найденные фильмы для отображения в списке
let searchResults = [];

// Таймер для автоматического показа списка предложений
let autoSuggestTimer = null;
if (typeof window !== 'undefined') {
    window.autoSuggestTimer = null;
}

// Флаг переименования фильма (чтобы текст не попадал в главный input)
if (typeof window !== 'undefined') {
    window.isRenamingFilm = false;
}

// Функция обработки поиска
function handleSearch() {
    // Очищаем таймер авто-предложений
    if (window.autoSuggestTimer) {
        clearTimeout(window.autoSuggestTimer);
        window.autoSuggestTimer = null;
    }

    const searchText = searchTextElement.textContent.trim();

    // Если есть сохраненные результаты, открываем первый (самый релевантный)
    if (searchResults.length > 0) {
        const firstFilm = searchResults[0].fullData || searchResults[0];
        openFilmFromSearch(searchResults[0].id, firstFilm);
        hideSearchSuggestions();
        searchResults = [];
        return;
    }

    // Если результатов нет, выполняем поиск
    // Скрываем предыдущие предложения
    hideSearchSuggestions();
    searchResults = [];

    // Проверяем, что есть текст для поиска
    if (searchText.length < 2) {
        showSearchError(searchText, 'Запрос слишком короткий. Введите хотя бы 2 символа.');
        return;
    }

    // Убираем слово "кинопоиск" из запроса, если пользователь его случайно ввел
    let query = searchText;
    const kinopoiskKeywords = ['кинопоиск', 'kinopoisk'];
    kinopoiskKeywords.forEach(keyword => {
        query = query.replace(new RegExp(keyword, 'gi'), '').trim();
    });

    if (!query) {
        showSearchError(searchText, 'Не удалось извлечь запрос из введенного текста.');
        return;
    }

    // Выполняем поиск и сразу открываем первый результат
    searchKinopoiskAndOpen(query);
}

// Функция поиска только для показа списка предложений (не открывает фильм)
// Делаем доступной глобально для вызова из script.js
window.searchKinopoiskForSuggestions = async function searchKinopoiskForSuggestions(query) {
    // Очищаем предыдущие результаты
    searchResults = [];

    // Убираем слово "кинопоиск" из запроса, если пользователь его случайно ввел
    let cleanQuery = query;
    const kinopoiskKeywords = ['кинопоиск', 'kinopoisk'];
    kinopoiskKeywords.forEach(keyword => {
        cleanQuery = cleanQuery.replace(new RegExp(keyword, 'gi'), '').trim();
    });

    if (!cleanQuery || cleanQuery.length < 2) {
        hideSearchSuggestions();
        return;
    }

    try {
        console.log('🔍 Поиск предложений через API:', cleanQuery);

        // Формируем URL для поиска
        const searchUrl = `${KINOPOISK_API_BASE}?keyword=${encodeURIComponent(cleanQuery)}`;

        // Выполняем запрос к API
        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
                'X-API-KEY': KINOPOISK_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📡 Ответ API для предложений:', data);

        // Проверяем, есть ли результаты
        if (!data.films || data.films.length === 0) {
            hideSearchSuggestions();
            searchResults = [];
            return;
        }

        // Сохраняем все результаты (максимум 10)
        searchResults = data.films.slice(0, 10).map(film => ({
            id: film.filmId,
            name: film.nameRu || film.nameEn || film.nameOriginal,
            poster: film.posterUrl || film.posterUrlPreview || '',
            year: film.year || null,
            nameRu: film.nameRu,
            nameEn: film.nameEn,
            nameOriginal: film.nameOriginal,
            posterUrl: film.posterUrl,
            posterUrlPreview: film.posterUrlPreview,
            fullData: film
        }));

        // Показываем список предложений
        if (searchResults.length > 0) {
            showSearchSuggestions();
        } else {
            hideSearchSuggestions();
        }

    } catch (error) {
        console.error('❌ Ошибка при поиске предложений:', error);
        hideSearchSuggestions();
        searchResults = [];
    }
};

// Функция поиска и открытия первого результата (используется при нажатии Enter)
async function searchKinopoiskAndOpen(query) {
    try {
        console.log('🔍 Поиск и открытие через API:', query);

        // Формируем URL для поиска
        const searchUrl = `${KINOPOISK_API_BASE}?keyword=${encodeURIComponent(query)}`;

        // Выполняем запрос к API
        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
                'X-API-KEY': KINOPOISK_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📡 Ответ API:', data);

        // Проверяем, есть ли результаты
        if (!data.films || data.films.length === 0) {
            hideSearchSuggestions();
            showSearchError(query, `Не удалось найти фильм "${query}". Попробуйте другое название или проверьте написание.`);
            return;
        }

        // Открываем первый результат (самый релевантный)
        const firstFilm = data.films[0];
        openFilmFromSearch(firstFilm.filmId, firstFilm);
        hideSearchSuggestions();

    } catch (error) {
        console.error('❌ Ошибка при поиске:', error);
        let errorMessage = `Произошла ошибка при поиске.`;

        if (error.message.includes('429')) {
            errorMessage += ' Превышен лимит запросов к API. Попробуйте позже.';
        } else if (error.message.includes('401') || error.message.includes('403')) {
            errorMessage += ' Проблема с авторизацией API.';
        } else {
            errorMessage += ` ${error.message}`;
        }

        showSearchError(query, errorMessage);
    }
}

// Функция поиска на Кинопоиске через неофициальный API
async function searchKinopoisk(query) {
    try {
        console.log('🔍 Начинаем поиск через API:', query);

        // Формируем URL для поиска
        const searchUrl = `${KINOPOISK_API_BASE}?keyword=${encodeURIComponent(query)}`;

        // Выполняем запрос к API
        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
                'X-API-KEY': KINOPOISK_API_KEY,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📡 Ответ API:', data);

        // Проверяем, есть ли результаты
        if (!data.films || data.films.length === 0) {
            hideSearchSuggestions();
            showSearchError(query, `Не удалось найти фильм "${query}". Попробуйте другое название или проверьте написание.`);
            return;
        }

        // Сохраняем все результаты (максимум 10)
        searchResults = data.films.slice(0, 10).map(film => ({
            id: film.filmId,
            name: film.nameRu || film.nameEn || film.nameOriginal,
            poster: film.posterUrl || film.posterUrlPreview || '',
            year: film.year || null,
            nameRu: film.nameRu,
            nameEn: film.nameEn,
            nameOriginal: film.nameOriginal,
            posterUrl: film.posterUrl,
            posterUrlPreview: film.posterUrlPreview,
            fullData: film
        }));

        // Показываем список предложений, но не открываем первый результат автоматически
        // Пользователь может выбрать вариант или нажать Enter для открытия первого
        if (data.films.length > 1) {
            showSearchSuggestions();
        } else if (data.films.length === 1) {
            // Если только один результат, тоже показываем иконку (но список будет с одним элементом)
            showSearchSuggestions();
        } else {
            hideSearchSuggestions();
        }

    } catch (error) {
        console.error('❌ Ошибка при поиске:', error);
        let errorMessage = `Произошла ошибка при поиске.`;

        if (error.message.includes('429')) {
            errorMessage += ' Превышен лимит запросов к API. Попробуйте позже.';
        } else if (error.message.includes('401') || error.message.includes('403')) {
            errorMessage += ' Проблема с авторизацией API.';
        } else {
            errorMessage += ` ${error.message}`;
        }

        showSearchError(query, errorMessage);
    }
}

// Извлечение URL из Google редиректа
function extractUrlFromGoogleRedirect(googleUrl) {
    if (!googleUrl) return null;

    // Если это уже прямой URL на kinopoisk.ru
    if (googleUrl.includes('kinopoisk.ru') && !googleUrl.includes('google.com')) {
        try {
            const url = new URL(googleUrl);
            url.search = '';
            return url.toString().replace(/\/$/, '');
        } catch (e) {
            // Если не валидный URL, возвращаем как есть если содержит kinopoisk
            if (googleUrl.includes('kinopoisk.ru')) {
                return googleUrl.split('&')[0].split('?')[0].replace(/\/$/, '');
            }
        }
    }

    try {
        // Google редирект имеет формат: /url?sa=t&source=web&rct=j&url=REAL_URL&...
        let urlObj;
        if (googleUrl.startsWith('http')) {
            urlObj = new URL(googleUrl);
        } else {
            urlObj = new URL(googleUrl, 'https://www.google.com');
        }

        const realUrl = urlObj.searchParams.get('url');

        if (realUrl && realUrl.includes('kinopoisk.ru')) {
            try {
                const decodedUrl = decodeURIComponent(realUrl);
                const cleanUrl = new URL(decodedUrl);
                cleanUrl.search = '';
                return cleanUrl.toString().replace(/\/$/, '');
            } catch (e) {
                // Если не удалось распарсить, пробуем как есть
                const cleaned = realUrl.split('&')[0].split('?')[0].replace(/\/$/, '');
                if (cleaned.includes('kinopoisk.ru')) {
                    return cleaned;
                }
            }
        }
    } catch (e) {
        // Если не удалось распарсить как URL, пробуем regex
        const patterns = [
            /url=([^&"']+kinopoisk\.ru[^&"']*)/i,
            /url%3D([^&"']+kinopoisk\.ru[^&"']*)/i,
            /(https?:\/\/[^&"']*kinopoisk\.ru[^&"']*)/i
        ];

        for (const pattern of patterns) {
            const match = googleUrl.match(pattern);
            if (match && match[1]) {
                try {
                    let decodedUrl = match[1];
                    // Пробуем декодировать
                    try {
                        decodedUrl = decodeURIComponent(decodedUrl);
                    } catch (e2) {
                        // Оставляем как есть
                    }

                    if (decodedUrl.includes('kinopoisk.ru')) {
                        const url = new URL(decodedUrl);
                        url.search = '';
                        return url.toString().replace(/\/$/, '');
                    }
                } catch (e2) {
                    // Пробуем очистить вручную
                    const cleaned = match[1].split('&')[0].split('?')[0].replace(/\/$/, '');
                    if (cleaned.includes('kinopoisk.ru') && cleaned.startsWith('http')) {
                        return cleaned;
                    }
                }
            }
        }
    }

    return null;
}


// Открытие фильма из результатов поиска
function openFilmFromSearch(filmId, filmData = null) {
    let film;

    if (filmData) {
        // Если переданы данные из API напрямую
        film = {
            id: filmData.filmId,
            name: filmData.nameRu || filmData.nameEn || filmData.nameOriginal,
            nameRu: filmData.nameRu,
            nameEn: filmData.nameEn,
            nameOriginal: filmData.nameOriginal,
            poster: filmData.posterUrl || filmData.posterUrlPreview || '',
            posterUrl: filmData.posterUrl,
            posterUrlPreview: filmData.posterUrlPreview
        };
    } else {
        // Ищем фильм в сохраненных результатах
        film = searchResults.find(f => f.id === filmId);
        if (!film) {
            console.error('Фильм не найден в результатах');
            return;
        }
    }

    const filmName = film.nameRu || film.nameEn || film.nameOriginal || film.name;
    const filmPoster = film.posterUrl || film.posterUrlPreview || film.poster || '';

    // Формируем URL для страницы фильма на Кинопоиске
    let kinopoiskUrl = `https://www.kinopoisk.ru/film/${filmId}/`;

    // Преобразуем URL: заменяем домен на flcksbr.top
    const convertedUrl = kinopoiskUrl.replace(/https?:\/\/(www\.)?kinopoisk\.ru/g, 'https://flcksbr.top');
    console.log('🎬 Открываем плеер:', convertedUrl);

    // Сохраняем информацию о текущем фильме для возможного закрепления
    currentFilmInfo = {
        id: filmId,
        name: filmName,
        url: convertedUrl,
        poster: filmPoster
    };

    // Скрываем список предложений
    hideSearchSuggestions();

    // Открываем в отдельном окне/iframe на том же сайте
    openPlayerWindow(convertedUrl, filmId, filmName, filmPoster);
}

// Показ списка предложений фильмов (выпадающий список под инпутом)
function showSearchSuggestions() {
    var wrapper = document.getElementById('searchSuggestionsWrapper');
    if (!wrapper) return;

    wrapper.style.display = 'block';
    renderSearchSuggestions();

    // Применяем fade-in анимацию
    setTimeout(function () {
        wrapper.classList.add('visible');
    }, 10);
}

// Скрытие списка предложений
function hideSearchSuggestions() {
    var wrapper = document.getElementById('searchSuggestionsWrapper');

    if (wrapper) {
        wrapper.classList.remove('visible');

        setTimeout(function () {
            if (wrapper && !wrapper.classList.contains('visible')) {
                wrapper.style.display = 'none';
            }
        }, 300);
    }
}

// Рендеринг списка предложений
function renderSearchSuggestions() {
    const list = document.getElementById('searchSuggestionsList');
    if (!list || searchResults.length === 0) return;

    list.innerHTML = '';

    searchResults.forEach((film, index) => {
        const tile = document.createElement('div');
        tile.className = 'search-suggestion-tile';
        tile.dataset.filmId = film.id;

        const name = document.createElement('div');
        name.className = 'search-suggestion-name';

        // Формируем название с английской версией в скобках, если она отличается
        let displayName = film.name;
        if (film.nameRu && film.nameEn && film.nameRu !== film.nameEn) {
            // Если есть и русское, и английское название, и они различаются
            displayName = film.nameRu + ' (' + film.nameEn + ')';
        } else if (film.nameRu && film.nameOriginal && film.nameRu !== film.nameOriginal) {
            // Если есть русское и оригинальное название
            displayName = film.nameRu + ' (' + film.nameOriginal + ')';
        } else if (film.nameEn && film.nameOriginal && film.nameEn !== film.nameOriginal) {
            // Если есть английское и оригинальное название
            displayName = film.nameEn + ' (' + film.nameOriginal + ')';
        }

        name.textContent = displayName;

        tile.appendChild(name);

        if (film.year) {
            const year = document.createElement('div');
            year.className = 'search-suggestion-year';
            year.textContent = film.year;
            tile.appendChild(year);
        }

        tile.addEventListener('click', (e) => {
            e.stopPropagation();
            openFilmFromSearch(film.id);
        });

        list.appendChild(tile);
    });
}

// Инициализация обработчиков для списка предложений
function initSearchSuggestions() {
    var wrapper = document.getElementById('searchSuggestionsWrapper');
    if (!wrapper) return;

    // Скрываем список при клике вне его
    document.addEventListener('click', function (e) {
        if (!wrapper.contains(e.target)) {
            hideSearchSuggestions();
        }
    });
}

// Открытие плеера в отдельном окне на том же сайте
function openPlayerWindow(url, filmId, filmName, filmPoster) {
    // Удаляем существующее модальное окно, если есть
    const existingModal = document.getElementById('playerModal');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }

    // Создаем модальное окно с iframe
    const modal = document.createElement('div');
    modal.id = 'playerModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.95);
        z-index: 10000;
        display: flex;
        flex-direction: column;
    `;

    // Контейнер для кнопок
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        display: flex;
        gap: 10px;
        z-index: 10001;
    `;

    // Проверяем, закреплен ли фильм при открытии плеера
    let isFavorite = false;
    if (filmId) {
        // Преобразуем filmId для сравнения
        const checkId = typeof filmId === 'string' ? parseInt(filmId, 10) : filmId;

        // Проверяем в localStorage
        const favorites = getFavoriteFilms();
        const existingFilm = favorites.find(f => {
            const fId = typeof f.id === 'string' ? parseInt(f.id, 10) : f.id;
            return fId === checkId;
        });

        if (existingFilm) {
            // Фильм уже закреплен, используем данные из localStorage
            isFavorite = true;
            currentFilmInfo = {
                id: existingFilm.id,
                name: existingFilm.name,
                url: existingFilm.url,
                poster: existingFilm.poster
            };
        } else {
            // Фильм не закреплен, но убеждаемся, что currentFilmInfo заполнен
            if (!currentFilmInfo || !currentFilmInfo.name) {
                currentFilmInfo = {
                    id: checkId,
                    name: filmName || 'Неизвестный фильм',
                    url: url,
                    poster: filmPoster || ''
                };
            }
            isFavorite = false;
        }
    }

    // Кнопка закрепления (звездочка)
    const favoriteButton = document.createElement('button');
    favoriteButton.innerHTML = isFavorite ? '★' : '☆';
    favoriteButton.title = isFavorite ? 'Открепить фильм' : 'Закрепить фильм';
    favoriteButton.style.cssText = `
        background: transparent;
        border: none;
        color: ${isFavorite ? '#ffd700' : '#ffffff'};
        cursor: pointer;
        font-size: 20px;
        font-family: 'Consolas', 'Courier New', monospace;
        transition: opacity 0.2s ease;
        padding: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    favoriteButton.onmouseover = function () {
        this.style.opacity = '0.7';
    };

    favoriteButton.onmouseout = function () {
        this.style.opacity = '1';
    };

    favoriteButton.onclick = function (e) {
        e.stopPropagation();
        if (filmId && currentFilmInfo) {
            toggleFavorite(filmId, currentFilmInfo.name, url, currentFilmInfo.poster);
            const newIsFavorite = isFilmFavorite(filmId);
            favoriteButton.innerHTML = newIsFavorite ? '★' : '☆';
            favoriteButton.style.color = newIsFavorite ? '#ffd700' : '#ffffff';
            favoriteButton.title = newIsFavorite ? 'Открепить фильм' : 'Закрепить фильм';
        }
    };

    // Кнопка закрытия
    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    closeButton.style.cssText = `
        background: transparent;
        border: none;
        color: #ffffff;
        cursor: pointer;
        font-size: 20px;
        font-family: 'Consolas', 'Courier New', monospace;
        transition: opacity 0.2s ease;
        padding: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    closeButton.onmouseover = function () {
        this.style.opacity = '0.7';
    };

    closeButton.onmouseout = function () {
        this.style.opacity = '1';
    };

    closeButton.onclick = function () {
        closeModalAndRestoreSearch();
    };

    buttonsContainer.appendChild(favoriteButton);
    buttonsContainer.appendChild(closeButton);

    // Iframe с плеером
    const iframe = document.createElement('iframe');

    // Функция для безопасного подключения: если API недоступно (например, на live-server), откроет напрямую
    const setupIframeSrc = async (targetUrl) => {
        try {
            // Быстро проверяем, жива ли Serverless функция
            const check = await fetch('/api/player?url=check', { method: 'HEAD' }).catch(() => null);
            if (check && check.status !== 404) {
                iframe.src = `/api/player?url=${encodeURIComponent(targetUrl)}`;
            } else {
                console.log('⚠️ Сервер Vercel недоступен (локальная среда). Открываем прямой URL (реклама не вырезана).');
                iframe.src = targetUrl;
            }
        } catch (e) {
            iframe.src = targetUrl;
        }
    };

    // Запускаем подключение
    setupIframeSrc(url);

    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        flex: 1;
    `;
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write;');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');

    // Обработка ошибок загрузки - пробуем HTTP версию
    iframe.onerror = function () {
        console.warn('⚠️ HTTPS не загрузился, пробуем HTTP...');
        const httpUrl = url.replace(/^https:/, 'http:');
        if (httpUrl !== url) {
            setupIframeSrc(httpUrl);
        }
    };

    // Если iframe не загружается через некоторое время, пробуем HTTP
    const loadTimeout = setTimeout(() => {
        try {
            // Пробуем получить доступ к содержимому iframe
            if (iframe.contentWindow === null || iframe.contentDocument === null) {
                console.warn('⚠️ Iframe не загрузился, пробуем HTTP...');
                const httpUrl = url.replace(/^https:/, 'http:');
                if (httpUrl !== url) {
                    setupIframeSrc(httpUrl);
                }
            }
        } catch (e) {
            // Cross-origin ошибка - это нормально, но пробуем HTTP
            console.warn('⚠️ Cross-origin ошибка, пробуем HTTP...');
            const httpUrl = url.replace(/^https:/, 'http:');
            if (httpUrl !== url) {
                setupIframeSrc(httpUrl);
            }
        }
    }, 3000);

    iframe.onload = function () {
        clearTimeout(loadTimeout);
        console.log('✅ Iframe загружен успешно');

        // Попытка отправки скрипта очистки через postMessage
        // ВАЖНО: Это может не сработать из-за ограничений безопасности браузера.
        // Рекомендуется использовать userscript для Tampermonkey (см. adblock-userscript.js)
        try {
            const adblockScript = `
                (function() {
                    function removeAds() {
                        const selectors = [
                            '[class*="ad"]', '[id*="ad"]',
                            '[class*="banner"]', '[id*="banner"]',
                            '[class*="ads"]', '[id*="ads"]',
                            'iframe[src*="ad"]', 'iframe[src*="doubleclick"]',
                            '[class*="sidebar"]:not([class*="player"])'
                        ];
                        selectors.forEach(sel => {
                            try {
                                document.querySelectorAll(sel).forEach(el => {
                                    if (!el.closest('[class*="player"]') && !el.closest('[id*="player"]')) {
                                        el.remove();
                                    }
                                });
                            } catch(e) {}
                        });
                    }
                    removeAds();
                    setInterval(removeAds, 2000);
                    new MutationObserver(removeAds).observe(document.body, {childList: true, subtree: true});
                })();
            `;
            // Попытка отправить скрипт (может не сработать из-за CORS)
            iframe.contentWindow?.postMessage({ type: 'injectScript', script: adblockScript }, '*');
        } catch (e) {
            console.log('⚠️ Автоматическая очистка рекламы недоступна (нормально для кросс-доменных iframe)');
            console.log('💡 Используйте userscript для Tampermonkey (см. файл adblock-userscript.js)');
        }
    };

    modal.appendChild(buttonsContainer);
    modal.appendChild(iframe);
    document.body.appendChild(modal);

    // Закрытие по Escape
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            if (document.body.contains(modal)) {
                closeModalAndRestoreSearch();
                document.removeEventListener('keydown', escapeHandler);
            }
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

// Закрытие модального окна и восстановление состояния поиска
function closeModalAndRestoreSearch() {
    const modal = document.getElementById('playerModal');
    if (modal) {
        document.body.removeChild(modal);
    }

    // Восстанавливаем состояние поля поиска
    const searchTextElement = document.getElementById('searchText');
    if (searchTextElement && typeof resetToAnimationMode === 'function') {
        // Очищаем поле и возвращаем в режим анимации
        searchTextElement.textContent = '';
        searchTextElement.contentEditable = 'false';
        const cursorElement = document.getElementById('cursor');
        if (cursorElement) {
            cursorElement.classList.remove('hidden');
        }
        // Возвращаем анимацию (resetToAnimationMode сам сбросит все флаги)
        setTimeout(() => {
            resetToAnimationMode();
        }, 100);
    }
}

// Показ ошибки поиска в модальном окне
function showSearchError(query, customMessage = null) {
    // Удаляем существующее модальное окно, если есть
    const existingModal = document.getElementById('playerModal');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }

    const modal = document.createElement('div');
    modal.id = 'playerModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.95);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const errorContent = document.createElement('div');
    errorContent.style.cssText = `
        background: #1a1a1a;
        border: 1px solid #575757;
        padding: 40px;
        max-width: 500px;
        text-align: center;
        color: #ffffff;
        font-family: 'Consolas', 'Courier New', monospace;
    `;

    const errorTitle = document.createElement('h2');
    errorTitle.textContent = 'Поиск не удался';
    errorTitle.style.cssText = `
        margin: 0 0 20px 0;
        color: #ffffff;
        font-size: 24px;
    `;

    const errorText = document.createElement('p');
    errorText.textContent = customMessage || `Не удалось найти "${query}" на Кинопоиске. Попробуйте изменить запрос или проверить интернет-соединение.`;
    errorText.style.cssText = `
        margin: 0 0 30px 0;
        color: #cccccc;
        line-height: 1.6;
    `;

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Закрыть';
    closeButton.style.cssText = `
        background: #2d2d2d;
        border: 1px solid #575757;
        color: #ffffff;
        padding: 10px 30px;
        cursor: pointer;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 16px;
        transition: all 0.2s ease;
    `;

    closeButton.onmouseover = function () {
        this.style.background = '#575757';
        this.style.borderColor = '#696868';
    };

    closeButton.onmouseout = function () {
        this.style.background = '#2d2d2d';
        this.style.borderColor = '#575757';
    };

    closeButton.onclick = function () {
        closeModalAndRestoreSearch();
    };

    errorContent.appendChild(errorTitle);
    errorContent.appendChild(errorText);
    errorContent.appendChild(closeButton);
    modal.appendChild(errorContent);
    document.body.appendChild(modal);

    // Закрытие по Escape
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', escapeHandler);
            }
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

// Работа с закрепленными фильмами в localStorage
function getFavoriteFilms() {
    try {
        const favorites = localStorage.getItem('ktw_favorite_films');
        return favorites ? JSON.parse(favorites) : [];
    } catch (e) {
        console.error('Ошибка при чтении закрепленных фильмов:', e);
        return [];
    }
}

function saveFavoriteFilms(films) {
    try {
        localStorage.setItem('ktw_favorite_films', JSON.stringify(films));
    } catch (e) {
        console.error('Ошибка при сохранении закрепленных фильмов:', e);
    }
}

function isFilmFavorite(filmId) {
    const favorites = getFavoriteFilms();
    // Преобразуем filmId для корректного сравнения
    const checkId = typeof filmId === 'string' ? parseInt(filmId, 10) : filmId;
    return favorites.some(f => {
        const fId = typeof f.id === 'string' ? parseInt(f.id, 10) : f.id;
        return fId === checkId;
    });
}

function toggleFavorite(filmId, filmName, filmUrl, filmPoster) {
    // Преобразуем filmId для корректного сравнения
    const id = typeof filmId === 'string' ? parseInt(filmId, 10) : filmId;
    let favorites = getFavoriteFilms();

    // Ищем существующий фильм с правильным сравнением типов
    const existingIndex = favorites.findIndex(f => {
        const fId = typeof f.id === 'string' ? parseInt(f.id, 10) : f.id;
        return fId === id;
    });

    if (existingIndex >= 0) {
        // Открепляем
        favorites.splice(existingIndex, 1);
        console.log('Фильм откреплен через toggle, ID:', id);
    } else {
        // Закрепляем
        favorites.push({
            id: id, // Сохраняем как число
            name: filmName,
            url: filmUrl,
            poster: filmPoster || ''
        });
        console.log('Фильм закреплен, ID:', id);
    }

    saveFavoriteFilms(favorites);
    renderFavoriteFilms();
}

function removeFavorite(filmId) {
    // Преобразуем filmId в число для корректного сравнения
    const id = typeof filmId === 'string' ? parseInt(filmId, 10) : filmId;
    let favorites = getFavoriteFilms();
    favorites = favorites.filter(f => {
        // Преобразуем оба ID к числу для сравнения
        const filmIdNum = typeof f.id === 'string' ? parseInt(f.id, 10) : f.id;
        return filmIdNum !== id;
    });
    saveFavoriteFilms(favorites);
    renderFavoriteFilms();
    console.log('Фильм откреплен, ID:', id);
}

function renderFavoriteFilms() {
    const container = document.getElementById('favoriteFilmsContainer');
    if (!container) return;

    const favorites = getFavoriteFilms();

    if (favorites.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = favorites.map(film => `
        <div class="favorite-film-tile" data-film-id="${String(film.id)}" data-film-url="${film.url.replace(/"/g, '&quot;')}">
            <div class="favorite-film-name">${film.name}</div>
        </div>
    `).join('');

    // Добавляем обработчики событий
    container.querySelectorAll('.favorite-film-tile').forEach(tile => {
        // ЛКМ - открытие
        tile.addEventListener('click', (e) => {
            if (e.button === 0 || !e.button) { // ЛКМ
                const url = tile.dataset.filmUrl;
                openFavoriteFilm(url);
            }
        });

        // ПКМ - контекстное меню
        tile.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY, tile);
        });
    });
}

// Показать контекстное меню
function showContextMenu(x, y, tile) {
    // Удаляем существующее меню
    const existingMenu = document.getElementById('contextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const filmId = tile.dataset.filmId;
    const filmName = tile.querySelector('.favorite-film-name').textContent;

    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        background: #1a1a1a;
        border: 1px solid #575757;
        padding: 8px 0;
        z-index: 10002;
        min-width: 150px;
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 13px;
    `;

    // Опция: Открепить
    const unfavoriteOption = document.createElement('div');
    unfavoriteOption.className = 'context-menu-item';
    unfavoriteOption.textContent = 'Открепить';
    unfavoriteOption.style.cssText = `
        padding: 8px 16px;
        color: #ffffff;
        cursor: pointer;
        transition: background 0.2s ease;
    `;
    unfavoriteOption.onmouseover = function () {
        this.style.background = '#575757';
    };
    unfavoriteOption.onmouseout = function () {
        this.style.background = 'transparent';
    };
    unfavoriteOption.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Открепление фильма, ID из dataset:', filmId);
        if (filmId) {
            removeFavorite(filmId);
        }
        menu.remove();
    };

    menu.appendChild(unfavoriteOption);
    document.body.appendChild(menu);

    // Закрытие меню при клике вне его
    const closeMenu = (e) => {
        // Не закрываем меню, если клик был по пункту меню
        if (menu.contains(e.target)) {
            return;
        }
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu);
    };

    // Закрытие при клике ЛКМ
    setTimeout(() => {
        document.addEventListener('click', closeMenu, true);
    }, 100);

    // Закрытие при клике ПКМ
    setTimeout(() => {
        document.addEventListener('contextmenu', closeMenu, true);
    }, 100);
}

function openFavoriteFilm(url) {
    // Извлекаем ID из URL
    const match = url.match(/\/film\/(\d+)/);
    const filmId = match ? match[1] : null;

    // Пробуем получить информацию о фильме из закрепленных
    const favorites = getFavoriteFilms();
    const film = favorites.find(f => f.id == filmId);

    if (film) {
        currentFilmInfo = {
            id: film.id,
            name: film.name,
            url: film.url,
            poster: film.poster
        };
    }

    openPlayerWindow(url, filmId, film?.name || '', film?.poster || '');
}

// Экспортируем функции для использования в HTML
window.removeFavorite = removeFavorite;
window.openFavoriteFilm = openFavoriteFilm;

// Инициализация закрепленных фильмов при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(renderFavoriteFilms, 500);
        initSearchSuggestions();
    });
} else {
    setTimeout(renderFavoriteFilms, 500);
    initSearchSuggestions();
}

