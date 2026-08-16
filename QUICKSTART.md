# Quick Start

Get the full AiChatBot stack running locally in ~3 minutes.

## Prerequisites

- Docker & Docker Compose
- Node.js v18+
- Python 3.12 (`uv` recommended)

## 1. Configure environment

All defaults live in the repo root `.env.example`. Copy and edit it:

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET, ENCRYPTION_KEY (32 chars), MONGO_URI,
# GOOGLE_CLIENT_ID, AI_API, and at least one LLM API key.
```

> `ENCRYPTION_KEY` is an AES-256-GCM key shared by **both** Backend and AiCalls — use the same value in both (the `.env` is loaded by both).

## 2. Run the AI infrastructure

```bash
docker compose -f docker-compose-utils.yaml up -d
```

## 3. Start the stack

One command from the repo root (Frontend + Backend + AiCalls concurrently):

```bash
npm run dev
```

Or per-service if you prefer:

```bash
npm run server   # Frontend + Backend
npm run ai       # AiCalls only
```

Or step into each folder:

```bash
cd Frontend && npm install && npm run dev
cd ../Backend && npm install && npm run dev
cd ../AiCalls && uv run main.py --active
```

## 4. Configure AI Providers

1. Open `http://localhost:5173`, sign in with Google.
2. As an admin, open **Admin → AI APIs**.
3. Add at least one provider and toggle **Enabled**.

> Until a provider is enabled, the chat shows **"AI APIs have not been configured yet."** and replies return a friendly `503` — no cryptic litellm errors.

## 5. Verify

- Frontend UI:            `http://localhost:5173`
- Config probe (auth):    `curl` of `GET /api/config-status` → `{ "configured": true, ... }`
- Admin provider list:    `Admin → AI APIs` page
