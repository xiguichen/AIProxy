# Copilot instructions for AIProxy

## Big picture
- This is a FastAPI service that exposes OpenAI-compatible HTTP endpoints and forwards work to browser/agent clients over WebSocket.
- **Architecture**: Two-tier system
  - **Backend** (FastAPI): HTTP server accepting OpenAI API requests, forwarding to WebSocket clients
  - **Frontend** (Tampermonkey): Browser userscript clients that inject into AI chat platforms (ChatGPT, Claude, Yuanbao, etc.)
- Core flow:
  - HTTP POST /v1/chat/completions in [backend/main.py](backend/main.py) builds a `completion_request` and routes it to an available WS client via `connection_manager`.
  - Browser clients (running [js/main.js](js/main.js)) connect to /ws, receive requests, automate AI chat UIs, and return responses.
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

## Frontend client architecture (js/)
- **Production file**: [js/main.js](js/main.js) - Tampermonkey userscript deployed to browsers (DO NOT edit directly)
- **Source modules**: [js/src/modules/](js/src/modules/) - Modular ES6 code for development
  - [config.js](js/src/modules/config.js) - Site-specific selectors (WEBSITE_SELECTORS), global CONFIG, getCurrentSiteConfig()
  - [utils.js](js/src/modules/utils.js) - Helper functions (delay, findElement, extractMessageText, isAIMessage)
  - [websocketManager.js](js/src/modules/websocketManager.js) - WebSocketManager class: connect(), registerClient(), handleMessage(), sendCompletionResponse(), handleHeartbeat()
  - [domManager.js](js/src/modules/domManager.js) - DOMManager class: waitForElement(), fillInputBox(), clickSendButton(), waitForAIResponse(), getMessageCount(), getLatestMessage()
  - [aiChatForwarder.js](js/src/modules/aiChatForwarder.js) - Main orchestration: init(), start(), handleCompletionRequest(), scheduleRetry(), destroy()
- **Build process**:
  - Run `python3 build-main.py` or `node js/src/build.js` to regenerate [js/main.js](js/main.js)
  - Build script merges all modules, removes export/import statements, wraps in IIFE
  - Output is standalone Tampermonkey script (no dependencies except jQuery from CDN)
- **Supported platforms** (via WEBSITE_SELECTORS):
  - ChatGPT (chat.openai.com)
  - Claude (claude.ai)
  - Arena (arena.ai)
  - Yuanbao/腾讯元宝 (yuanbao.tencent.com) - has special handling for ql-editor, yuanbao-send-btn, hyc-component-reasoner__text

### Frontend editing workflow
1. **Edit source modules** in [js/src/modules/](js/src/modules/) (NOT main.js)
2. **Run build**: `python3 build-main.py` to regenerate [js/main.js](js/main.js)
3. **Verify output**: Check line count, grep for critical methods, confirm no import/export statements
4. **Deploy**: Copy [js/main.js](js/main.js) content to Tampermonkey extension in browser

## Testing
- **Frontend tests**: Run `python3 test-js.py` to execute all Jest tests in `js/src/tests/`
  - Automatically installs npm dependencies if missing
  - Tests individual modules for correctness
  - See [js/TESTING.md](js/TESTING.md) for detailed testing guide
- **Backend tests**: TODO - add backend testing setup when available

## When editing
- Preserve OpenAI-compatible request/response shapes in `OpenAIRequest` and `OpenAIResponse` (Pydantic models in [backend/main.py](backend/main.py)).
- Keep WS routing logic in `websocket_endpoint` consistent with `ConnectionManager.handle_completion_response()`.

### General principles
- **Feature parity is non-negotiable**: Refactoring must preserve 100% of original functionality
- **Platform-specific code is fragile**: Always search for conditional logic, special cases, and hostname checks
- **Build tools need verification**: Always verify build output, never assume the build script is perfect
- **Initialization code matters**: Startup logic, cleanup handlers, and global instantiation are part of core functionality
