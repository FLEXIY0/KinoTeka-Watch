'use strict';

// Модуль самообновления ktw (ktw --update / -u)

var path = require('path');
var fs = require('fs');
var execFileSync = require('child_process').execFileSync;
var spawnSync = require('child_process').spawnSync;

var ui = require('./ui');

function getGitCommit(root) {
    try {
        return execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) {
        return '';
    }
}

function getGitBranch(root) {
    try {
        return execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) {
        return '';
    }
}

async function runUpdate() {
    var root = path.resolve(path.join(__dirname, '..', '..'));
    var isGit = fs.existsSync(path.join(root, '.git'));

    ui.info('');
    ui.info(ui.color.bold('📦 Обновление KinoTeka Watch (KTW)'));
    ui.info('  Каталог: ' + ui.color.dim(root));

    if (!isGit) {
        ui.info('  ' + ui.color.yellow('Рядом нет .git репозитория — запускаю установщик...'));
        if (process.platform === 'win32') {
            ui.info('  Запусти в PowerShell:');
            ui.info('  ' + ui.color.cyan('irm https://raw.githubusercontent.com/FLEXIY0/KinoTeka-Watch/claude/direct-tui-bun-install-d9bhfq/cli/install.ps1 | iex'));
        } else {
            ui.info('  Запусти в терминале:');
            ui.info('  ' + ui.color.cyan('curl -fsSL https://raw.githubusercontent.com/FLEXIY0/KinoTeka-Watch/claude/direct-tui-bun-install-d9bhfq/cli/install.sh | sh'));
        }
        return 0;
    }

    var oldCommit = getGitCommit(root);
    var branch = getGitBranch(root) || 'claude/direct-tui-bun-install-d9bhfq';
    ui.info('  Текущая версия: ' + ui.color.cyan(oldCommit || 'unknown') + ' (ветка: ' + branch + ')');

    var spinner = ui.spinner('Связываюсь с сервером обновлений (GitHub)');
    try {
        execFileSync('git', ['-C', root, 'fetch', 'origin', branch], { stdio: 'ignore', timeout: 30000 });
    } catch (err) {
        spinner.stop();
        ui.error('Не удалось связаться с GitHub: ' + err.message);
        ui.info(ui.color.dim('  Проверь подключение к интернету'));
        return 1;
    }

    var behind = '0';
    try {
        behind = execFileSync('git', ['-C', root, 'rev-list', '--count', 'HEAD..origin/' + branch],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) {}

    if (behind === '0' || !behind) {
        spinner.stop();
        ui.info('  ' + ui.color.green('✓ У тебя уже установлена самая свежая версия! (' + oldCommit + ')'));
        return 0;
    }

    spinner.update('Загружаю обновления (' + behind + ' новых коммитов)...');

    try {
        execFileSync('git', ['-C', root, 'checkout', '-f', branch], { stdio: 'ignore', timeout: 15000 });
        execFileSync('git', ['-C', root, 'reset', '--hard', 'origin/' + branch], { stdio: 'ignore', timeout: 15000 });
    } catch (err) {
        spinner.stop();
        ui.error('Ошибка при применении обновления: ' + err.message);
        return 1;
    }

    var newCommit = getGitCommit(root);
    spinner.update('Обновляю зависимости...');

    // Установка зависимостей через Bun или npm
    try {
        if (typeof Bun !== 'undefined' || spawnSync('bun', ['--version']).status === 0) {
            execFileSync('bun', ['install', '--production'], { cwd: root, stdio: 'ignore', timeout: 60000 });
        } else {
            execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root, stdio: 'ignore', timeout: 60000 });
        }
    } catch (e) {}

    // На Windows компилируем свежий ktw.exe, если доступен Bun
    if (process.platform === 'win32') {
        spinner.update('Пересобираю бинарник ktw.exe...');
        try {
            var binDir = path.join(process.env.USERPROFILE || '', '.local', 'bin');
            if (fs.existsSync(binDir) && (typeof Bun !== 'undefined' || spawnSync('bun', ['--version']).status === 0)) {
                var exePath = path.join(binDir, 'ktw.exe');
                var ktwJs = path.join(root, 'cli', 'ktw.js');
                execFileSync('bun', ['build', '--compile', '--minify', ktwJs, '--outfile', exePath], { stdio: 'ignore', timeout: 30000 });
                try {
                    fs.copyFileSync(exePath, path.join(binDir, 'ktw2.exe'));
                } catch (e) {}
            }
        } catch (e) {}
    }

    spinner.stop();

    ui.info('');
    ui.info(ui.color.green('  ✓ Обновление успешно завершено!'));
    ui.info('  Версия: ' + ui.color.dim(oldCommit) + ' → ' + ui.color.bold(newCommit) + ' (+' + behind + ' коммитов)');

    try {
        var log = execFileSync('git', ['-C', root, 'log', '--oneline', '-n', Math.min(5, parseInt(behind, 10) || 5), 'HEAD'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (log) {
            ui.info('');
            ui.info(ui.color.bold('  Последние изменения:'));
            log.split('\n').forEach(function (line) {
                ui.info('    • ' + ui.color.dim(line));
            });
        }
    } catch (e) {}

    ui.info('');
    return 0;
}

module.exports = {
    runUpdate: runUpdate
};
