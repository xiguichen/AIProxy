# JS Frontend Analysis: System Role Support

## Current Behavior

### `handleCompletionRequest` Function (lines 82-182)

**Line 119 (Comment):**
```javascript
// 处理对话（跳过系统消息，因为浏览器AI已有上下文）
```
**Issue:** Assumes browser AI already has system context, which is NOT true for new sessions.

**Lines 127-129 (The Skip Logic):**
```javascript
// 只处理用户消息
if (msg.role !== 'user') {
    continue;
}
```
**Current Behavior:** Skips ALL non-user messages including `system`, `assistant`, and `system-reminder` roles.

### `extractConversation` Function (lines 184-188)

```javascript
extractConversation(messages) {
    return messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}
```
**Status:** ✅ Works correctly - extracts all messages
**Issue:** Not used for filtering - logic is in `handleCompletionRequest`

## What's Missing

| Feature | Status | Notes |
|---------|--------|-------|
| Send system message first | ❌ Skipped | Assumes browser has context |
| Send user question | ✅ Works | Only sends user role |
| Error handling for missing user | ✅ Works | Lines 164-169 |
| Error handling for missing system | ❌ Missing | No check if system exists |

## Problem Statement

For **new Avante sessions**, the browser AI (Yuanbao) does NOT have the system prompt context. The flow should be:

1. **Combine** system message and user question
2. **Send** combined message to browser AI
3. **Get** response based on combined context

## Chosen Approach: Single Combined Message (Option B)

Combine system and user messages using markdown format, then send as a single message.

### Markdown Format

```markdown
# Your Role

<system role content here>

# Your Task

<user task content here>
```

**Note:** If system message doesn't exist, skip "Your Role" section entirely.

### Implementation

```javascript
// Extract messages
const systemMsg = conversation.find(m => m.role === 'system');
const userMsg = conversation.filter(m => m.role === 'user').pop();

// Build combined content
let combinedContent = '';

if (systemMsg) {
    combinedContent += '# Your Role\n\n';
    combinedContent += systemMsg.content;
    combinedContent += '\n\n';
}

if (userMsg) {
    combinedContent += '# Your Task\n\n';
    combinedContent += userMsg.content;
}

// Send combined message
await sendMessage(combinedContent);
```

### Example Outputs

**Case 1: System + User**
```markdown
# Your Role

You are a helpful coding assistant.

# Your Task

What is 2+2?
```

**Case 2: User Only (No System)**
```markdown
# Your Task

What is 2+2?
```

**Case 3: System Only (No User)**
```markdown
# Your Role

You are a helpful coding assistant.
```

## Pros and Cons

| Pros | Cons |
|------|------|
| Single round-trip (faster) | Browser AI must parse markdown format |
| Simpler implementation | Less clean separation of concerns |
| Easier error handling | May not work for complex system prompts |

## Implementation Steps

1. Modify `handleCompletionRequest` to:
   - Extract system message
   - Extract last user message
   - Build combined markdown content
   - Send single combined message

2. Add logging:
   - Log when system message is present
   - Log combined content length
   - Log response

## Files to Modify

| File | Changes |
|------|---------|
| `js/src/modules/aiChatForwarder.js` | Update `handleCompletionRequest` |

## Testing Checklist

- [ ] System + User: Both sections present in correct order
- [ ] User Only (no system): Only "Your Task" section
- [ ] System Only (no user): Only "Your Role" section
- [ ] Empty messages: Handle gracefully (return error)
- [ ] Response: Correctly returned to server

## Related Backend Changes

The backend now filters messages (see `main.py`):
- Keeps all `system` role messages
- Keeps only the last `user` role message
- Drops all other user messages from history

This simplifies frontend - it receives exactly what it needs.

## Decision Summary (User Confirmed)

| Decision | Choice |
|----------|--------|
| Approach | Option B - Single Combined Message |
| Format | Markdown with "Your Role" and "Your Task" sections |
| Implementation | Combine and send in single round-trip |

---

**Document Created:** 2026-02-06
**Status:** Ready for Implementation
