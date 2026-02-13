# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIProxy is a two-tier system that forwards OpenAI-compatible API requests to browser-based clients:
- **Backend** (Python/FastAPI): HTTP server accepting OpenAI API requests, forwarding to WebSocket clients
- **Frontend** (Tampermonkey userscript): Browser clients that inject into AI chat platforms (ChatGPT, Claude, Yuanbao, Arena, etc.)

### System Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Client App     │ HTTP    │  Backend Server  │ WebSocket│  Browser Client │
│  (OpenAI API)   │───────▶ │  (FastAPI)       │─────────▶│  (Userscript)   │
│                 │         │                  │         │                 │
│  - OpenAI SDK   │         │  - /v1/chat/     │         │  - Injects into │
│  - curl/requests│         │    completions   │         │    ChatGPT      │
│  - Any HTTP     │         │  - WebSocket     │         │  - Claude.ai    │
│                 │         │    /ws           │         │  - Yuanbao      │
└─────────────────┘         │  - Connection    │         │  - Arena.ai     │
                            │    Manager       │         │                 │
                            └──────────────────┘         └─────────────────┘
```

## Environment Setup

### Backend (Python)

```bash
# Install dependencies
cd backend && pip install -r requirements.txt

# Run server
python backend/main.py
# Server starts on http://localhost:8000

# Or using uvicorn directly
uvicorn backend.main:app --reload
```

### Frontend (JavaScript)

```bash
cd js
npm install
npm test              # Run all tests
npm run build         # Build production userscript
```

### Building Frontend

```bash
# From project root
python build-main.py

