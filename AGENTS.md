# AIProxy Development Guide

This document provides guidelines and instructions for agents working on this codebase.

## Project Overview

AIProxy is a two-tier system that forwards OpenAI-compatible API requests to browser-based clients:
- **Backend** (Python/FastAPI): HTTP server accepting OpenAI API requests, forwarding to WebSocket clients
- **Frontend** (Tampermonkey userscript): Browser clients that inject into AI chat platforms (ChatGPT, Claude, Yuanbao, etc.)

## Build/Lint/Test Commands

### Backend (Python)

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run backend server
python backend/main.py
# Or: uvicorn main:app --reload (from backend/ directory)

# Run backend tests (when available)
python -m pytest backend/ -v
python -m pytest backend/test_specific.py::TestClass::test_method -v
```

### Frontend (JavaScript)

```bash
# Install npm dependencies
cd js && npm install

# Run tests
npm test                              # Run all tests
npm run test -- --testNamePattern="test name"  # Run specific test
npm run test -- file.test.js          # Run specific test file
npm run test:watch                    # Watch mode
npm run test:coverage                 # Coverage report

# Build production userscript
npm run build
# Or: python3 build-main.py (from root)
# Or: node js/src/build.js
```

### All-in-One

```bash
# Build frontend and run tests
python3 build-main.py && python3 test-js.py
```

## Code Style Guidelines

### Python (Backend)

**Imports:**
- Standard library imports first, then third-party, then local
- Use absolute imports from package root
- Group imports by type with blank lines between groups

```python
# Correct order
import logging
import uuid
import json
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket
from pydantic import BaseModel

from websocket_manager import connection_manager
```

**Formatting:**
- Line length: 100 characters (soft limit)
- Use 4 spaces for indentation
- Use trailing commas in multi-line structures
- Use blank lines to separate logical sections within functions

**Types:**
- Use type hints for function parameters and return values
- Use `Optional[T]` instead of `Union[T, None]`
- Use `List[T]`, `Dict[K, V]` from typing module
- Define Pydantic models for all API request/response schemas

**Naming Conventions:**
- `snake_case` for functions, variables, and module names
- `PascalCase` for classes and Pydantic models
- `UPPER_SNAKE_CASE` for constants
- Prefix private methods with underscore: `_private_method()`
- Descriptive names: `get_available_client()` not `get_client()`

**Error Handling:**
- Use try/except with specific exception types
- Log errors with `logger.error()` before re-raising
- Return meaningful error messages in API responses
- Use HTTPException for HTTP errors, custom exceptions for domain errors
- Always clean up resources in finally blocks

```python
try:
    result = await process_request(request)
    return result
except ValueError as e:
    logger.error(f"Invalid request: {e}")
    raise HTTPException(status_code=400, detail=str(e))
except Exception as e:
    logger.error(f"Unexpected error: {e}")
    raise HTTPException(status_code=500, detail="Internal server error")
```

**Async/Await:**
- Use `async def` for all FastAPI endpoint handlers
- Use `asyncio.Lock()` for thread-safe operations on shared state
- Never block in async functions (use async libraries or `asyncio.to_thread()`)
- Always set timeouts on async operations

**Logging:**
- Use module-level logger: `logger = logging.getLogger(__name__)`
- Log at appropriate levels: `debug`, `info`, `warning`, `error`
- Include request IDs and client IDs in log messages

### JavaScript (Frontend)

**Formatting:**
- Use ESLint/Prettier conventions (2 spaces, semicolons, double quotes)
- Use `const` by default, `let` when reassignment is needed
- Use template literals for string interpolation

**Types (JSDoc):**
- Document functions with JSDoc comments
- Include @param and @return types
- Describe behavior, not just types

**Naming Conventions:**
- `camelCase` for variables and functions
- `PascalCase` for classes
- `SCREAMING_SNAKE_CASE` for constants
- Descriptive names: `handleCompletionRequest()` not `handleReq()`

**Error Handling:**
- Always handle promise rejections
- Use try/catch in async functions
- Log errors with `console.error()` or `console.warn()`

**Module Structure:**
- Each module in `js/src/modules/` should have a single responsibility
- Use ES6 classes for stateful components
- Use pure functions where possible

## Architecture Patterns

### Backend (main.py)

- **Pydantic Models**: Define request/response schemas matching OpenAI API format
- **ConnectionManager**: Central hub for WebSocket client state and routing
- **Request/Response Matching**: Uses `request_id` to correlate HTTP requests with WebSocket responses
- **Heartbeat System**: 25s interval, 30s timeout for client health checks

### Frontend (main.js)

- **Source Modules**: Edit in `js/src/modules/`, never directly in `js/main.js`
- **Build Process**: `build-main.py` merges modules, removes imports/exports, wraps in IIFE
- **Platform Adapters**: Site-specific selectors in `config.js` for each AI platform

## Message Contracts

### HTTP → WebSocket (server → client)
```json
{"type": "completion_request", "request_id": "req_...", "model": "...", "messages": [...], "temperature": 0.7}
```

### WebSocket → HTTP (client → server)
```json
{"type": "completion_response", "request_id": "req_...", "content": "...", "finish_reason": "stop"}
```

### Heartbeat
```json
{"type": "heartbeat"}           // server → client
{"type": "heartbeat_response"}  // client → server
```

## Key Files

| Path | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app, HTTP endpoints, WebSocket handler |
| `backend/websocket_manager.py` | Client connection state, request routing |
| `js/src/modules/config.js` | Site-specific CSS selectors |
| `js/src/modules/websocketManager.js` | WebSocket client connection handling |
| `js/src/modules/domManager.js` | DOM manipulation for AI chat UIs |
| `js/src/modules/aiChatForwarder.js` | Main orchestration logic |
| `js/main.js` | Production userscript (auto-generated) |
| `build-main.py` | Builds js/main.js from source modules |

## Development Workflow

### Backend Changes
1. Edit files in `backend/`
2. Server auto-reloads with `python backend/main.py`
3. Wait for user to deploy frontend changes to browser before running tests
4. Run `python test_backend.py` only after confirming browser has latest userscript

### Frontend Changes
1. Edit source modules in `js/src/modules/` (NOT main.js)
2. Run `python3 build-main.py` to regenerate `js/main.js`
3. Verify build output (check line count, critical methods)
4. Deploy: Copy `js/main.js` content to Tampermonkey
5. Refresh browser page to load new userscript
6. Test with `python test_backend.py` to verify end-to-end functionality

## Testing Guidelines

### Writing Backend Tests
- Use `pytest` framework
- Place tests in `backend/tests/` directory
- Mock WebSocket connections for isolated testing
- Test error handling paths thoroughly

### Writing Frontend Tests
- Use Jest framework with jsdom environment
- Place tests in `js/src/tests/` alongside modules
- Test individual module functions in isolation
- Mock DOM elements for DOM-related tests

## Critical Rules

1. **Preserve OpenAI API compatibility**: Request/response shapes must match OpenAI spec
2. **Never edit js/main.js directly**: Always edit source modules and rebuild
3. **Verify build output**: Check that critical methods exist after build
4. **Feature parity**: Refactoring must not break existing functionality
5. **Platform-specific code is fragile**: Be extra careful with site selectors and conditional logic
6. **Test order matters**: Always build and test JS changes before running backend tests. Wait for user confirmation that browser has been refreshed with new userscript.
