#!/bin/sh
# Установка ktw — терминального клиента KinoTeka Watch.
#
#   curl -fsSL https://raw.githubusercontent.com/FLEXIY0/KinoTeka-Watch/main/cli/install.sh | sh
#
# Рантайм выбирается через KTW_RUNTIME: bun (по умолчанию), node или auto.
# Код одинаково работает на обоих — единственное требование к Node это версия
# 18 или новее, где появился глобальный fetch. На слабых машинах Node часто уже
# стоит, и тогда качать 90 МБ бинарника Bun незачем:
#
#   curl -fsSL …/cli/install.sh | KTW_RUNTIME=node sh
#
# Чистый POSIX sh: на Devuan, Loc OS, antiX и Alpine /bin/sh — это dash или
# busybox ash, поэтому никаких bash-измов. Systemd не требуется нигде: ни один
# шаг не трогает systemctl, юниты и logind — установщик одинаково работает на
# sysvinit, OpenRC, runit и systemd. Root нужен только для системных пакетов
# (git, mpv), и то через sudo/doas/su — что найдётся.

set -eu

REPO_URL="${KTW_REPO:-https://github.com/FLEXIY0/KinoTeka-Watch.git}"
REPO_BRANCH="${KTW_BRANCH:-main}"
INSTALL_DIR="${KTW_HOME:-$HOME/.local/share/ktw2}"
BIN_DIR="${KTW_BIN:-$HOME/.local/bin}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ktw"

# bun | node | auto (auto берёт то, что уже стоит в системе)
RUNTIME_WANTED="${KTW_RUNTIME:-bun}"

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

# Создать каталог и убедиться, что он действительно каталог.
#
# Раньше тут был голый `mkdir -p`, и на выходе можно было получить
# «cannot create ~/.local/bin/ktw: Directory nonexistent»: если по пути лежал
# файл или битый симлинк, mkdir -p возвращал ошибку, но скрипт всё равно
# доходил до записи. Теперь путь проверяется по факту, а мусор убирается.
ensure_dir() {
    [ -d "$1" ] && return 0

    # Симлинк в никуда или файл на месте каталога — сносим, иначе mkdir не сможет
    if [ -e "$1" ] || [ -L "$1" ]; then
        rm -f "$1" 2>/dev/null || true
    fi

    mkdir -p "$1" 2>/dev/null || true
    [ -d "$1" ]
}

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
# Долгие шаги раньше молчали, и было не отличить работу от зависания. Теперь
# команда уходит в фон, её вывод — в лог, а на экране остаётся одна строка:
# спиннер, секундомер и либо объём скачанного, либо последняя строка вывода.

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

# Фоновая команда обязана получить stdin из /dev/null. Скрипт запускают как
# `curl … | sh`, то есть stdin оболочки — это ещё не дочитанный текст самого
# скрипта; дочерний процесс, дёрнувший read, откусит от него кусок, и дальше
# оболочка выполнит обрезанный текст. Так и терялся `mkdir -p "$BIN_DIR"`.
spin_run() {
    _label="$1"
    shift

    _log="${TMPDIR:-/tmp}/ktw-install.$$.log"
    : > "$_log"
    SPIN_BASE=$(spin_watch_kb)

    # Без терминала анимация бессмысленна — просто ждём
    if [ ! -t 1 ]; then
        printf '  %s…%s %s\n' "$C_DIM" "$C_RESET" "$_label"
        "$@" > "$_log" 2>&1 < /dev/null
        return $?
    fi

    "$@" > "$_log" 2>&1 < /dev/null &
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

# ---------- загрузка файлов ----------

# curl есть не везде (минимальный Devuan/Alpine ставится с wget)
fetch_to() {
    _url="$1"
    _dest="$2"

    if has curl; then
        curl -fsSL --retry 3 -o "$_dest" "$_url" < /dev/null
    elif has wget; then
        wget -q -O "$_dest" "$_url" < /dev/null
    else
        return 1
    fi
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
    elif has emerge; then PKG_MGR="emerge"; PKG_INSTALL="emerge --quiet"
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

# Запуск команды от root: sudo, doas или su — что найдётся.
# su читает пароль с управляющего терминала, поэтому ему отдаём /dev/tty,
# а не наш stdin (в котором лежит хвост самого скрипта).
run_root() {
    case "$ROOT_MODE" in
        root) sh -c "$*" ;;
        sudo) sudo sh -c "$*" ;;
        doas) doas sh -c "$*" ;;
        su)   if has_tty; then su -c "$*" < /dev/tty; else su -c "$*" < /dev/null; fi ;;
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
        run_root_step "обновляю список пакетов" "DEBIAN_FRONTEND=noninteractive apt-get update -qq" || true
        PKG_UPDATED=1
    fi

    run_root_step "ставлю $_pkg через $PKG_MGR" "DEBIAN_FRONTEND=noninteractive $PKG_INSTALL $_pkg"
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

