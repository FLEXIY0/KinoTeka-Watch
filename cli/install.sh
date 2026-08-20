#!/bin/sh
# Установка ktw — терминального клиента KinoTeka Watch.
#
#   curl -fsSL https://raw.githubusercontent.com/FLEXIY0/KinoTeka-Watch/main/cli/install.sh | sh
#
# Чистый POSIX sh: на Devuan и Debian /bin/sh — это dash, поэтому никаких
# bash-измов. Systemd не требуется, права root — только для установки пакетов.

set -eu

REPO_URL="${KTW_REPO:-https://github.com/FLEXIY0/KinoTeka-Watch.git}"
REPO_BRANCH="${KTW_BRANCH:-feature/direct-kinobox-tui}"
INSTALL_DIR="${KTW_HOME:-$HOME/.local/share/ktw2}"
BIN_DIR="${KTW_BIN:-$HOME/.local/bin}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ktw"

# ---------- оформление ----------

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    C_RESET=$(printf '\033[0m')
    C_BOLD=$(printf '\033[1m')
    C_DIM=$(printf '\033[2m')
    C_ACCENT=$(printf '\033[36m')
    C_OK=$(printf '\033[32m')
    C_WARN=$(printf '\033[33m')
    C_BAD=$(printf '\033[31m')
else
    C_RESET='' ; C_BOLD='' ; C_DIM='' ; C_ACCENT='' ; C_OK='' ; C_WARN='' ; C_BAD=''
fi

say()  { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_RESET" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$C_BAD" "$C_RESET" "$*"; }
step() { printf '\n%s%s%s\n' "$C_BOLD" "$*" "$C_RESET"; }
dim()  { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_RESET"; }

die() {
    printf '\n  %s✗ %s%s\n\n' "$C_BAD" "$*" "$C_RESET" >&2
    exit 1
}

banner() {
    printf '\n'
    printf '  %s╭────────────────────────────────────╮%s\n' "$C_ACCENT" "$C_RESET"
    printf '  %s│%s  %sktw%s · KinoTeka Watch в терминале  %s│%s\n' \
        "$C_ACCENT" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_ACCENT" "$C_RESET"
    printf '  %s╰────────────────────────────────────╯%s\n' "$C_ACCENT" "$C_RESET"
}

has() { command -v "$1" >/dev/null 2>&1; }

# Скрипт мог прийти по конвейеру из curl — тогда спрашивать не у кого.
# Проверяем именно открытием: файл /dev/tty есть всегда, но без
# управляющего терминала открыть его нельзя.
# Подоболочка обязательна: ошибка перенаправления у встроенной команды
# завершает весь POSIX-шелл, а внутри подоболочки остаётся просто кодом возврата.
has_tty() { (exec < /dev/tty) 2>/dev/null; }

# Чтение ответа: скрипт часто запускают через curl | sh, поэтому stdin занят
ask() {
    _prompt="$1"
    _answer=""

    if has_tty; then
        printf '  %s?%s %s ' "$C_ACCENT" "$C_RESET" "$_prompt" > /dev/tty 2>/dev/null || true
        IFS= read -r _answer < /dev/tty 2>/dev/null || _answer=""
    fi

    printf '%s' "$_answer"
}

# ---------- живая строка прогресса ----------
#
# Долгие шаги (npm install тянет Chromium под 150 МБ) раньше молчали, и было
# не отличить работу от зависания. Теперь команда уходит в фон, её вывод — в
# лог, а на экране остаётся одна строка: спиннер, секундомер и либо объём
# скачанного, либо последняя строка вывода.

SPIN_ASCII=1
case "${LC_ALL:-}${LC_CTYPE:-}${LANG:-}" in
    *UTF-8*|*utf-8*|*UTF8*|*utf8*) SPIN_ASCII=0 ;;
esac

# Не все реализации sleep умеют доли секунды (busybox)
if sleep 0.2 2>/dev/null; then SPIN_SLEEP=0.2; else SPIN_SLEEP=1; fi

spin_frame() {
    _n=$1

    if [ "$SPIN_ASCII" = "1" ]; then
        _n=$((_n % 4))
        set -- '|' '/' '-' '\'
    else
        _n=$((_n % 10))
        set -- '⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏'
    fi

    while [ "$_n" -gt 0 ]; do
        shift
        _n=$((_n - 1))
    done

    printf '%s' "$1"
}

