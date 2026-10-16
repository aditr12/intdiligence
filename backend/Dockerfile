# Build from the project root: docker build -f backend/Dockerfile .
FROM python:3.13-slim

WORKDIR /app

# zstd is required by the Ollama installer to unpack its release archive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates zstd && \
    curl -fsSL https://ollama.com/install.sh | sh && \
    rm -rf /var/lib/apt/lists/*

ENV OLLAMA_MODELS=/models \
    OLLAMA_HOST=127.0.0.1:11434 \
    OLLAMA_KEEP_ALIVE=-1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake llama3.1:8b weights into the image
RUN ollama serve & \
    until curl -sf http://127.0.0.1:11434/api/version > /dev/null; do sleep 1; done && \
    ollama pull llama3.1:8b

COPY src/ ./src/
COPY data/ ./data/
COPY .cache/ ./.cache/
COPY backend/start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 8000

CMD ["./start.sh"]
