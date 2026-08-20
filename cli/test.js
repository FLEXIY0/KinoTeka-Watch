'use strict';

// Полный набор автоматических тестов для всех модулей ktw:
// 1. Конфигурация (~/.config/ktw/config.json)
// 2. История просмотров и возобновление (~/.config/ktw/history.json)
// 3. Kinobox API и нормализация балансеров
// 4. Прямые экстракторы (Collaps, Kodik, Alloha, Veoveo)
// 5. Разбор мастер-плейлиста HLS и выбор качества
// 6. Формирование команд mpv с IPC, --start, --aid и субтитрами

var api = require('./lib/api');
var extractors = require('./lib/extractors');
var stream = require('./lib/stream');
var config = require('./lib/config');
var mpv = require('./lib/mpv');
var history = require('./lib/history');

var passed = 0;
var failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log('  \x1b[32m✓\x1b[0m ' + message);
        passed++;
    } else {
        console.error('  \x1b[31m✗\x1b[0m ' + message);
        failed++;
    }
}

async function runTests() {
    console.log('\n\x1b[1m=== Запуск расширенного набора тестов ktw ===\x1b[0m\n');

    // ТЕСТ 1: Конфигурация
    console.log('\x1b[36m[1/6] Тестирование модуля config\x1b[0m');
    var initialConfig = config.read();
    assert(typeof initialConfig === 'object', 'Конфигурация успешно читается');
    assert(initialConfig.mpvHardwareDec !== undefined, 'Параметр mpvHardwareDec присутствует');

    config.save({ preferredQuality: '1080' });
    assert(config.read().preferredQuality === '1080', 'Параметр preferredQuality корректно сохраняется');
    config.save({ preferredQuality: initialConfig.preferredQuality || '' });

    // ТЕСТ 2: История просмотров и возобновление
    console.log('\n\x1b[36m[2/6] Тестирование модуля истории просмотров (history.js)\x1b[0m');
    assert(typeof history.formatTime(3665) === 'string' && history.formatTime(3665) === '01:01:05', 'formatTime: 3665 сек -> 01:01:05');
    assert(history.formatTime(125) === '02:05', 'formatTime: 125 сек -> 02:05');

    // Сохраняем тестовый фильм в историю
    history.saveProgress({
        filmId: 999999,
        title: 'Тестовый Фильм',
        year: '2026',
        serial: false,
        timePos: 1200,
        duration: 3600,
        player: 'Collaps',
        translation: 'Дубляж'
    });

    var savedFilm = history.getProgress(999999);
    assert(!!savedFilm, 'Фильм успешно сохранён в историю');
    assert(savedFilm.timePos === 1200, 'Таймкод сохранён точно (1200 сек)');
    assert(savedFilm.percentage === 33, 'Процент просмотра рассчитан корректно (33%)');

    // Сохраняем тестовую серию сериала
    history.saveProgress({
        filmId: 999998,
        title: 'Тестовый Сериал',
        serial: true,
        season: 1,
        episode: 3,
        timePos: 2800,
        duration: 3000 // > 85% — просмотрено
    });

    var isWatched = history.isEpisodeWatched(999998, 1, 3);
    assert(isWatched === true, 'Серия помечена как просмотренная (isEpisodeWatched: true)');
    var isNotWatched = history.isEpisodeWatched(999998, 1, 4);
    assert(isNotWatched === false, 'Непросмотренная серия возвращает false');
    assert(history.getWatchedEpisodesCount(999998) === 1, 'getWatchedEpisodesCount: 1 серия');

    // Проверяем сброс прогресса сериала (resetSerial)
    history.resetSerial(999998);
    assert(history.isEpisodeWatched(999998, 1, 3) === false, 'После resetSerial серия больше не помечена');
    assert(history.getWatchedEpisodesCount(999998) === 0, 'После resetSerial количество просмотренных серий = 0');

    // Очищаем тестовые записи
    history.remove(999999);
    history.remove(999998);
    assert(history.getProgress(999999) === null, 'Тестовые записи успешно удалены из истории');

    // ТЕСТ i18n: Локализация
    var i18n = require('./lib/i18n');
    assert(i18n.t('search_field', 'ru') === 'Поиск', 'i18n RU: Поиск');
    assert(i18n.t('search_field', 'en') === 'Search', 'i18n EN: Search');
    assert(i18n.t('history_title', 'en') === 'History Gallery', 'i18n EN: History Gallery');

    // ТЕСТ 3: Kinobox API и получение плееров
    console.log('\n\x1b[36m[3/6] Тестирование Kinobox API (Матрица id=301)\x1b[0m');
    var players = await api.getPlayers(301);
    assert(Array.isArray(players) && players.length > 0, 'Получен список плееров из Kinobox (' + players.length + ' шт.)');
    
    var directPlayer = players.find(function (p) { return p.direct; });
    assert(!!directPlayer, 'Плеер с прямым извлечением найден и помечен ⚡ (' + (directPlayer ? directPlayer.source : 'нет') + ')');
    assert(players[0].direct === true, 'Прямой плеер ⚡ автоматически отсортирован на 1-е место');

    // ТЕСТ 4: Прямые экстракторы (Collaps, Kodik)
    console.log('\n\x1b[36m[4/6] Тестирование прямых экстракторов\x1b[0m');
    var collapsUrl = 'https://api.ortified.ws/embed/movie/474';
    var movieRes = await extractors.extractDirectStream(collapsUrl);
    assert(!!movieRes && !!movieRes.url, 'Collaps: фильм извлечен напрямую (url получен)');
    assert(Array.isArray(movieRes.audioTracks) && movieRes.audioTracks.length > 0, 'Collaps: извлечен список дорожек (' + movieRes.audioTracks.length + ' шт.)');

    var serialUrl = 'https://api.ortified.ws/embed/movie/255';
    var serialRes = await extractors.extractDirectStream(serialUrl, { season: 1, episode: 1 });
    assert(!!serialRes && !!serialRes.url, 'Collaps: серия S1E1 извлечена напрямую');
    assert(serialRes.audioTracks.some(function (t) { return t.name.toLowerCase().includes('кубик'); }), 'Collaps: найдена озвучка «Кубик в кубе»');

    // ТЕСТ 5: Разбор мастер-плейлиста HLS и выбор качества
    console.log('\n\x1b[36m[5/6] Тестирование разбора HLS мастер-плейлиста и качеств\x1b[0m');
    var variants = await stream.readVariants(movieRes);
    assert(Array.isArray(variants) && variants.length > 0, 'Мастер-плейлист распарсен, вариантов: ' + variants.length);
    var variant720 = stream.pickVariant(variants, '720');
    assert(!!variant720, 'Вариант 720p успешно выбран (' + (variant720 ? variant720.label : '') + ')');

    // ТЕСТ 6: Формирование команды mpv с IPC, --start и --aid
    console.log('\n\x1b[36m[6/6] Тестирование сборки команды mpv с IPC и возобновлением\x1b[0m');
    var testStream = {
        url: 'https://cdn.example.com/stream.m3u8',
        referer: 'https://api.ortified.ws/',
        origin: 'https://api.ortified.ws',
        audioId: 14,
        startTime: 1450, // 24:10
        subtitleUrl: 'https://cdn.example.com/subs.vtt'
    };
    var fakeSocket = '/tmp/ktw-mpv-test.sock';
    var args = mpv.buildArgs(testStream, 'Матрица (1999)', ['--volume=80'], fakeSocket);
    assert(args.includes('--input-ipc-server=' + fakeSocket), 'Аргументы содержат --input-ipc-server для отслеживания таймкода');
    assert(args.includes('--start=1450'), 'Аргументы содержат --start=1450 для возобновления просмотра');
    assert(args.includes('--aid=14'), 'Аргументы содержат точный --aid=14 для звуковой дорожки');
    assert(args.some(function (a) { return a.includes('--sub-file='); }), 'Аргументы содержат подключение субтитров --sub-file=');

    // ТЕСТ 7: Динамический генератор FIGlet шрифтов и темы
    console.log('\n\x1b[36m[7/7] Тестирование динамического генератора FIGlet шрифтов\x1b[0m');
    var themes = require('./lib/themes');
    var slantLogo = themes.renderLogo('cyberpunk', 'slant');
    assert(Array.isArray(slantLogo) && slantLogo.length > 0, 'Генерация Slant шрифта через FIGlet успешна');
    var shadowLogo = themes.renderLogo('cinema', 'ansi_shadow');
    assert(Array.isArray(shadowLogo) && shadowLogo.length > 0, 'Генерация ANSI Shadow шрифта через FIGlet успешна');
    var offLogo = themes.renderLogo('matrix', 'off');
    assert(Array.isArray(offLogo) && offLogo.length === 0, 'Режим off возвращает пустой список строк');

    // ТЕСТ 8: Модуль замера оперативной памяти (sysinfo.js)
    console.log('\n\x1b[36m[8/8] Тестирование модуля замера оперативной памяти (sysinfo.js) с mpv\x1b[0m');
    var sysinfo = require('./lib/sysinfo');
    var selfRss = sysinfo.getProcessRssMb(process.pid);
    assert(typeof selfRss === 'number' && selfRss > 0, 'Чтение RSS текущего процесса: ' + selfRss + ' МБ');
    var probeMpv = sysinfo.probeMpvRssMb();
    assert(typeof probeMpv === 'number' && probeMpv > 0, 'Калибровка/замер памяти mpv: ' + probeMpv + ' МБ');
    var activeStats = sysinfo.getMemoryStats(process.pid);
    assert(activeStats.mpvActive === true, 'Отслеживание активного PID mpv работает корректно');
    var memStats = sysinfo.getMemoryStats();
    assert(typeof memStats.ktw === 'number' && memStats.ktw > 0, 'Замер памяти KTW RSS: ' + memStats.ktw + ' МБ');
    assert(typeof memStats.mpv === 'number' && memStats.mpv > 0, 'Замер памяти mpv: ' + memStats.mpv + ' МБ');
    assert(typeof memStats.total === 'number' && memStats.total >= memStats.ktw, 'Расчет суммарной памяти: ' + memStats.total + ' МБ');

    // ИТОГИ
    console.log('\n======================================');
    console.log('Итоги: \x1b[32mУспешно: ' + passed + '\x1b[0m | \x1b[31mОшибок: ' + failed + '\x1b[0m');
    console.log('======================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(function (err) {
    console.error('\nОшибка выполнения тестов:', err);
    process.exit(1);
});
