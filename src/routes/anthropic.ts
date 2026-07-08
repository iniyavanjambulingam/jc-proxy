/**
 * Anthropic-compatible /v1/messages endpoint.
 * Translates between Anthropic API format and the internal ChatRequest format,
 * allowing Claude Code and other Anthropic clients to use any provider (Gemini, Groq, etc.)
 */
import { FastifyInstance } from 'fastify';
import { chat, streamChat, registry } from '../router.js';
import { authenticate } from '../auth.js';
import { ChatMessage, ChatRequest, Tool } from '../types.js';
import { logService } from '../services/logService.js';

// ── Anthropic type shapes ────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: 'text' | 'image' | 'document' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  source?: { type: string; media_type: string; data: string };
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: any;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: { type: 'auto' | 'any' | 'none' | 'tool'; name?: string };
}

// ── Translators ──────────────────────────────────────────────────────────────

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

function anthropicMessagesToChatMessages(
  messages: AnthropicMessage[],
  system?: string
): ChatMessage[] {
  const result: ChatMessage[] = [];

  if (system) {
    result.push({ role: 'system', content: system });
  }

  for (const m of messages) {
    // Simple string content
    if (typeof m.content === 'string') {
      result.push({ role: m.role, content: m.content });
      continue;
    }

    // Array of content blocks
    const blocks = m.content as AnthropicContentBlock[];

    if (m.role === 'user') {
      // Check if this user turn is purely tool_results
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      const nonToolResults = blocks.filter(b => b.type !== 'tool_result');

      if (toolResults.length > 0) {
        // Emit tool result messages
        for (const tr of toolResults) {
          let content =
            typeof tr.content === 'string'
              ? tr.content
              : Array.isArray(tr.content)
              ? (tr.content as AnthropicContentBlock[])
                  .filter(b => b.type === 'text')
                  .map(b => b.text || '')
                  .join('\n')
              : '';

          if ((tr as any).is_error) {
            content = `Error: ${content}`;
          }

          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            name: tr.tool_use_id || 'function',
            content,
          });
        }
      }

      if (nonToolResults.length > 0) {
        const hasMultimodal = nonToolResults.some(b => b.type === 'document' || b.type === 'image');
        if (hasMultimodal) {
          const multimodal_content = nonToolResults.map(b => {
            if (b.type === 'text') {
              return { type: 'text' as const, text: b.text };
            } else if (b.type === 'image' && b.source) {
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: b.source.media_type,
                  data: b.source.data,
                },
              };
            } else if (b.type === 'document' && b.source) {
              return {
                type: 'document' as const,
                source: {
                  type: 'base64' as const,
                  media_type: b.source.media_type,
                  data: b.source.data,
                },
              };
            }
            return null;
          }).filter(Boolean) as any[];

          result.push({
            role: 'user',
            multimodal_content,
          });
        } else {
          const textContent = nonToolResults
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('\n');
          if (textContent) {
            result.push({ role: 'user', content: textContent });
          }
        }
      }
    } else {
      // assistant turn — may contain text + tool_use blocks
      const textParts = blocks.filter(b => b.type === 'text').map(b => b.text || '');
      const toolUses = blocks.filter(b => b.type === 'tool_use');

      const textContent = textParts.join('\n') || null;

      if (toolUses.length > 0) {
        result.push({
          role: 'assistant',
          content: textContent,
          tool_calls: toolUses.map(tu => ({
            id: tu.id || `call_${Date.now()}`,
            type: 'function' as const,
            function: {
              name: tu.name || '',
              arguments: JSON.stringify(tu.input || {}),
            },
          })),
        });
      } else if (textContent) {
        result.push({ role: 'assistant', content: textContent });
      }
    }
  }

  return result;
}

function anthropicToolsToTools(tools: AnthropicTool[]): Tool[] {
  return tools.map(t => {
    if ((t as any).type === 'web_search_20250305') {
      return {
        type: 'function' as const,
        function: {
          name: 'web_search',
          description: 'Search the web for up-to-date information on the query.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to execute.'
              }
            },
            required: ['query']
          }
        }
      };
    }
    return {
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || { type: 'object', properties: {} },
      },
    };
  });
}

