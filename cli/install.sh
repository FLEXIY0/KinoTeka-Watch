#!/bin/sh
# Установка ktw — терминального клиента KinoTeka Watch.
#
#   curl -fsSL https://raw.githubusercontent.com/FLEXIY0/KinoTeka-Watch/main/cli/install.sh | sh
#
# Чистый POSIX sh: на Devuan и Debian /bin/sh — это dash, поэтому никаких
# bash-измов. Systemd не требуется, права root — только для установки пакетов.

set -eu

REPO_URL="${KTW_REPO:-https://github.com/FLEXIY0/KinoTeka-Watch.git}"
REPO_BRANCH="${KTW_BRANCH:-main}"
INSTALL_DIR="${KTW_HOME:-$HOME/.local/share/ktw}"
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

# Запуск команды от root: sudo, doas или su — что найдётся
run_root() {
    if [ "$(id -u)" = "0" ]; then
        sh -c "$*"
    elif has sudo; then
        sudo sh -c "$*"
    elif has doas; then
        doas sh -c "$*"
    elif has su; then
        say ""
        dim "нужен пароль root для: $*"
        su -c "$*"
    else
        return 1
    fi
}

install_pkg() {
    _pkg="$1"

    if [ -z "$PKG_MGR" ]; then
        warn "не понял, какой пакетный менеджер — поставь $_pkg сам"
        return 1
    fi

    if [ "$PKG_MGR" = "brew" ]; then
        brew install "$_pkg" >/dev/null 2>&1 && return 0 || return 1
    fi

    if [ "$PKG_MGR" = "apt-get" ] && [ "$PKG_UPDATED" = "0" ]; then
        run_root "apt-get update -qq" >/dev/null 2>&1 || true
        PKG_UPDATED=1
    fi

    if run_root "$PKG_INSTALL $_pkg" >/dev/null 2>&1; then
        return 0
    fi

    return 1
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

    printf '  %s…%s %s не найден, ставлю через %s\n' "$C_DIM" "$C_RESET" "$_cmd" "${PKG_MGR:-?}"

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
        printf '  %s…%s node не найден, ставлю\n' "$C_DIM" "$C_RESET"

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

    has npm || install_pkg npm >/dev/null 2>&1 || true
    has npm || die "нужен npm. Поставь пакет npm и запусти скрипт заново"
    ok "npm $(npm -v)"
}

fetch_sources() {
    # Скрипт запустили внутри уже склонированного репозитория
    if [ -f "./cli/ktw.js" ] && [ -d "./.git" ]; then
        INSTALL_DIR="$(pwd)"
        ok "исходники здесь: $INSTALL_DIR"
        return 0
    fi

    if [ -d "$INSTALL_DIR/.git" ]; then
        printf '  %s…%s обновляю %s\n' "$C_DIM" "$C_RESET" "$INSTALL_DIR"
        git -C "$INSTALL_DIR" fetch --quiet origin "$REPO_BRANCH" 2>/dev/null || true
        git -C "$INSTALL_DIR" checkout --quiet "$REPO_BRANCH" 2>/dev/null || true
        git -C "$INSTALL_DIR" reset --hard --quiet "origin/$REPO_BRANCH" 2>/dev/null || true
        ok "обновлено"
        return 0
    fi

    printf '  %s…%s качаю в %s\n' "$C_DIM" "$C_RESET" "$INSTALL_DIR"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --quiet --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" \
        || die "не смог склонировать $REPO_URL"
    ok "скачано"
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

    printf '  %s…%s ставлю puppeteer (тянет свой Chromium, это долго)\n' "$C_DIM" "$C_RESET"
    npm install --omit=dev --no-audit --no-fund --loglevel=error >/dev/null 2>&1 \
        || warn "npm install ругался — проверю, что получилось"

    [ -d "$INSTALL_DIR/node_modules/puppeteer" ] || die "puppeteer не установился, без него не извлечь поток"

    if browser_ready; then
        ok "зависимости на месте"
        return 0
    fi

    warn "Chromium не скачался — пробую докачать"
    npx --yes puppeteer browsers install chrome >/dev/null 2>&1 || true

    if browser_ready; then
        ok "Chromium докачан"
        return 0
    fi

    warn "не вышло — ищу системный Chromium"
    _chromium=$(find_system_chromium) || {
        install_pkg chromium || true
        _chromium=$(find_system_chromium) || _chromium=""
    }

    [ -n "$_chromium" ] || die "нет ни своего, ни системного Chromium — извлекать поток будет нечем"

    write_config chromiumPath "$_chromium"
    ok "использую системный Chromium: $_chromium"
}

link_binary() {
    mkdir -p "$BIN_DIR"
    chmod +x "$INSTALL_DIR/cli/ktw.js"
    ln -sf "$INSTALL_DIR/cli/ktw.js" "$BIN_DIR/ktw"
    ok "ktw → $BIN_DIR/ktw"

    case ":$PATH:" in
        *":$BIN_DIR:"*)
            return 0
            ;;
    esac

    warn "$BIN_DIR не в PATH"

    _rc="$HOME/.profile"
    case "${SHELL:-}" in
        *zsh)  _rc="$HOME/.zshrc" ;;
        *bash) _rc="$HOME/.bashrc" ;;
    esac

    # Без терминала молча править чужой конфиг нельзя
    if ! has_tty; then
        dim "добавь в $_rc: export PATH=\"\$PATH:$BIN_DIR\""
        return 0
    fi

    _answer=$(ask "дописать PATH в $_rc? [Y/n]")

    case "$_answer" in
        [Nn]*)
            dim "тогда добавь сам: export PATH=\"\$PATH:$BIN_DIR\""
            ;;
        *)
            printf '\n# добавлено установщиком ktw\nexport PATH="$PATH:%s"\n' "$BIN_DIR" >> "$_rc"
            ok "PATH дописан в $_rc — перелогинься или выполни: . $_rc"
            ;;
    esac
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

step "Ключ API"
setup_key

say ""
printf '  %sГотово.%s Запускай: %sktw%s\n' "$C_OK$C_BOLD" "$C_RESET" "$C_BOLD" "$C_RESET"
dim "справка — ktw --help, обновление — запусти этот скрипт ещё раз"
say ""