# ---------- рантайм ----------
#
# Официальный `curl … bun.sh/install | bash` требует bash и unzip, а на голом
# sysvinit-минимуме их может не быть, поэтому основной путь — прямая распаковка
# релизного архива с GitHub, а bun.sh идёт запасным вариантом.
#
# Node ставится так же аккуратно: сначала уже установленный, потом пакет
# дистрибутива, и только потом официальный tar.gz с nodejs.org в ~/.local/lib.

BUN_BIN=""
NODE_BIN=""

# Что в итоге выбрано: bun|node, путь к бинарю и чем ставить пакеты
RUNTIME_KIND=""
RUNTIME_BIN=""

# Имя релизного архива под текущую машину
bun_asset() {
    _os=$(uname -s 2>/dev/null || echo Linux)
    _arch=$(uname -m 2>/dev/null || echo x86_64)

    case "$_arch" in
        x86_64|amd64)  _arch="x64" ;;
        aarch64|arm64) _arch="aarch64" ;;
        *) return 1 ;;
    esac

    case "$_os" in
        Darwin)
            printf 'bun-darwin-%s' "$_arch"
            return 0
            ;;
        Linux) ;;
        *) return 1 ;;
    esac

    # Alpine и прочий musl — отдельная сборка
    _libc=""
    if [ -n "$(ls /lib/ld-musl-* 2>/dev/null)" ] || (ldd --version 2>&1 | grep -qi musl); then
        _libc="-musl"
    fi

    # Без AVX2 обычная сборка падает с SIGILL — для старых CPU есть baseline
    _base=""
    if [ "$_arch" = "x64" ] && ! grep -qw avx2 /proc/cpuinfo 2>/dev/null; then
        _base="-baseline"
    fi

    printf 'bun-linux-%s%s%s' "$_arch" "$_libc" "$_base"
}

# Распаковка zip чем угодно: unzip, bsdtar или python3
unzip_to() {
    _zip="$1"
    _dir="$2"

    if has unzip; then
        unzip -q -o "$_zip" -d "$_dir" < /dev/null && return 0
    fi

    if has bsdtar; then
        (cd "$_dir" && bsdtar -xf "$_zip") < /dev/null && return 0
    fi

    if has python3; then
        python3 -c 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' \
            "$_zip" "$_dir" < /dev/null && return 0
    fi

    return 1
}

