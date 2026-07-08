# Gemini 3.1 Tool Calls — RCA & Fix Log

> **Date:** 2026-06-28  
> **Affected Models:** `gemini-3.1-flash-lite-preview` and all Gemini 3.x models with thinking enabled  
> **Symptom:** n8n AI Agent (LangChain ToolsAgent V3) throws `400 Request contains an invalid argument` on any multi-step tool-calling workflow

---

## Topic 1 — Missing `thought_signature` on Tool Calls

### Error
```
400 Function call is missing a thought_signature in functionCall parts.
This is required for tools to work correctly.
```

### Root Cause
Gemini 3.x models with reasoning/thinking enabled emit a `thoughtSignature` field alongside `functionCall` parts. This signature is an opaque, base64-encoded token representing the model's internal reasoning state. When the proxy sent the tool results (`functionResponse`) back to Gemini without the signature, the API rejected the entire request.

The proxy was also **reading** the signature from the wrong location. The Gemini API places `thoughtSignature` at the **part level** (`part.thoughtSignature`), not nested inside `part.functionCall.thoughtSignature`. The previous code was checking the wrong key and never finding it.

### Fix — `src/providers/gemini.ts`
1. **Extract** `thoughtSignature` from `part.thoughtSignature` (part level), not `part.functionCall.thoughtSignature`.
2. **Cache** it in memory keyed by the tool call ID.
3. **Re-inject** it back at the part level (`fnResponsePart.thoughtSignature`) when sending `functionResponse` in the next turn.

```diff
- if (part.functionCall.thoughtSignature) {
-   this.thoughtCache.set(fnId, part.functionCall.thoughtSignature);
+ if (part.thoughtSignature) {
+   this.thoughtCache.set(fnId, part.thoughtSignature);
```

---

## Topic 2 — Proxy Schema Rejecting Omitted `content` Field

### Error
```json
{
  "code": "invalid_type",
  "expected": "string",
  "received": "undefined",
  "path": ["messages", 1, "content"],
  "message": "Required"
}
```

### Root Cause
n8n/LangChain sends an `assistant` message that contains only `tool_calls` and **no `content` field** (not even `null`) when the model calls a tool without producing any text. The proxy's internal Zod validation schema required `content` to be a `string | null`, so `undefined` caused an immediate `400` before the request even reached Gemini.

### Fix — `src/types.ts`
Changed `content` from `.nullable()` to `.nullish()` so it accepts `string`, `null`, or `undefined`.

```diff
- content: z.string().nullable(),
+ content: z.string().nullish(),
```

Also updated the TypeScript interface:
```diff
- content: string | null;
+ content?: string | null;
```

---

## Topic 3 — Structural Violations in Gemini `contents` Array

### Error
```
400 Request contains an invalid argument.
```
*(Generic Gemini error — only visible via proxy debug logs)*

### Root Cause — Three separate bugs

#### 3a. Multiple tool messages → multiple `user` turns (violates alternating rule)
When n8n calls multiple tools in parallel, it sends **one `role: tool` message per tool result**. The old code created a separate Gemini `user` turn for each one. Gemini strictly requires an alternating `user → model → user → model` structure. Back-to-back `user` turns cause an immediate `INVALID_ARGUMENT`.

**Gemini requires:** All `functionResponse` parts from one round must be batched into a **single `user` turn** with multiple parts.

```
❌ Wrong:                        ✅ Correct:
user: [fnResponse A]            user: [fnResponse A, fnResponse B, fnResponse C]
user: [fnResponse B]
user: [fnResponse C]
```

#### 3b. `id` field inside `functionResponse`
The proxy was sending `functionResponse.id` (copied from the OpenAI tool call ID). Gemini's `functionResponse` schema has **no `id` field**. Any unknown field causes `INVALID_ARGUMENT`.

#### 3c. `id` field inside `functionCall`
Same issue — `functionCall` was being sent with an `id` field. The Gemini API `functionCall` schema only has `name` and `args`. The tool call ID is an OpenAI concept and must be stripped when forwarding to Gemini.

### Fix — `src/providers/gemini.ts` (`mapMessages` method)

Rewrote the message mapping loop from a `for...of` to an **index-based `while` loop** that batches consecutive `tool` messages:

