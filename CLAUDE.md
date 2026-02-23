# KinoTeka Watch

## Язык общения

Всегда отвечай на русском языке.

## О проекте

Статический веб-сайт для поиска и просмотра фильмов. Без фреймворков, без сборки — чистый HTML/CSS/JS.

- **Деплой**: Vercel (https://kino-teka-watch.vercel.app/)
- **API**: Kinopoisk Unofficial API для поиска фильмов
- **Плеер**: Внешний стриминговый плеер (flcksbr.top)

## Структура проекта

```
index.html              — Единственная HTML-страница
js/
  script.js             — Основная логика (плеер, избранное, UI)
  script-search.js      — Поиск через Kinopoisk API, подсказки
  script-lang.js        — Мультиязычность (ru, en, de)
css/
  styles.css            — Основные стили
  responsive.css        — Адаптивная вёрстка
  theme-light.css       — Светлая тема
img/                    — Иконки и фавиконы
vercel.json             — Конфигурация деплоя
```

## Как запустить локально

```bash
python3 -m http.server 8080
```

Затем открыть http://localhost:8080

## API-ключ

- На Vercel: переменная окружения `KINOPOISK_API_KEY` подставляется через `sed` при билде
- Локально: файл `kinopoisk-key.js` (в .gitignore) с содержимым:
  ```js
  window.KINOPOISK_API_KEY = 'твой_ключ';
  ```

## Правила разработки

- Проект без сборщиков — никаких npm, webpack, vite. Просто статические файлы
- Не создавай package.json и не добавляй зависимости без явного запроса
- Не трогай CSP-заголовок в index.html без необходимости
- Не коммить файлы с секретами (kinopoisk-key.js, .env, config.js)
- Сохраняй существующий стиль кода: vanilla JS, без классов ES6, camelCase
- Комментарии в коде — на русском языке