# Or from js directory
node js/src/build.js
```

## Code Architecture

### Backend Architecture (backend/main.py + websocket_manager.py)

**Core Components:**

1. **FastAPI Application** (`main.py`):
   - OpenAI-compatible endpoints: `/v1/chat/completions`, `/v1/models`
   - WebSocket endpoint: `/ws`
   - Management endpoints: `/health`, `/stats`, `/logs`
   - Debug log generation to `debug_logs/` directory

2. **ConnectionManager** (`websocket_manager.py`):
   - Manages WebSocket client connections in `active_connections` dictionary
   - Thread-safe access via `connection_lock` and `response_lock`
   - Request/response matching using `pending_requests` (asyncio.Event) and `request_responses` dictionaries
   - Heartbeat system: server pushes heartbeat every 25s, clients respond with `heartbeat_response`
   - Client health check: 30s timeout for heartbeat response
   - Per-client caching: `system_prompt_hash` and `tools_hash` to reduce redundant data transfer

3. **Request Flow:**
   - HTTP POST `/v1/chat/completions` creates OpenAI-compatible request
   - Validates messages and generates unique `request_id`
   - Checks system prompt and tools hashes to determine if they've changed
   - Adds XML response format requirements to system messages if not present
   - Routes request to available idle client via `get_available_client()`
   - Marks client as BUSY, waits for response via `send_completion_request()`
   - Client responds with `completion_response` containing content (possibly with `<content>` and `<tool_calls>` tags)
   - Backend parses XML response, extracts content and tool_calls
   - Returns OpenAI-compatible response to HTTP client

4. **XML Response Format:**
   ```xml
   <content>[Response text]</content>
   <tool_calls>[{"name": "...", "arguments": {...}}]</tool_calls>
   <response_done>
   ```
   - Client must include `<content>` tag with main response
   - `<tool_calls>` section is OPTIONAL (only include if calling tools)
   - Must end with `<response_done>` tag

5. **Caching Behavior:**
   - System prompts cached per-client via MD5 hash
   - Tools cached per-client via MD5 hash
   - Only sent when hash differs from previous request for that client
   - Independent caching for system prompts and tools

### Frontend Architecture (js/src/modules/)

**Source Modules (edit here, never edit js/main.js):**

1. **config.js**:
   - `WEBSITE_SELECTORS`: Platform-specific CSS selectors (ChatGPT, Claude, Arena, Yuanbao, default)
   - `CONFIG`: Global configuration (WebSocket URL, timeouts, retry settings)
   - `getCurrentSiteConfig()`: Auto-detects current hostname and returns matching selectors

2. **utils.js**:
   - `delay(ms)`: Promise-based delay
   - `randomDelay(min, max)`: Random delay for human simulation
   - `findElement(selector)`: Finds element using first matching selector
   - `randomChoice(array)`: Random element selection
   - `extractMessageText(element)`: Extracts text from message element
   - `isAIMessage(element)`: Checks if element is AI message
   - `log()`, `debug()`, `info()`, `warn()`, `error()`: Logging utilities

3. **websocketManager.js**:
   - `WebSocketManager` class: Handles WebSocket connection, registration, message handling
   - `connect()`: Establishes WebSocket connection
   - `registerClient()`: Sends registration message with client_id and metadata
   - `handleMessage()`: Routes incoming messages (connection_established, completion_request, heartbeat, error)
   - `sendClientReady()`: Informs server client is ready
   - `sendCompletionResponse()`, `sendErrorResponse()`: Sends responses back to server
   - `sendLog()`: Sends client logs to server

4. **domManager.js**:
   - `DOMManager` class: Handles DOM manipulation for AI chat platforms
   - `waitForElement(selector, timeout)`: Waits for element to appear
   - `setupMessageObserver()`: Sets up MutationObserver to detect new messages
   - `setupPolling()`: Fallback polling mechanism
   - `fillInputBox(inputBox, text)`: Fills input box with random typing simulation
   - `clickSendButton()`: Clicks send button after waiting for it to be enabled
   - `waitForAIResponse(baseline)`: Waits for AI response, parses XML format
   - `getLatestMessage()`: Gets latest AI message content (platform-specific logic for Arena and Yuanbao)
   - `getMessageCount()`: Counts AI messages (platform-specific logic)
   - `disconnectObserver()`: Cleanup

5. **aiChatForwarder.js**:
   - `AIChatForwarder` class: Main orchestration logic
   - `init()`, `start()`: Initialization sequence
   - `handleCompletionRequest(requestData)`: Core request handling
     - Validates processing state and domManager
     - Extracts conversation history, system message, user message
     - Builds combined message with XML format requirements
     - Adds supported tools if present
     - Waits for input box, fills content, clicks send button
     - Waits for AI response (up to 2 minutes)
     - Parses XML response, extracts content and tool_calls
     - Sends completion response back to server
   - `extractConversation(messages)`: Extracts messages array
   - `scheduleRetry()`: Reconnection logic with exponential backoff
   - `startHeartbeat()`: Heartbeat handling
   - `destroy()`: Cleanup resources

6. **main.js** (auto-generated):
   - Merged production build of all modules
   - No imports/exports, wrapped in IIFE
   - Auto-initializes `window.aiForwarder`

**Build Process:**

The `build-main.py` script invokes `node js/src/build.js` which:
1. Reads all source modules from `js/src/modules/`
2. Removes imports and exports
3. Merges into single JavaScript file
4. Wraps in IIFE (Immediately Invoked Function Expression)
5. Creates global `window.aiForwarder` instance

## Platform Support

| Platform | Domain | Special Handling |
|----------|--------|------------------|
| ChatGPT | `chat.openai.com` | Standard textarea input |
| Claude | `claude.ai` | Standard textarea input |
| Arena.ai | `arena.ai` | Uses flex-col-reverse, AI messages lack `justify-end` class |
| Yuanbao (腾讯元宝) | `yuanbao.tencent.com` | `ql-editor` contenteditable, `yuanbao-send-btn`, `hyc-component-reasoner__text` |

To add a new platform:
1. Add entry to `WEBSITE_SELECTORS` in `config.js`
2. Test selectors in browser DevTools
3. Update `domManager.js` if platform-specific logic is needed

## Testing

### Frontend Tests (Jest)

```bash
# Run all tests
python test-js.py
# Or: cd js && npm test

