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
| **Local FE → Deployed BE** | `http://15.206.213.150:8000` |
| **Production** (both deployed) | `http://15.206.213.150:8000` |

- `.env.local` – used for `npm run dev` (local development)
- `.env.production` – used for `npm run build` (deployment)

**Testing from local against deployed backend:** Set `NEXT_PUBLIC_API_BASE_URL=http://15.206.213.150:8000` in `.env.local` and run `npm run dev`. Restart the dev server after changing env vars.

## Features

- Live agent event streaming
- Memory management UI
- System monitoring
- Real-time agent interaction visualization

# test
