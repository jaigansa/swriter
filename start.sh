#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

is_port_free() {
  if (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; then
    exec 3>&- 2>/dev/null
    return 1
  fi
  return 0
}

PORT="${PORT:-8080}"

if ! is_port_free "$PORT"; then
  echo "Port $PORT is already in use, trying the next free port..."
  found=""
  for i in 1 2 3 4 5; do
    cand=$((PORT + i))
    if is_port_free "$cand"; then
      found="$cand"
      break
    fi
  done
  if [ -n "$found" ]; then
    PORT="$found"
  else
    echo "Error: ports $PORT-$((PORT + 5)) are all in use. Set a different port, e.g.:" >&2
    echo "  PORT=9000 ./start.sh" >&2
    exit 1
  fi
fi

URL="http://localhost:${PORT}"

if command -v python3 >/dev/null 2>&1; then
  echo "Serving SWriter at ${URL}  (Ctrl+C to stop)"
  python3 -m http.server "${PORT}"
elif command -v python >/dev/null 2>&1; then
  echo "Serving SWriter at ${URL}  (Ctrl+C to stop)"
  python -m SimpleHTTPServer "${PORT}"
else
  echo "Error: Python is required to serve the app." >&2
  echo "Install python3 or serve this folder with any static file server." >&2
  exit 1
fi
