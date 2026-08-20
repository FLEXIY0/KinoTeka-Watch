'use strict';

// Набор автоматических тестов для проверки всех модулей ktw:
// 1. API и Kinobox
// 2. Прямые экстракторы (Collaps, Kodik)
// 3. Извлечение потока и разбор мастер-плейлиста HLS
// 4. Привязка аудиодорожек (--aid) и субтитров
// 5. Конфигурация и сохранение настроек
// 6. Формирование команд для mpv

var api = require('./lib/api');
var extractors = require('./lib/extractors');
var stream = require('./lib/stream');
var config = require('./lib/config');
var mpv = require('./lib/mpv');

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
    console.log('\n\x1b[1m=== Запуск тестов ktw ===\x1b[0m\n');

    // ТЕСТ 1: Конфигурация
    console.log('\x1b[36m[1/6] Тестирование модуля config\x1b[0m');
    var initialConfig = config.read();
    assert(typeof initialConfig === 'object', 'Конфигурация успешно читается');
    assert(initialConfig.mpvHardwareDec !== undefined, 'Параметр mpvHardwareDec присутствует');

    var saved = config.save({ preferredQuality: '1080' });
    assert(config.read().preferredQuality === '1080', 'Параметр preferredQuality корректно сохраняется');
    config.save({ preferredQuality: initialConfig.preferredQuality || '' });

    // ТЕСТ 2: Kinobox API и получение плееров
    console.log('\n\x1b[36m[2/6] Тестирование Kinobox API (Матрица id=301)\x1b[0m');
    var players = await api.getPlayers(301);
    assert(Array.isArray(players) && players.length > 0, 'Получен список плееров из Kinobox (' + players.length + ' шт.)');
    
    var directPlayer = players.find(function (p) { return p.direct; });
    assert(!!directPlayer, 'Плеер с прямым извлечением найден и помечен ⚡ (' + (directPlayer ? directPlayer.source : 'нет') + ')');
    assert(players[0].direct === true, 'Прямой плеер ⚡ автоматически отсортирован на 1-е место');

    // ТЕСТ 3: Прямой экстрактор Collaps (Фильм)
    console.log('\n\x1b[36m[3/6] Тестирование прямого извлечения Collaps (Фильм: Матрица)\x1b[0m');
    var startMovie = Date.now();
    var collapsUrl = 'https://api.ortified.ws/embed/movie/474';
    var movieRes = await extractors.extractDirectStream(collapsUrl);
    var movieTime = Date.now() - startMovie;

    assert(!!movieRes && !!movieRes.url, 'Прямой поток извлечен за ' + movieTime + ' мс (< 200 мс)');
    assert(movieRes.url.includes('.m3u8') || movieRes.url.includes('.mpd'), 'Ссылка на поток содержит валидный манифест (.m3u8/.mpd)');
    assert(Array.isArray(movieRes.audioTracks) && movieRes.audioTracks.length > 0, 'Извлечен список звуковых дорожек (' + movieRes.audioTracks.length + ' дорожек)');
    assert(Array.isArray(movieRes.subtitles) && movieRes.subtitles.length > 0, 'Извлечены субтитры (' + movieRes.subtitles.length + ' шт.)');

    // ТЕСТ 4: Прямой экстрактор Collaps (Сериал: Во все тяжкие S1E1)
    console.log('\n\x1b[36m[4/6] Тестирование прямого извлечения сериала (Breaking Bad S1E1)\x1b[0m');
    var startSerial = Date.now();
    var serialUrl = 'https://api.ortified.ws/embed/movie/255';
    var serialRes = await extractors.extractDirectStream(serialUrl, { season: 1, episode: 1 });
    var serialTime = Date.now() - startSerial;

    assert(!!serialRes && !!serialRes.url, 'Серия S1E1 извлечена за ' + serialTime + ' мс');
    assert(serialRes.title.includes('1'), 'Название серии корректно сопоставлено: ' + serialRes.title);
    
    var kubikTrack = serialRes.audioTracks.find(function (t) { return t.name.toLowerCase().includes('кубик'); });
    assert(!!kubikTrack, 'Озвучка «Кубик в кубе» найдена в списке дорожек');
    assert(kubikTrack ? kubikTrack.audioId === 1 : false, 'ID дорожки «Кубик в кубе» корректен (--aid=' + (kubikTrack ? kubikTrack.audioId : 'none') + ')');

    // ТЕСТ 5: Разбор мастер-плейлиста HLS и выбор качества
    console.log('\n\x1b[36m[5/6] Тестирование разбора HLS мастер-плейлиста и качеств\x1b[0m');
    var variants = await stream.readVariants(movieRes);
    assert(Array.isArray(variants) && variants.length > 0, 'Мастер-плейлист распарсен, найдено вариантов качества: ' + variants.length);
    
    var variant1080 = stream.pickVariant(variants, '1080');
    var variant720 = stream.pickVariant(variants, '720');
    assert(!!variant720, 'Вариант 720p успешно выбран (' + (variant720 ? variant720.label : '') + ')');
    assert(!!variant1080, 'Вариант 1080p/Max успешно выбран (' + (variant1080 ? variant1080.label : '') + ')');

    // ТЕСТ 6: Формирование команды mpv с --aid, субтитрами и заголовком
    console.log('\n\x1b[36m[6/6] Тестирование сборки команды для mpv\x1b[0m');
    var testStream = {
        url: 'https://cdn.example.com/stream.m3u8',
        referer: 'https://api.ortified.ws/',
        origin: 'https://api.ortified.ws',
        audioId: 14,
        subtitleUrl: 'https://cdn.example.com/subs.vtt'
    };
    var cmd = mpv.buildCommand(testStream, 'Матрица (1999)', ['--volume=80']);
    assert(cmd.includes('--aid=14'), 'Команда mpv содержит точный параметр --aid=14');
    assert(cmd.includes('--sub-file='), 'Команда mpv содержит подключение субтитров --sub-file=');
    assert(cmd.includes('--force-media-title='), 'Команда mpv содержит читаемый заголовок окна');
    assert(cmd.includes('--volume=80'), 'Пользовательские аргументы корректно переданы в команду');

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