function anthropicToolChoiceToOpenAI(
  tc: AnthropicRequest['tool_choice']
): ChatRequest['tool_choice'] | undefined {
  if (!tc) return undefined;
  if (tc.type === 'none') return 'none';
  if (tc.type === 'auto') return 'auto';
  if (tc.type === 'any') return 'required';
  if (tc.type === 'tool' && tc.name) return { type: 'function', function: { name: tc.name } };
  return 'auto';
}

// ── Response translators ─────────────────────────────────────────────────────

function openAIResponseToAnthropic(openai: any, model: string): any {
  const choice = openai.choices?.[0];
  const message = choice?.message;

  const content: AnthropicContentBlock[] = [];

  if (message?.content) {
    content.push({ type: 'text', text: message.content });
  }

  if (message?.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch { return {}; } })(),
      });
    }
  }

  const finishReason = choice?.finish_reason;
  const stopReason =
    finishReason === 'tool_calls' ? 'tool_use'
    : finishReason === 'length' ? 'max_tokens'
    : 'end_turn';

  return {
    id: openai.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: openai.usage?.prompt_tokens || 0,
      output_tokens: openai.usage?.completion_tokens || 0,
    },
  };
}

// ── Streaming helpers ────────────────────────────────────────────────────────

function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── Route registration ───────────────────────────────────────────────────────