# Скачать релиз с GitHub и положить бинарь в ~/.bun/bin/bun
bun_from_release() {
    _asset=$(bun_asset) || return 1
    _tmp="${TMPDIR:-/tmp}/ktw-bun.$$"

    ensure_dir "$_tmp" || return 1

    if ! fetch_to "https://github.com/oven-sh/bun/releases/latest/download/$_asset.zip" "$_tmp/bun.zip"; then
        rm -rf "$_tmp"
        return 1
    fi

    # unzip/bsdtar/python3 может не быть на минимальной системе — доставим
    if ! has unzip && ! has bsdtar && ! has python3; then
        install_pkg unzip >/dev/null 2>&1 || true
    fi

    if ! unzip_to "$_tmp/bun.zip" "$_tmp"; then
        rm -rf "$_tmp"
        return 1
    fi

    _found=$(find "$_tmp" -name bun -type f 2>/dev/null | head -n 1)
    [ -n "$_found" ] || { rm -rf "$_tmp"; return 1; }

    ensure_dir "$HOME/.bun/bin" || { rm -rf "$_tmp"; return 1; }
    cp -f "$_found" "$HOME/.bun/bin/bun"
    chmod +x "$HOME/.bun/bin/bun"
    rm -rf "$_tmp"

    "$HOME/.bun/bin/bun" --version >/dev/null 2>&1
}

# Запасной путь — официальный установщик (нужен bash и unzip)
bun_from_official() {
    has bash || return 1
    has unzip || install_pkg unzip >/dev/null 2>&1 || true
    has curl || return 1

    sh -c "curl -fsSL https://bun.sh/install | bash" < /dev/null >/dev/null 2>&1
    [ -x "$HOME/.bun/bin/bun" ] && "$HOME/.bun/bin/bun" --version >/dev/null 2>&1
}

use_bun() {
    BUN_BIN="$1"
    RUNTIME_KIND="bun"
    RUNTIME_BIN="$1"
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    PATH="$(dirname "$BUN_BIN"):$PATH"
    export PATH
}

ensure_bun() {
    # Уже в PATH
    if has bun; then
        use_bun "$(command -v bun)"
        ok "bun $(bun --version 2>/dev/null)"
        return 0
    fi

    # Ставился раньше, но PATH не подхватил
    for _candidate in "$HOME/.bun/bin/bun" /usr/local/bin/bun /usr/bin/bun /opt/bun/bin/bun; do
        if [ -x "$_candidate" ]; then
            use_bun "$_candidate"
            ok "bun $(bun --version 2>/dev/null) ($_candidate)"
            return 0
        fi
    done

    say ""
    dim "рантайм — Bun, ставлю в ~/.bun (без root, без systemd)"

    if spin_run "качаю Bun" bun_from_release && [ -x "$HOME/.bun/bin/bun" ]; then
        use_bun "$HOME/.bun/bin/bun"
        ok "bun $(bun --version 2>/dev/null) установлен в ~/.bun/bin/bun"
        return 0
    fi

    if spin_run "ставлю Bun официальным скриптом" bun_from_official && [ -x "$HOME/.bun/bin/bun" ]; then
        use_bun "$HOME/.bun/bin/bun"
        ok "bun $(bun --version 2>/dev/null) установлен в ~/.bun/bin/bun"
        return 0
    fi

    # Последняя попытка — пакет из репозитория дистрибутива (есть в Arch, Void)
    install_pkg bun >/dev/null 2>&1 || true
    if has bun; then
        use_bun "$(command -v bun)"
        ok "bun $(bun --version 2>/dev/null) из пакетов"
        return 0
    fi

    return 1
}

# ---------- Node ----------

# Нужен Node 18+: в нём появился глобальный fetch, на котором держится вся
# работа с балансерами. Более старый Node формально запустится, но упадёт на
# первом же запросе, поэтому такой считаем непригодным.
node_is_new_enough() {
    _node="$1"
    [ -x "$_node" ] || command -v "$_node" >/dev/null 2>&1 || return 1

    _ver=$("$_node" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null) || return 1
    [ -n "$_ver" ] || return 1
    [ "$_ver" -ge 18 ] 2>/dev/null
}

use_node() {
    NODE_BIN="$1"
    RUNTIME_KIND="node"
    RUNTIME_BIN="$1"
    PATH="$(dirname "$1"):$PATH"
    export PATH
}