SPIN_WATCH=""
SPIN_BASE=0

# Размер отслеживаемого каталога в килобайтах
spin_watch_kb() {
    if [ -n "$SPIN_WATCH" ] && [ -d "$SPIN_WATCH" ]; then
        du -sk "$SPIN_WATCH" 2>/dev/null | cut -f1
    else
        printf '0'
    fi
}

# Что показать справа от секундомера: сколько прибавилось в каталоге за этот
# шаг, иначе последняя осмысленная строка вывода. Считаем именно прирост —
# полный размер кэша при повторном запуске врал бы про «скачано».
spin_note() {
    if [ -n "$SPIN_WATCH" ]; then
        _grown=$(( $(spin_watch_kb) - SPIN_BASE ))

        if [ "$_grown" -gt 1024 ]; then
            printf 'скачано %s МБ' "$((_grown / 1024))"
            return 0
        fi
    fi

    tr '\r' '\n' < "$1" 2>/dev/null \
        | grep -v '^[[:space:]]*$' \
        | tail -n 1 \
        | cut -c1-42
}

spin_run() {
    _label="$1"
    shift

    _log="${TMPDIR:-/tmp}/ktw-install.$$.log"
    : > "$_log"
    SPIN_BASE=$(spin_watch_kb)

    # Без терминала анимация бессмысленна — просто ждём
    if [ ! -t 1 ]; then
        printf '  %s…%s %s\n' "$C_DIM" "$C_RESET" "$_label"
        "$@" > "$_log" 2>&1
        return $?
    fi

    "$@" > "$_log" 2>&1 &
    _pid=$!

    _start=$(date +%s 2>/dev/null || echo 0)
    _tick=0

    while kill -0 "$_pid" 2>/dev/null; do
        _tick=$((_tick + 1))
        _now=$(date +%s 2>/dev/null || echo 0)
        printf '\r\033[2K  %s%s%s %s  %s%ss  %s%s' \
            "$C_ACCENT" "$(spin_frame "$_tick")" "$C_RESET" "$_label" \
            "$C_DIM" "$((_now - _start))" "$(spin_note "$_log")" "$C_RESET"
        sleep "$SPIN_SLEEP"
    done

    _code=0
    wait "$_pid" || _code=$?
    printf '\r\033[2K'

    if [ "$_code" != "0" ]; then
        # Молча глотать ошибку нельзя — показываем хвост лога
        dim "вывод команды:"
        tr '\r' '\n' < "$_log" | grep -v '^[[:space:]]*$' | tail -n 6 | while IFS= read -r _line; do
            dim "  $_line"
        done
    fi

    return $_code
}

# ---------- установка пакетов ----------

PKG_MGR=""
PKG_INSTALL=""
PKG_UPDATED=0

detect_pkg_mgr() {
    if has apt-get; then PKG_MGR="apt-get"; PKG_INSTALL="apt-get install -y"
    elif has apk; then PKG_MGR="apk"; PKG_INSTALL="apk add --no-cache"
    elif has dnf; then PKG_MGR="dnf"; PKG_INSTALL="dnf install -y"
    elif has yum; then PKG_MGR="yum"; PKG_INSTALL="yum install -y"
    elif has pacman; then PKG_MGR="pacman"; PKG_INSTALL="pacman -S --noconfirm --needed"
    elif has zypper; then PKG_MGR="zypper"; PKG_INSTALL="zypper install -y"
    elif has xbps-install; then PKG_MGR="xbps"; PKG_INSTALL="xbps-install -Sy"
    elif has brew; then PKG_MGR="brew"; PKG_INSTALL="brew install"
    fi
}

# Как повышать права: root | sudo | doas | su | none
ROOT_MODE=""

detect_root_mode() {
    if [ "$(id -u)" = "0" ]; then ROOT_MODE="root"
    elif has sudo; then ROOT_MODE="sudo"
    elif has doas; then ROOT_MODE="doas"
    elif has su; then ROOT_MODE="su"
    else ROOT_MODE="none"
    fi
}

# Запуск команды от root: sudo, doas или su — что найдётся
run_root() {
    case "$ROOT_MODE" in
        root) sh -c "$*" ;;
        sudo) sudo sh -c "$*" ;;
        doas) doas sh -c "$*" ;;
        su)   su -c "$*" ;;
        *)    return 1 ;;
    esac
}

