# CPU backend for Cloud Run: LLM inference goes to Groq (GROQ_API_KEY), so no Ollama or model weights.
# The GPU variant with Ollama and baked-in llama3.1:8b weights is backend/Dockerfile.
FROM python:3.13-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY data/ ./data/
COPY .cache/ ./.cache/

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn api:app --app-dir /app/src --host 0.0.0.0 --port ${PORT:-8000}"]