# Официальные сборки nodejs.org собраны под glibc, на musl они не пойдут
node_asset_arch() {
    case "$(uname -m 2>/dev/null || echo x86_64)" in
        x86_64|amd64)  printf 'x64' ;;
        aarch64|arm64) printf 'arm64' ;;
        armv7l|armv7)  printf 'armv7l' ;;
        ppc64le)       printf 'ppc64le' ;;
        *)             return 1 ;;
    esac
}

# Имя архива берём из SHASUMS256.txt: так не нужно угадывать точную версию
node_from_release() {
    node_is_musl && return 1

    _arch=$(node_asset_arch) || return 1
    _base="https://nodejs.org/dist/latest-v22.x"
    _tmp="${TMPDIR:-/tmp}/ktw-node.$$"

    rm -rf "$_tmp"
    ensure_dir "$_tmp" || return 1

    if ! fetch_to "$_base/SHASUMS256.txt" "$_tmp/sums.txt"; then
        rm -rf "$_tmp"
        return 1
    fi

    _file=$(sed -n "s/.*  \(node-v[0-9.]*-linux-$_arch\.tar\.gz\)$/\1/p" "$_tmp/sums.txt" | head -n 1)

    if [ -z "$_file" ]; then
        rm -rf "$_tmp"
        return 1
    fi

    if ! fetch_to "$_base/$_file" "$_tmp/node.tar.gz"; then
        rm -rf "$_tmp"
        return 1
    fi

    if ! tar -xzf "$_tmp/node.tar.gz" -C "$_tmp" 2>/dev/null; then
        rm -rf "$_tmp"
        return 1
    fi

    _root=$(find "$_tmp" -maxdepth 1 -type d -name 'node-v*' 2>/dev/null | head -n 1)

    if [ -z "$_root" ] || [ ! -x "$_root/bin/node" ]; then
        rm -rf "$_tmp"
        return 1
    fi

    ensure_dir "$HOME/.local/lib" || { rm -rf "$_tmp"; return 1; }
    rm -rf "$HOME/.local/lib/node"
    mv "$_root" "$HOME/.local/lib/node" || { rm -rf "$_tmp"; return 1; }
    rm -rf "$_tmp"

    node_is_new_enough "$HOME/.local/lib/node/bin/node"
}

node_is_musl() {
    # ldd на musl печатает «musl», на glibc — «GNU libc»
    (ldd --version 2>&1 || true) | grep -qi musl
}

ensure_node() {
    if has node && node_is_new_enough node; then
        use_node "$(command -v node)"
        ok "node $(node --version 2>/dev/null)"
        return 0
    fi

    for _candidate in "$HOME/.local/lib/node/bin/node" /usr/local/bin/node /usr/bin/node /opt/node/bin/node; do
        if [ -x "$_candidate" ] && node_is_new_enough "$_candidate"; then
            use_node "$_candidate"
            ok "node $("$_candidate" --version 2>/dev/null) ($_candidate)"
            return 0
        fi
    done

    say ""
    dim "рантайм — Node.js 18+"

    # Пакет дистрибутива: на слабых машинах это самый дешёвый путь
    install_pkg nodejs >/dev/null 2>&1 || true
    install_pkg npm >/dev/null 2>&1 || true

    if has node && node_is_new_enough node; then
        use_node "$(command -v node)"
        ok "node $(node --version 2>/dev/null) из пакетов"
        return 0
    fi

    if has node; then
        dim "в системе Node $(node --version 2>/dev/null) — слишком старый, нужен 18+"
    fi

    if spin_run "качаю Node с nodejs.org" node_from_release; then
        use_node "$HOME/.local/lib/node/bin/node"
        ok "node $("$HOME/.local/lib/node/bin/node" --version 2>/dev/null) установлен в ~/.local/lib/node"
        return 0
    fi

    return 1
}

# ---------- выбор рантайма ----------