export async function anthropicRoutes(app: FastifyInstance) {
  app.post('/v1/messages/count_tokens', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as AnthropicRequest;

    if (!body.model || !body.messages) {
      return reply.status(400).send({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'model and messages are required' },
      });
    }

    const { getConfig } = await import('../config.js');
    const cc = getConfig().claudeCode;
    let resolvedModel: string;
    if (body.model.startsWith('claude-') && cc?.enabled && cc.target) {
      resolvedModel = cc.target;
    } else if (body.model.startsWith('claude')) {
      resolvedModel = 'gemini-2.5-flash';
    } else {
      resolvedModel = body.model;
    }

    const chatRequest: ChatRequest = {
      model: resolvedModel,
      messages: anthropicMessagesToChatMessages(body.messages, translateSystemPrompt(body.system)),
      max_tokens: body.max_tokens || 1024,
    };

    try {
      const resolved = registry.resolveModel(chatRequest.model);
      if (resolved && resolved.provider.countTokens) {
        const count = await resolved.provider.countTokens(chatRequest);
        return { input_tokens: count };
      }

      // Fallback to simple estimation
      let chars = 0;
      for (const m of chatRequest.messages) {
        chars += (m.content || '').length;
      }
      return { input_tokens: Math.ceil(chars / 4) };
    } catch (err: any) {
      reply.status(err.status || 500).send({
        type: 'error',
        error: {
          type: 'api_error',
          message: err.message || 'Token counting failed',
        },
      });
    }
  });

  app.post('/v1/messages', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as AnthropicRequest;

    if (!body.model || !body.messages || !body.max_tokens) {
      return reply.status(400).send({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'model, messages, and max_tokens are required' },
      });
    }

    console.log(`[anthropic] model=${body.model} messages=${body.messages.length} tools=${body.tools?.length || 0} stream=${body.stream}`);
    logService.add({ level: 'info', requestId: '', provider: '', model: body.model, endpoint: '/v1/messages', statusCode: 0, latencyMs: 0, message: 'incoming anthropic request' });

    // Claude Code sends Claude model names — remap using claudeCode config or fallback to gemini-2.5-flash
    const { getConfig } = await import('../config.js');
    const cc = getConfig().claudeCode;
    let resolvedModel: string;
    if (body.model.startsWith('claude-') && cc?.enabled && cc.target) {
      resolvedModel = cc.target;
    } else if (body.model.startsWith('claude')) {
      resolvedModel = 'gemini-2.5-flash';
    } else {
      resolvedModel = body.model;
    }
    if (resolvedModel !== body.model) {
      console.log(`[anthropic] remapped ${body.model} → ${resolvedModel}`);
      logService.add({ level: 'info', requestId: '', provider: '', model: resolvedModel, endpoint: '/v1/messages', statusCode: 0, latencyMs: 0, message: `remapped ${body.model} to ${resolvedModel}` });
    }

    // Build internal ChatRequest
    const chatRequest: ChatRequest = {
      model: resolvedModel,
      messages: anthropicMessagesToChatMessages(body.messages, translateSystemPrompt(body.system)),
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      stream: body.stream || false,
      tools: body.tools ? anthropicToolsToTools(body.tools) : undefined,
      tool_choice: anthropicToolChoiceToOpenAI(body.tool_choice),
    };

    // ── Streaming ──
    if (body.stream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const msgId = `msg_${Date.now()}`;
      let outputTokens = 0;
      let textIndex = -1;
      let toolIndex = -1;
      const openToolIds: string[] = [];

      // message_start
      reply.raw.write(sseEvent('message_start', {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: body.model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }));

      try {
        for await (const chunk of streamChat(chatRequest)) {
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // Text delta
          if (delta.content) {
            if (textIndex === -1) {
              textIndex = openToolIds.length;
              reply.raw.write(sseEvent('content_block_start', {
                type: 'content_block_start',
                index: textIndex,
                content_block: { type: 'text', text: '' },
              }));
            }
            reply.raw.write(sseEvent('content_block_delta', {
              type: 'content_block_delta',
              index: textIndex,
              delta: { type: 'text_delta', text: delta.content },
            }));
            outputTokens++;
          }

          // Tool call deltas
          if (delta.tool_calls?.length) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const blockIndex = (textIndex >= 0 ? 1 : 0) + idx;

              if (tc.id && !openToolIds[idx]) {
                openToolIds[idx] = tc.id;
                toolIndex = blockIndex;
                reply.raw.write(sseEvent('content_block_start', {
                  type: 'content_block_start',
                  index: blockIndex,
                  content_block: { type: 'tool_use', id: tc.id, name: tc.function?.name || '', input: {} },
                }));
              }

              if (tc.function?.arguments) {
                reply.raw.write(sseEvent('content_block_delta', {
                  type: 'content_block_delta',
                  index: blockIndex,
                  delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
                }));
              }
            }
          }
        }
      } catch (err: any) {
        logService.add({ level: 'error', requestId: '', provider: '', model: body.model, endpoint: '/v1/messages', statusCode: err.status || 500, latencyMs: 0, message: err.body?.error?.message || 'provider error' });
        reply.raw.write(sseEvent('error', {
          type: 'error',
          error: { type: 'api_error', message: err.body?.error?.message || 'Provider error' },
        }));
        reply.raw.end();
        return;
      }

      // Close all open content blocks
      const totalBlocks = (textIndex >= 0 ? 1 : 0) + openToolIds.length;
      for (let i = 0; i < totalBlocks; i++) {
        reply.raw.write(sseEvent('content_block_stop', { type: 'content_block_stop', index: i }));
      }

      reply.raw.write(sseEvent('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: openToolIds.length > 0 ? 'tool_use' : 'end_turn', stop_sequence: null },
        usage: { output_tokens: outputTokens },
      }));

      reply.raw.write(sseEvent('message_stop', { type: 'message_stop' }));
      reply.raw.end();
      return;
    }

    // ── Non-streaming ──
    try {
      const response = await chat(chatRequest);
      return openAIResponseToAnthropic(response, body.model);
    } catch (err: any) {
      logService.add({ level: 'error', requestId: '', provider: '', model: body.model, endpoint: '/v1/messages', statusCode: err.status || 500, latencyMs: 0, message: err.body?.error?.message || 'provider error' });
      reply.status(err.status || 500).send({
        type: 'error',
        error: {
          type: 'api_error',
          message: err.body?.error?.message || err.body?.message || 'Provider error',
        },
      });
    }
  });
}