```typescript
// Batch ALL consecutive tool messages into one user turn
if (m.role === 'tool') {
  const parts: any[] = [];
  while (i < messages.length && messages[i].role === 'tool') {
    const tm = messages[i];
    const fnResponsePart: any = {
      functionResponse: {
        name: tm.name || 'function',      // ✅ no id field
        response: { result: tm.content || '' },
      },
    };
    if (sig) fnResponsePart.thoughtSignature = sig; // ✅ at part level
    parts.push(fnResponsePart);
    i++;
  }
  contents.push({ role: 'user', parts }); // ✅ single user turn
  continue;
}

// functionCall also strips id
const fnCallPart: any = {
  functionCall: {
    name: tc.function.name,   // ✅ no id field
    args: JSON.parse(tc.function.arguments || '{}'),
  },
};
```

---

## Summary Table

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | `thoughtSignature` read from wrong location (`part.functionCall.thoughtSignature`) | `src/providers/gemini.ts` | Read from `part.thoughtSignature` |
| 2 | Proxy Zod schema rejects `undefined` content | `src/types.ts` | Change `.nullable()` → `.nullish()` |
| 3a | Multiple tool messages create multiple `user` turns | `src/providers/gemini.ts` | Batch all consecutive `tool` messages into one `user` turn |
| 3b | `id` field sent inside `functionResponse` | `src/providers/gemini.ts` | Remove `id` from `functionResponse` |
| 3c | `id` field sent inside `functionCall` | `src/providers/gemini.ts` | Remove `id` from `functionCall` |


---

## Topic 4 — Unsupported JSON Schema Keywords in Tool Parameters

### Error
```
Invalid JSON payload received. Unknown name "exclusiveMinimum" at
'tools[0].function_declarations[0].parameters.properties[0].value.items...'
Cannot find field.
```

### Root Cause
n8n/LangChain generates full JSON Schema (draft-07+) for tool parameters, including keywords like `exclusiveMinimum`, `exclusiveMaximum`, `$ref`, `$defs`, `$id`, `multipleOf`, `if/then/else`, etc. Gemini's `functionDeclarations` schema is a **strict subset** of JSON Schema and rejects any field it doesn't recognise with a 400 error.

The proxy's `sanitizeParams()` only stripped `additionalProperties` and `$schema`, letting all other unsupported keywords through.

### Fix — `src/providers/gemini.ts` (`sanitizeParams` method)
Expanded the blocklist to cover the full set of JSON Schema keywords unsupported by Gemini. The list is applied **recursively** across the entire nested parameter tree.

```typescript
const UNSUPPORTED_KEYS = new Set([
  'additionalProperties', '$schema', '$ref', '$defs', '$id',
  'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'contentEncoding', 'contentMediaType',
  'if', 'then', 'else', 'not',
  'unevaluatedProperties', 'unevaluatedItems',
  'dependentSchemas', 'dependentRequired',
  'prefixItems', 'contains', 'minContains', 'maxContains',
]);
```

---

## Topic 5 — Wrong `toolConfig` Structure (`mode` at wrong level)

### Error
```
Invalid JSON payload received. Unknown name "mode" at 'tool_config': Cannot find field.
```

### Root Cause
The proxy's `mapToolChoice()` was returning the tool config object with `mode` at the top level:
```json
{ "mode": "NONE" }
```
But Gemini requires `mode` to be nested inside a `functionCallingConfig` object:
```json
{ "functionCallingConfig": { "mode": "NONE" } }
```
This caused Gemini to reject the `toolConfig` field entirely with an unknown field error.

### Fix — `src/providers/gemini.ts` (`mapToolChoice` method)
Wrapped all returned values in `functionCallingConfig`, and added the missing `required` → `ANY` mapping:

```diff
- if (toolChoice === 'none') return { mode: 'NONE' };
- if (toolChoice === 'auto') return { mode: 'AUTO' };
+ if (toolChoice === 'none') return { functionCallingConfig: { mode: 'NONE' } };
+ if (toolChoice === 'auto') return { functionCallingConfig: { mode: 'AUTO' } };
+ if (toolChoice === 'required') return { functionCallingConfig: { mode: 'ANY' } };

- return { mode: 'ANY', allowedFunctionNames: [...] };
+ return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [...] } };
```