# Пароль нельзя спросить из фоновой команды, поэтому sudo авторизуем заранее,
# одним видимым запросом. Там, где остался только su, анимацию не включаем.
ROOT_SPINNABLE=0

ensure_root_ready() {
    case "$ROOT_MODE" in
        root|doas)
            ROOT_SPINNABLE=1
            ;;
        sudo)
            if sudo -n true 2>/dev/null; then
                ROOT_SPINNABLE=1
            elif has_tty; then
                say ""
                dim "нужен пароль sudo, дальше он не понадобится"
                if sudo -v < /dev/tty; then ROOT_SPINNABLE=1; fi
            fi
            ;;
    esac
}

# Обёртка: с анимацией, если это безопасно, иначе как есть
run_root_step() {
    _label="$1"
    _command="$2"

    if [ "$ROOT_SPINNABLE" = "1" ]; then
        spin_run "$_label" run_root "$_command"
        return $?
    fi

    printf '  %s…%s %s\n' "$C_DIM" "$C_RESET" "$_label"
    run_root "$_command"
}

install_pkg() {
    _pkg="$1"

    if [ -z "$PKG_MGR" ]; then
        warn "не понял, какой пакетный менеджер — поставь $_pkg сам"
        return 1
    fi

    if [ "$PKG_MGR" = "brew" ]; then
        spin_run "ставлю $_pkg через brew" brew install "$_pkg" && return 0 || return 1
    fi

    if [ "$PKG_MGR" = "apt-get" ] && [ "$PKG_UPDATED" = "0" ]; then
        run_root_step "обновляю список пакетов" "apt-get update -qq" || true
        PKG_UPDATED=1
    fi

    run_root_step "ставлю $_pkg через $PKG_MGR" "$PKG_INSTALL $_pkg"
}

# Проверяем инструмент и при отсутствии пробуем поставить
require_tool() {
    _cmd="$1"
    _pkg="$2"
    _critical="$3"

    if has "$_cmd"; then
        ok "$_cmd"
        return 0
    fi

    if install_pkg "$_pkg" && has "$_cmd"; then
        ok "$_cmd установлен"
        return 0
    fi

    if [ "$_critical" = "yes" ]; then
        die "не смог поставить $_cmd. Поставь вручную: $PKG_INSTALL $_pkg"
    fi

    warn "$_cmd поставить не вышло — можно и без него"
    return 1
}

# ---------- шаги установки ----------

check_node() {
    if ! has node; then
        if [ "$PKG_MGR" = "apt-get" ]; then
            install_pkg "nodejs npm" || true
        else
            install_pkg nodejs || true
        fi
    fi

    has node || die "нужен Node.js 18+. Поставь его и запусти скрипт заново"

    _major=$(node -v | sed 's/^v\([0-9][0-9]*\).*/\1/')

    if [ "$_major" -lt 18 ] 2>/dev/null; then
        bad "node $(node -v) — слишком старый, нужен 18+"
        say ""
        dim "самый простой способ обновиться без root:"
        dim "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
        dim "  nvm install 20"
        die "обнови Node.js и запусти скрипт заново"
    fi

    ok "node $(node -v)"

    has npm || install_pkg npm || true
    has npm || die "нужен npm. Поставь пакет npm и запусти скрипт заново"
    ok "npm $(npm -v)"
}

SOURCES_CLONED=0

fetch_sources() {
    # Скрипт запустили внутри уже склонированного репозитория
    if [ -f "./cli/ktw.js" ] && [ -d "./.git" ]; then
        INSTALL_DIR="$(pwd)"
        ok "исходники здесь: $INSTALL_DIR"
        return 0
    fi

    if [ -d "$INSTALL_DIR/.git" ] && [ -f "$INSTALL_DIR/cli/ktw.js" ]; then
        if spin_run "обновляю $INSTALL_DIR" sh -c "git -C \"$INSTALL_DIR\" fetch origin \"$REPO_BRANCH\" && git -C \"$INSTALL_DIR\" checkout -B \"$REPO_BRANCH\" \"origin/$REPO_BRANCH\" && git -C \"$INSTALL_DIR\" reset --hard \"origin/$REPO_BRANCH\""; then
            ok "обновлено до $(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null)"
            return 0
        fi
    fi

    # Очищаем перед клонированием, чтобы избежать ошибок 'destination path already exists'
    rm -rf "$INSTALL_DIR"
    mkdir -p "$(dirname "$INSTALL_DIR")"

    spin_run "качаю исходники в $INSTALL_DIR" \
        git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" \
        || die "не смог склонировать $REPO_URL (ветка $REPO_BRANCH)"

    [ -f "$INSTALL_DIR/cli/ktw.js" ] || die "исходники повреждены: $INSTALL_DIR/cli/ktw.js не найден"
    SOURCES_CLONED=1
    ok "скачано в $INSTALL_DIR"
}

