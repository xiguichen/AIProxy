# Copilot instructions for AIProxy

## Big picture
- This is a FastAPI service that exposes OpenAI-compatible HTTP endpoints and forwards work to browser/agent clients over WebSocket.
- Core flow:
  - HTTP POST /v1/chat/completions in [backend/main.py](backend/main.py) builds a `completion_request` and routes it to an available WS client via `connection_manager`.
  - WS clients connect to /ws and exchange JSON messages; responses are matched to `request_id` and returned to the HTTP caller.
- Connection state and request/response matching live in [backend/websocket_manager.py](backend/websocket_manager.py):
  - `ConnectionManager.active_connections` holds `ClientConnection` objects with status (IDLE/BUSY) and heartbeat timestamps.
  - `pending_requests` + `request_responses` + `asyncio.Event` implement request/response rendezvous.
  - Heartbeats are pushed every 25s; connections are cleaned if no heartbeat in 30s.

## Key APIs & message contracts
- WebSocket message `type` values handled in [backend/main.py](backend/main.py):
  - `heartbeat_response`, `completion_response`, `client_ready` (mark client idle).
  - Unknown types trigger an error message back to the client.
- Forwarded request shape (server ➜ client):
  - `{"type":"completion_request","request_id":"req_...","model":...,"messages":[...],"temperature":...,"max_tokens":...,"stream":...}`
- Client response shape (client ➜ server):
  - `{"type":"completion_response","request_id":"req_...","content":...,"finish_reason":...}`

## Project-specific patterns
- Concurrency: access to `active_connections` is guarded by `connection_lock`; request/response maps are guarded by `response_lock`.
- Client selection favors the most recently active idle client (sorted by last heartbeat).
- Health/stat endpoints use `connection_manager.get_connection_stats()`; do not bypass locks.

## Development workflow (inferred from code)
- Install dependencies from [backend/requirements.txt](backend/requirements.txt).
- Run the API with Uvicorn (see __main__ in [backend/main.py](backend/main.py)):
  - `python backend/main.py` (runs `uvicorn` with reload) or `uvicorn main:app --reload` from backend/.
- OpenAPI docs are served at `/docs` and `/redoc`.

## When editing
- Preserve OpenAI-compatible request/response shapes in `OpenAIRequest` and `OpenAIResponse` (Pydantic models in [backend/main.py](backend/main.py)).
- Keep WS routing logic in `websocket_endpoint` consistent with `ConnectionManager.handle_completion_response()`.