# Run specific test file
python test-js.py config.test.js

# Watch mode
cd js && npm run test:watch

# Coverage report
cd js && npm run test:coverage
```

Test files: `js/src/tests/*.test.js` covering config, utils, websocketManager, domManager, aiChatForwarder

### Backend Tests

Currently TODO - backend tests not yet implemented.

### Integration Tests

**test_backend.py**: End-to-end tests requiring a connected browser client.

**test_avante_stream.py**: Stream mode test script for avante.nvim compatibility.

```bash
# Non-streaming test
python test_avante_stream.py

# Streaming test
python test_avante_stream.py --stream

# Health check
python test_avante_stream.py --health
```

## File Combining Tools

Two utilities are available for combining source code and documentation:

### `combine_all.py` - Enhanced One-Command Combining

**Recommended for**: Complete project documentation, backups, and code sharing

Use this script for rapid, one-command generation of comprehensive project bundles:

```bash
# Combine everything (default)
python combine_all.py --output all_files.txt

# Combine only documentation
python combine_all.py --output docs.txt --categories docs

# Combine only Python and JavaScript sources
python combine_all.py --output sources.txt --categories py --categories js

# Combine documentation, Python, JS, and tests
python combine_all.py --output complete.txt --categories docs --categories py --categories js --categories tests
```

**Features**:
- 5 predefined categories: docs, py, js, tests, config
- Automatic file discovery and organization
- Category-based prioritization
- Clear output with headers and progress tracking
- Creates 600KB+ comprehensive bundles (31 files by default)

**Documentation**: See `COMBINE_ALL.md` for detailed usage instructions.

### `combine_files.py` - Low-Level File Combining

**Recommended for**: Custom glob patterns and fine-grained control

Use this script when you need custom file matching patterns:

```bash
python combine_files.py --pattern "**/*.py" --output python_files.txt
python combine_files.py --pattern "*.md" --output all_markdown.md
```

**Features**:
- Custom glob pattern matching
- Manual file selection and ordering
- Binary file detection
- No predefined categories

## Critical Rules

1. **Never edit js/main.js directly**: Always edit source modules in `js/src/modules/` and rebuild
2. **Preserve OpenAI API compatibility**: Request/response shapes must match OpenAI spec exactly
3. **Build verification**: Always verify build output (check line count, grep for critical methods) before deploying
4. **Feature parity**: Refactoring must not break existing functionality
5. **Platform-specific code is fragile**: Extra care with site selectors and conditional logic
6. **Test order matters**: Always build and test JS changes before running backend tests
7. **Initialization code matters**: Startup logic, cleanup handlers, and global instantiation are core functionality
8. **Debug logs**: All requests/responses saved to `debug_logs/` directory at project root

## Message Contracts

### HTTP → WebSocket (server → client)
```json
{
  "type": "completion_request",
  "request_id": "req_...",
  "model": "...",
  "messages": [{"role": "system|user|assistant", "content": "...", "tool_calls": [...]}],
  "temperature": 0.7,
  "max_tokens": null,
  "stream": false,
  "tools": [{"type": "function", "function": {"name": "...", "description": "...", "parameters": {...}}}]
}
```

### WebSocket → HTTP (client → server)
```json
{
  "type": "completion_response",
  "request_id": "req_...",
  "content": "...",
  "finish_reason": "stop|tool_calls",
  "timestamp": "ISO8601",
  "error": null
}
```

### Heartbeat
```json
{"type": "heartbeat"}           // server → client
{"type": "heartbeat_response"}  // client → server
```

### Client Registration
```json
{"type": "register", "client_id": "...", "metadata": {"user_agent": "...", "webpage_url": "...", "timestamp": "..."}}
```

## Development Workflow

### Making Backend Changes

1. Edit files in `backend/`
2. Server auto-reloads with `python backend/main.py`
3. Test with `test_backend.py` (wait for browser to have latest userscript)
4. Check `debug_logs/` for request/response details

### Making Frontend Changes

1. Edit source modules in `js/src/modules/` (NOT main.js)
2. Run `python build-main.py` to regenerate `js/main.js`
3. Verify build output:
   ```bash
   wc -l js/main.js  # Should be large (merged file)
   grep -c "AIChatForwarder" js/main.js  # Should be 1
   grep -c "export" js/main.js  # Should be 0
   ```
4. Deploy: Copy `js/main.js` content to Tampermonkey
5. Refresh browser page
6. Wait for user confirmation before running backend tests

## Debugging

### Enable Verbose Logging

Backend: Logging at INFO level (configured in `backend/main.py`)
Frontend: Check browser console for detailed logs with emoji prefixes (🔍, ✅, ❌, etc.)

### View Debug Logs

```bash
# List all logs
curl http://localhost:8000/logs