---

## Summary Table

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | `thoughtSignature` read from wrong location (`part.functionCall.thoughtSignature`) | `src/providers/gemini.ts` | Read from `part.thoughtSignature` |
| 2 | Proxy Zod schema rejects `undefined` content | `src/types.ts` | Change `.nullable()` → `.nullish()` |
| 3a | Multiple tool messages create multiple `user` turns | `src/providers/gemini.ts` | Batch all consecutive `tool` messages into one `user` turn |
| 3b | `id` field sent inside `functionResponse` | `src/providers/gemini.ts` | Remove `id` from `functionResponse` |
| 3c | `id` field sent inside `functionCall` | `src/providers/gemini.ts` | Remove `id` from `functionCall` |
| 4 | Unsupported JSON Schema keywords (`exclusiveMinimum` etc.) passed to Gemini | `src/providers/gemini.ts` | Expanded `sanitizeParams` blocklist |
| 5 | `toolConfig` sent as `{ mode }` instead of `{ functionCallingConfig: { mode } }` | `src/providers/gemini.ts` | Wrapped in `functionCallingConfig` |
| 6 | Additional unsupported JSON Schema keywords (`const`, `propertyNames`, `patternProperties`) | `src/providers/gemini.ts` | Added to `sanitizeParams` blocklist |
| 7 | Anthropic `system` prompt sent as array of blocks | `src/routes/anthropic.ts` | Flatten array into a plain string before routing |

---

## Topic 6 — Additional Unsupported JSON Schema Keywords

### Error
```
Invalid JSON payload received. Unknown name "const" at 'tools[0]...': Cannot find field.
Invalid JSON payload received. Unknown name "propertyNames" at 'tools[0]...': Cannot find field.
```

### Root Cause
Claude Code's internal tool schemas contain advanced JSON Schema features like `const` (for exact value matching) and `propertyNames` (for restricting object keys). Gemini's function declaration parser strictly rejects these unknown schema properties.

### Fix — `src/providers/gemini.ts`
Added `const`, `propertyNames`, and `patternProperties` to the `UNSUPPORTED_KEYS` set in `sanitizeParams()`, ensuring they are stripped from the parameters payload before being forwarded to Gemini.

---

## Topic 7 — Anthropic `system` Prompt Sent as Array of Blocks

### Error
```
400 Invalid JSON payload received. Unknown name "text" at 'contents[0].parts[0]': Proto field is not repeating, cannot start list.
```

### Root Cause
The Anthropic API allows the `system` parameter to be either a plain `string` or an **array of content blocks** (e.g. `[ { type: 'text', text: '...' } ]`). Claude Code sends its system prompt as an array of blocks. 

Because the proxy's `anthropicMessagesToChatMessages` translator passed this array directly into the `content` field of the system message, our Gemini provider ended up calling `.slice(0, 12000)` on the *array* (returning a sliced array of objects) and sending it inside the `"text"` field. Since `"text"` expects a singular string, the Gemini API rejected the request.

### Fix — `src/routes/anthropic.ts`
Added a helper `translateSystemPrompt` to check if the incoming `system` prompt is an array of blocks, extract the text from each block, and join them into a single plain string before passing it into the internal message router.

```typescript
function translateSystemPrompt(system?: string | AnthropicContentBlock[]): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('\n');
  }
  return undefined;
}
```

---

## Key Rules for Gemini Tool Calling

1. `thoughtSignature` is at the **part level**, never inside `functionCall` or `functionResponse`.
2. `functionCall` only has `name` and `args` — no `id`.
3. `functionResponse` only has `name` and `response` — no `id`.
4. All tool results from one round **must be in a single `user` turn** as multiple parts.
5. The `contents` array must strictly alternate `user → model → user → model`.
6. Tool parameters must not contain unsupported JSON Schema keywords — strip them before sending.
7. `toolConfig` must be `{ functionCallingConfig: { mode: '...' } }` — never `{ mode: '...' }` directly.
8. System prompts coming from Anthropic/Claude Code clients must be flattened to a plain string.
