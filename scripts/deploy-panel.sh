#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -d .git ]; then
  git pull --ff-only
fi

export VITE_CHAT_API_URL="${VITE_CHAT_API_URL:-https://chat-api.example.com}"
export VITE_USE_MOCK="${VITE_USE_MOCK:-false}"

npm ci
npm run build
