# Agent System Frontend

Frontend for the Collaborative Agent System with live streaming and memory management.

## Setup

```bash
npm install
npm run dev
```

The frontend will run on http://15.206.213.150:3000

## Environment Configuration

Copy `.env.example` to `.env.local` and set your backend URL:

| Scenario | `NEXT_PUBLIC_API_BASE_URL` |
|----------|----------------------------|
| **Local dev** (FE + BE on localhost) | `http://localhost:8000` |
| **Local FE → Deployed BE** | `http://15.206.213.150` |
| **Production** (both deployed) | `http://15.206.213.150` |

Backend runs on **port 80** (no port in URL). API docs: [http://15.206.213.150/docs](http://15.206.213.150/docs).

- `.env.local` – used for `npm run dev` (local development)
- `.env.production` – used for `npm run build` and `next start` (deployment)

**Testing from local against deployed backend:** Set `NEXT_PUBLIC_API_BASE_URL=http://15.206.213.150` in `.env.local` and run `npm run dev`. Restart the dev server after changing env vars.

### Deployment (UI calling BE)

The frontend calls the backend **via its own API routes** (e.g. `/api/health`, `/api/ticket`). Those routes use `NEXT_PUBLIC_API_BASE_URL` at **runtime**. If this is not set where the app runs, it falls back to `http://localhost:8000` and requests fail.

- **Docker:** The Dockerfile sets `ENV NEXT_PUBLIC_API_BASE_URL=http://15.206.213.150` by default. Override with `-e NEXT_PUBLIC_API_BASE_URL=<your-backend-url>` if needed.
- **Bare Node (`npm run start`):** Put `NEXT_PUBLIC_API_BASE_URL=http://15.206.213.150` in `.env.production` in the app directory, or set it in the process (e.g. `NEXT_PUBLIC_API_BASE_URL=http://15.206.213.150 npm run start` or in your process manager).

After redeploying, check `GET http://<frontend-host>:3000/api/health`; it should return `ok: true` and `backend: "http://15.206.213.150/health"`.

### Verifying backend connectivity

1. **Backend up:** Open [http://15.206.213.150/docs](http://15.206.213.150/docs) in a browser (or `curl http://15.206.213.150/health`).
2. **FE can reach backend:** With the frontend running, call the health proxy:  
   `GET http://<frontend-host>:3000/api/health`  
   - If `ok: true` and `backend: "http://15.206.213.150/health"`, the frontend server can reach the backend.
   - If `ok: false` or 502, check `NEXT_PUBLIC_API_BASE_URL` is set where the app runs (e.g. in the process that runs `next start`, or in `.env.production`).

## Features

- Live agent event streaming
- Memory management UI (Episodic + Semantic)
- System monitoring
- Real-time agent interaction visualization
- Data status strip (conversation, episodic, semantic, last run, backend)
- Requirements & quick guide panel (where to see each hackathon requirement)

## Requirements coverage (UI)

See **[REQUIREMENTS_COVERAGE.md](./REQUIREMENTS_COVERAGE.md)** for a mapping of hackathon requirements to where they are demonstrated in this UI.

## Backend: observability & quick guide

- **Observability:** Ensure the backend returns fields the UI uses (e.g. `execution_trace`, `sources`, `retrieved_context`, `plan`, `action`, `confidence`). API docs: [http://15.206.213.150/docs](http://15.206.213.150/docs).
- **Quick guide:** Add a **QUICK_GUIDE.md** (or section in the backend README) that describes: how to run the backend, ingest/chunking, where each agent’s code lives, and how observability is logged and exposed. The frontend “Requirements & quick guide” panel references this.

# test
