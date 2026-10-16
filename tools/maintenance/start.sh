#!/usr/bin/env bash
set -euo pipefail
umask 077
base=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
venv="$HOME/.local/share/jiuchen-maintenance/venv"
if [[ ! -x "$venv/bin/python" ]]; then
  python3 -m venv "$venv" || {
    echo 'WSL 缺少 venv。请在本 WSL 执行 sudo apt-get install python3-venv 后重试。' >&2
    exit 1
  }
fi
if ! "$venv/bin/python" -c 'import cryptography' >/dev/null 2>&1; then
  "$venv/bin/python" -m pip install --disable-pip-version-check -r "$base/requirements.txt"
fi
exec "$venv/bin/python" "$base/maintain.py" "$@"
