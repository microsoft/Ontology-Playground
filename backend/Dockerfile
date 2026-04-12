FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

ARG PIP_INDEX_URL=
ARG PIP_EXTRA_INDEX_URL=
ARG PIP_TRUSTED_HOST=

ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST}

COPY backend/pyproject.toml backend/README.md /app/backend/
COPY backend/app /app/backend/app
COPY vendor/oh-graph-rag /app/vendor/oh-graph-rag

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -e /app/backend

WORKDIR /app/backend

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