# Записать значение в config.json, не потеряв остальные поля
write_config() {
    mkdir -p "$CONFIG_DIR"
    node -e '
        var fs = require("fs"), file = process.argv[1], key = process.argv[2], value = process.argv[3];
        var config = {};
        try { config = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
        config[key] = value;
        fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    ' "$CONFIG_DIR/config.json" "$1" "$2"
}

# Скачанный puppeteer'ом браузер реально лежит на диске?
# Проверять код возврата npm недостаточно: если пакет уже стоял или
# CDN недоступен, установка проходит успешно, а браузера нет.
browser_ready() {
    node -e '
        try {
            var fs = require("fs");
            var file = require("puppeteer").executablePath();
            process.exit(file && fs.existsSync(file) ? 0 : 1);
        } catch (e) {
            process.exit(1);
        }
    ' 2>/dev/null
}

find_system_chromium() {
    for _candidate in chromium chromium-browser google-chrome google-chrome-stable brave-browser; do
        if has "$_candidate"; then
            command -v "$_candidate"
            return 0
        fi
    done

    return 1
}

install_deps() {
    cd "$INSTALL_DIR"

    export PUPPETEER_SKIP_DOWNLOAD=true
    spin_run "ставлю пакеты Node" \
        npm install --omit=dev --no-audit --no-fund \
        || warn "npm install завершился с предупреждением"

    ok "пакеты установлены"

    # Проверяем, есть ли уже системный браузер (для Puppeteer-фоллбэка)
    _chromium=$(find_system_chromium 2>/dev/null || echo "")
    if [ -n "$_chromium" ]; then
        write_config chromiumPath "$_chromium"
        dim "найден системный браузер: $_chromium"
    fi
}

# Заполняется, если команду не получится вызвать по имени.
# Тогда финальный блок объясняет, что делать, вместо бодрого «Запускай: ktw».
PATH_PROBLEM=0
PATH_RC=""

link_binary() {
    mkdir -p "$BIN_DIR"
    chmod +x "$INSTALL_DIR/cli/ktw.js"
    ln -sf "$INSTALL_DIR/cli/ktw.js" "$BIN_DIR/ktw"
    ln -sf "$INSTALL_DIR/cli/ktw.js" "$BIN_DIR/ktw2"
    ok "команды: $BIN_DIR/ktw и $BIN_DIR/ktw2"

    # Если доступен root/sudo, линкуем в /usr/local/bin — тогда команда доступна в PATH мгновенно
    if [ "$(id -u)" = "0" ] || sudo -n true 2>/dev/null; then
        run_root ln -sf "$INSTALL_DIR/cli/ktw.js" /usr/local/bin/ktw 2>/dev/null || true
        run_root ln -sf "$INSTALL_DIR/cli/ktw.js" /usr/local/bin/ktw2 2>/dev/null || true
        ok "системные команды: /usr/local/bin/ktw и /usr/local/bin/ktw2"
        return 0
    fi

    case ":$PATH:" in
        *":$BIN_DIR:"*)
            return 0
            ;;
    esac

    warn "$BIN_DIR не в PATH"

    PATH_RC="$HOME/.profile"
    case "${SHELL:-}" in
        *zsh)  PATH_RC="$HOME/.zshrc" ;;
        *bash) PATH_RC="$HOME/.bashrc" ;;
    esac

    # В Debian-совместимых (Devuan, Loc OS, Ubuntu) ~/.profile добавляет
    # ~/.local/bin сам, но только если каталог существовал на момент входа.
    # Мы его создали только что, поэтому в текущей сессии его там нет.
    if [ "$BIN_DIR" = "$HOME/.local/bin" ] && grep -q '\.local/bin' "$HOME/.profile" 2>/dev/null; then
        PATH_PROBLEM=1
        dim "в ~/.profile каталог уже прописан — не хватает только перелогина"
        return 0
    fi

    # Без терминала молча править чужой конфиг нельзя
    if ! has_tty; then
        PATH_PROBLEM=1
        return 0
    fi

    _answer=$(ask "дописать PATH в $PATH_RC? [Y/n]")

    case "$_answer" in
        [Nn]*)
            PATH_PROBLEM=1
            ;;
        *)
            printf '\n# добавлено установщиком ktw\nexport PATH="$PATH:%s"\n' "$BIN_DIR" >> "$PATH_RC"
            ok "PATH дописан в $PATH_RC"
            PATH_PROBLEM=1
            ;;
    esac
}

