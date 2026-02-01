# Hackathon Requirements → UI Coverage

This document maps each hackathon requirement to where it is demonstrated in the **frontend UI**. Backend implementation is in the backend repo; ensure observability and a quick guide are documented there (e.g. `/docs`, README).

---

## 3. Must-Have Agentic AI Capabilities

| Requirement | Where to see in UI | Data present? |
|-------------|--------------------|----------------|
| **3.1 RAG** – Retrieval before generation, responses reference context | Result → **Sources / Retrieved context (RAG)** (when backend sends); Live Agent Stream → Retrieval agent; Observability → **RAG** badge | Sources list when backend returns `sources` / `retrieved_context` / `documents` |
| **3.2 Chunking & overlap** | Backend (ingest); Semantic Memory list in Memory tab when backend returns indexed docs | Semantic Memory count in Data status strip |
| **3.3 Context management** | Conversation panel (**N messages**); Technical details → `conversation_history` | Data status: Conversation: N messages |
| **3.4 Memory types** – Working, Episodic, Semantic | **Memory** tab → Episodic (view/edit/delete), **Semantic** (list when backend returns) | Data status: Episodic N, Semantic N |
| **3.5 Memory persistence** – UI view/edit/delete | **Memory** tab → Episodic list; **Edit** / **Delete** per memory | Episodic count; list of memories |
| **3.6 Guardrails & safety** | Result → **Action** (ESCALATE/BLOCK); **Escalation / Guardrails** banner; Observability → **Guardrails** badge; Confidence % | Priority, Action, Confidence in Result |
| **3.7 Planning & delegation** | Result → **Execution plan** (when backend sends); Observability → **Planning** badge; Live stream → Planner agent | Plan section when backend returns `plan` / `execution_plan` |
| **3.8 Tool & function usage** – observable, live in UI | **Live Agent Stream** → each card shows **Tool:** input/output; Result → **Tool calls this run** | Tool calls count; list in Observability |
| **3.9 Observability & explainability** | Result → **Observability** (agents ran, outcome, step timing, events per agent, errors/warnings); **Monitoring** tab; **Export trace (JSON)** | Last run: N events, N tool calls; Export trace |

---

## 4. Agents & Their Roles

| Agent | Where to see |
|-------|----------------|
| Ingestion | Live stream (Ingest card); Pipeline strip; Flow diagram; **How agents work** |
| Planner / Orchestrator | Live stream; Execution plan in Result; Planning badge |
| Intent & Classification | Live stream; Result → Priority |
| Knowledge Retrieval (RAG) | Live stream; Result → Sources; RAG badge |
| Memory | Live stream; Memory tab (Episodic, Semantic); Memory badge |
| Reasoning / Correlation | Live stream; Reason card |
| Response Synthesis | Live stream; Result → Response |
| Guardrails & Policy | Live stream; Result → Action, Escalation/Guardrails banner; Guardrails badge |

---

## 5. Execution Model

| Item | Where to see |
|------|----------------|
| Serial / parallel / async | **How agents work** → Execution model note; Pipeline and flow diagram |

---

## 6. Sample Scenarios

| Scenario | Sample query button in UI |
|----------|---------------------------|
| Support Analyst (Payment failure EU) | **Support: Payment failure (EU)** |
| Support Agent Chat (Past error?) | **Support: Past error?** |
| Customer Self-Service (Dashboard) | **Self-service: Dashboard** |

---

## 8. Expected Hackathon Outcome

| Outcome | Where to see |
|---------|----------------|
| Clear agent boundaries | Pipeline, flow diagram, agent cards with role description |
| Live streaming of agent events | **Live Agent Stream**; pipeline strip; “What’s happening now” during processing |
| Long chats | Conversation panel (N messages); context sent with each request |
| Monitoring | **Monitoring** tab (events, memories, status, tool calls, guardrail outcome, backend status, last run observability) |
| Export / trace | **Export trace (JSON)** in Result and Monitoring |

---

## Backend: Observability & Quick Guide

- **Observability:** Backend should expose execution trace, tool call logs, and (if applicable) observability endpoints (e.g. `/observability/events`, `/observability/tool-calls` per OpenAPI). Frontend proxies `/api/*` to backend; ensure backend returns the fields the UI expects (e.g. `execution_trace`, `sources`, `plan`).
- **Quick guide:** Add a **QUICK_GUIDE.md** or section in the **backend README** that explains: how to run the backend, how ingest/chunking works, where agent code lives (per-agent files), and how observability is logged and exposed. The frontend “Requirements & quick guide” panel points users to this.