ensure_runtime() {
    case "$RUNTIME_WANTED" in
        node)
            ensure_node && return 0
            die "не смог поставить Node 18+. Поставь пакетом (apt install nodejs) и запусти снова"
            ;;
        auto)
            # Берём то, что уже стоит, и ничего не качаем зря
            if has bun; then
                use_bun "$(command -v bun)"
                ok "bun $(bun --version 2>/dev/null)"
                return 0
            fi

            if has node && node_is_new_enough node; then
                use_node "$(command -v node)"
                ok "node $(node --version 2>/dev/null)"
                return 0
            fi
            ;;
    esac

    ensure_bun && return 0

    # Bun не встал — это не повод сдаваться: код одинаково работает на Node
    warn "Bun поставить не вышло, пробую Node"
    ensure_node && return 0

    say ""
    dim "не встал ни один рантайм. Поставь любой и запусти установщик снова:"
    dim "  curl -fsSL https://bun.sh/install | bash"
    dim "  или пакетом: $PKG_INSTALL nodejs"
    dim "архитектура: $(uname -m 2>/dev/null || echo '?')"
    die "без Bun или Node 18+ ktw не запустится"
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
    ensure_dir "$(dirname "$INSTALL_DIR")" \
        || die "не могу создать $(dirname "$INSTALL_DIR") — проверь права на \$HOME"

    spin_run "качаю исходники в $INSTALL_DIR" \
        git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" \
        || die "не смог склонировать $REPO_URL (ветка $REPO_BRANCH)"

    [ -f "$INSTALL_DIR/cli/ktw.js" ] || die "исходники повреждены: $INSTALL_DIR/cli/ktw.js не найден"
    SOURCES_CLONED=1
    ok "скачано в $INSTALL_DIR"
}

