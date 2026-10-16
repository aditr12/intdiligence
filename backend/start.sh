#!/bin/sh
set -e

ollama serve &

# uvicorn must not accept audits before Ollama is listening
until curl -sf http://127.0.0.1:11434/api/version > /dev/null; do
  sleep 0.5
done

# Load the model into GPU memory now so the first audit doesn't pay for it
curl -sf http://127.0.0.1:11434/api/generate -d '{"model": "llama3.1:8b", "keep_alive": -1}' > /dev/null &

exec uvicorn api:app --app-dir /app/src --host 0.0.0.0 --port "${PORT:-8000}"