# Проверка, что клиент реально стартует. Ловит неполное дерево (недокачанный
# или битый клон) сразу, а не при первом запуске непонятной ошибкой Node.
verify_install() {
    _out=$(node "$INSTALL_DIR/cli/ktw.js" --help 2>&1) && {
        ok "клиент запускается"
        return 0
    }

    bad "клиент не стартует"

    # Полезное — в начале вывода Node, стек внизу не нужен
    { printf '%s\n' "$_out" | grep -m1 -A3 '^Error' || printf '%s\n' "$_out" | head -n 4; } \
        | while IFS= read -r _line; do
            dim "  $_line"
        done

    say ""

    # Предлагать снести каталог можно только если мы сами его и склонировали:
    # при запуске из готового клона это был бы рабочий каталог пользователя
    if [ "$SOURCES_CLONED" = "1" ]; then
        dim "чаще всего помогает переустановка с нуля:"
        dim "  rm -rf $INSTALL_DIR && запусти этот скрипт заново"
    else
        dim "проверь, что дерево исходников полное:"
        dim "  git -C $INSTALL_DIR status && git -C $INSTALL_DIR pull"
    fi

    die "установка неполная"
}

setup_key() {
    if [ -n "${KINOPOISK_API_KEY:-}" ]; then
        ok "ключ взят из KINOPOISK_API_KEY"
        return 0
    fi

    if [ -f "$CONFIG_DIR/config.json" ] && grep -q kinopoiskApiKey "$CONFIG_DIR/config.json" 2>/dev/null; then
        ok "ключ уже сохранён в $CONFIG_DIR/config.json"
        return 0
    fi

    say ""
    dim "нужен бесплатный ключ Kinopoisk API Unofficial:"
    dim "  https://kinopoiskapiunofficial.tech"

    if ! has_tty; then
        warn "запусти ktw и впиши ключ в $CONFIG_DIR/config.json"
        return 0
    fi

    _key=$(ask "вставь ключ (или Enter, чтобы позже)")

    if [ -z "$_key" ]; then
        warn "без ключа поиск не заработает — впиши его потом в $CONFIG_DIR/config.json"
        return 0
    fi

    write_config kinopoiskApiKey "$_key"
    ok "ключ сохранён в $CONFIG_DIR/config.json"
}

# ---------- поехали ----------

banner
detect_pkg_mgr
detect_root_mode
ensure_root_ready

step "Зависимости"
require_tool git git yes
check_node
require_tool mpv mpv yes
require_tool chafa chafa no

step "Исходники"
fetch_sources

step "Пакеты Node"
install_deps

step "Команда ktw"
link_binary
verify_install

step "Ключ API"
setup_key

say ""

if [ "$PATH_PROBLEM" = "0" ]; then
    printf '  %sГотово.%s Запускай: %sktw%s\n' "$C_OK$C_BOLD" "$C_RESET" "$C_BOLD" "$C_RESET"
    dim "справка — ktw --help, обновление — запусти этот скрипт ещё раз"
    say ""
    exit 0
fi

# Команда установлена, но по имени пока не вызовется — объясняем ровно это,
# иначе выглядит так, будто установка не сработала
printf '  %sГотово, но в этой сессии команда ktw ещё не видна.%s\n' "$C_WARN$C_BOLD" "$C_RESET"
say ""
dim "прямо сейчас — выполни:"
printf '    %sexport PATH="$PATH:%s"%s\n' "$C_BOLD" "$BIN_DIR" "$C_RESET"
say ""
dim "навсегда — перелогинься, или добавь ту же строку в $PATH_RC"
dim "проверить не дожидаясь: $BIN_DIR/ktw --help"
say ""
