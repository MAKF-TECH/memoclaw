FROM node:22-slim AS frontend

WORKDIR /build
COPY webui/package*.json ./
RUN npm ci
COPY webui/ .
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copy built frontend into static serving directory
COPY --from=frontend /build/dist /app/src/webui/dist

EXPOSE 8420

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8420", "--workers", "1"]