# Записать значение в config.json, не потеряв остальные поля
write_config() {
    ensure_dir "$CONFIG_DIR" || return 1
    "$RUNTIME_BIN" -e '
        var fs = require("fs"), file = process.argv[1], key = process.argv[2], value = process.argv[3];
        var config = {};
        try { config = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
        config[key] = value;
        fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    ' "$CONFIG_DIR/config.json" "$1" "$2" < /dev/null
}

install_deps() {
    cd "$INSTALL_DIR"

    # Браузер не нужен: потоки берутся прямым парсингом, Chromium из
    # зависимостей убран. Переменные оставлены на случай старого lock-файла.
    export PUPPETEER_SKIP_DOWNLOAD=true
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

    if [ "$RUNTIME_KIND" = "node" ]; then
        if has npm; then
            spin_run "ставлю пакеты через npm" npm install --omit=dev --no-audit --no-fund --silent \
                || warn "npm install завершился с предупреждением"
        else
            warn "npm не найден — пакеты не поставлены"
        fi
    else
        spin_run "ставлю пакеты через bun" bun install --production --no-progress \
            || warn "bun install завершился с предупреждением"
    fi

    [ -d "$INSTALL_DIR/node_modules" ] || die "зависимости не поставились: нет $INSTALL_DIR/node_modules"
    ok "пакеты установлены ($RUNTIME_KIND)"
}

# Заполняется, если команду не получится вызвать по имени.
# Тогда финальный блок объясняет, что делать, вместо бодрого «Запускай: ktw».
PATH_PROBLEM=0
PATH_RC=""

# Лаунчер: ищет bun там, где мы его оставили, потом в PATH, потом по типовым
# путям. Node.js не упоминается — его тут просто нет.
write_launcher() {
    _dest="$1"
    _tmp="$_dest.tmp.$$"

    # Сначала пробуем рантайм, которым ставили, потом второй: код работает на
    # обоих, и переустановленный Node не должен ломать команду, стоявшую на Bun.
    cat > "$_tmp" << EOF
#!/bin/sh
# ktw — KinoTeka Watch в терминале. Рантайм при установке: $RUNTIME_KIND.
KTW_DIR="$INSTALL_DIR"
KTW_RUNTIME_BIN="$RUNTIME_BIN"

[ -n "\$KTW_RUNTIME_BIN" ] && [ -x "\$KTW_RUNTIME_BIN" ] && exec "\$KTW_RUNTIME_BIN" "\$KTW_DIR/cli/ktw.js" "\$@"

for _rt in "\$HOME/.bun/bin/bun" /usr/local/bin/bun /usr/bin/bun /opt/bun/bin/bun \\
           "\$HOME/.local/lib/node/bin/node" /usr/local/bin/node /usr/bin/node /opt/node/bin/node; do
    [ -x "\$_rt" ] && exec "\$_rt" "\$KTW_DIR/cli/ktw.js" "\$@"
done

for _rt in bun node; do
    command -v "\$_rt" >/dev/null 2>&1 && exec "\$_rt" "\$KTW_DIR/cli/ktw.js" "\$@"
done

echo "ktw: не найден ни bun, ни node. Поставь любой:" >&2
echo "  curl -fsSL https://bun.sh/install | bash" >&2
echo "  или: apt install nodejs   (нужен Node 18+)" >&2
exit 1
EOF

    chmod +x "$_tmp"
    mv -f "$_tmp" "$_dest"
}

link_binary() {
    chmod +x "$INSTALL_DIR/cli/ktw.js"

    # Каталог для команд: сначала выбранный, потом ~/bin, потом /usr/local/bin.
    # Без этого установка падала на «Directory nonexistent», если ~/.local/bin
    # не создался (битый симлинк, файл на его месте, урезанные права).
    if ! ensure_dir "$BIN_DIR"; then
        warn "не смог создать $BIN_DIR"

        if ensure_dir "$HOME/bin"; then
            BIN_DIR="$HOME/bin"
            dim "ставлю команду в $BIN_DIR"
        elif [ "$ROOT_MODE" != "none" ] && run_root "mkdir -p /usr/local/bin" 2>/dev/null; then
            BIN_DIR="/usr/local/bin"
            dim "ставлю команду в $BIN_DIR"
        else
            die "некуда положить команду ktw. Задай каталог: KTW_BIN=~/мой/bin"
        fi
    fi

    write_launcher "$BIN_DIR/ktw" || die "не смог записать $BIN_DIR/ktw"
    cp -f "$BIN_DIR/ktw" "$BIN_DIR/ktw2"
    ok "команды: $BIN_DIR/ktw и $BIN_DIR/ktw2"

    # Если доступен root/sudo, кладём копию в /usr/local/bin — тогда команда
    # доступна в PATH мгновенно, без перелогина
    if [ "$BIN_DIR" != "/usr/local/bin" ] && { [ "$(id -u)" = "0" ] || sudo -n true 2>/dev/null; }; then
        if run_root "cp -f '$BIN_DIR/ktw' /usr/local/bin/ktw && cp -f '$BIN_DIR/ktw' /usr/local/bin/ktw2" 2>/dev/null; then
            ok "системные команды: /usr/local/bin/ktw и /usr/local/bin/ktw2"
            return 0
        fi
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
# или битый клон) сразу, а не при первом запуске непонятной ошибкой.
verify_install() {
    _out=$("$RUNTIME_BIN" "$INSTALL_DIR/cli/ktw.js" --help 2>&1 < /dev/null) && {
        ok "клиент запускается"
        return 0
    }

    bad "клиент не стартует"

    # Полезное — в начале вывода, стек внизу не нужен
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
ensure_runtime
require_tool mpv mpv yes
require_tool chafa chafa no

step "Исходники"
fetch_sources

step "Зависимости проекта"
install_deps

step "Команда ktw"
link_binary
verify_install

step "Ключ API"
setup_key

# Доктор проверяет всё, что нужно для просмотра, и печатает только проблемы.
# Когда всё на месте — молчит, чтобы не превращать успешную установку в стену текста.
step "Проверка"
_doctor=$("$BIN_DIR/ktw" --doctor-brief 2>/dev/null || true)

if [ -n "$_doctor" ]; then
    printf '%s\n' "$_doctor"
    say ""
    dim "полный разбор — ktw --doctor"
else
    ok "всё на месте"
fi

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