# Get specific log
curl http://localhost:8000/logs/req_abc123_request.json

# Clear logs
curl -X DELETE http://localhost:8000/logs
```

Debug logs saved to `debug_logs/`:
- `{request_id}_request.json` - Original OpenAI request
- `{request_id}_forward.json` - Request forwarded to client
- `{request_id}_response.json` - Client's raw response
- `{request_id}_openai_response.json` - Formatted OpenAI response
- `{request_id}_tool_calls.json` - Tool calls (if present)
- `{client_id}_*.log` - Client-side logs

### Monitor Connections

```bash
curl http://localhost:8000/stats
# Returns: {"total_connections": 2, "idle_connections": 1, "busy_connections": 1, "pending_requests": 0, "timestamp": "2024-01-01T00:00:00"}
```

### Common Issues

**"No available client connections"**: No browser client connected. Ensure Tampermonkey userscript is installed and browser is on supported platform.

**Request timeout (504)**: Client didn't respond within 120 seconds. Check AI platform responsiveness and verify selectors.

**Can't find input/send elements**: CSS selectors outdated. Open DevTools and inspect actual DOM structure, update selectors in `config.js`.

**Messages not being sent**: Page not fully loaded. Check `pageReadyIndicator` in config.js.

## API Endpoints

### OpenAI-Compatible Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/chat/completions` | Chat completion - forwards to WebSocket client |
| GET | `/v1/models` | Returns model list |

### Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service status and connection stats |
| GET | `/health` | Health check |
| GET | `/stats` | Connection statistics |
| GET | `/logs` | List debug log files |
| GET | `/logs/{filename}` | Get specific log file |
| DELETE | `/logs` | Clear all debug logs |
| WS | `/ws` | WebSocket endpoint |

## Security Considerations

- **CORS**: Currently set to `*` in production - restrict in production environments
- **HTTPS/WSS**: Use HTTPS/WSS in production
- **Rate limiting**: Implement in production (not currently implemented)
- **Input validation**: All requests validated with Pydantic models
- **Debug logs**: May contain sensitive data - clear regularly in production

## Code Style Guidelines

### Python (Backend)

- Standard library first, then third-party, then local imports
- Line length: 100 characters (soft limit)
- 4 spaces indentation
- Type hints for all functions
- `snake_case` for functions/variables/classes
- `PascalCase` for Pydantic models
- Use `async def` for all handlers
- Use `asyncio.Lock()` for thread-safe operations
- Log with appropriate levels (debug, info, warning, error)

### JavaScript (Frontend)

- ESLint/Prettier conventions (2 spaces, semicolons, double quotes)
- `const` by default, `let` when reassignment needed
- Template literals for string interpolation
- JSDoc comments for functions
- `camelCase` for variables/functions
- `PascalCase` for classes
- Always handle promise rejections
- Log errors with `console.error()` or `console.warn()`
