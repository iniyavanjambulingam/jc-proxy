import { registry } from './services/provider-registry.js';
import { BaseProvider } from './providers/base.js';
import { ChatRequest, ProviderModel, StreamChunk } from './types.js';
import { isRetryable } from './utils/retry.js';
import { log } from './utils/logger.js';
import { logService } from './services/logService.js';
import { performWebSearch } from './utils/search.js';
import { getFallbackChain } from './services/fallbackService.js'; // fallbackChains
import { getConfig } from './config.js';


export { registry } from './services/provider-registry.js';

const MAX_SEARCH_TURNS = 3;

const ANSI_ESCAPE_RE = /\x1B\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_ESCAPE_RE, '');
}

function claudeCodeRedirect(request: ChatRequest): void {
  if (!request.model.startsWith('claude-')) return;
  const cc = getConfig().claudeCode;
  if (!cc?.enabled || !cc.target) return;
  request.model = cc.target;
}

function buildModelChain(model: string): string[] {
  const cc = getConfig().claudeCode;
  const ccFallbacks = (cc?.enabled && cc.fallbacks?.length) ? cc.fallbacks : [];
  return [model, ...ccFallbacks, ...getFallbackChain(model)];
}

const MAX_PAYLOAD_BYTES = 25_000_000; // 25MB — leave headroom under Gemini's 32MB limit

function trimMessagesToFit(messages: any[]): void {
  // Estimate current size
  let size = 0;
  for (const msg of messages) {
    size += JSON.stringify(msg).length;
  }
  if (size <= MAX_PAYLOAD_BYTES) return;

  // Drop oldest non-system messages first, keep system messages and recent context
  let i = 0;
  while (i < messages.length && size > MAX_PAYLOAD_BYTES) {
    const msg = messages[i];
    if (msg.role === 'system') { i++; continue; }
    const msgSize = JSON.stringify(msg).length;
    messages.splice(i, 1);
    size -= msgSize;
  }
}

function providerMeta(p: BaseProvider): { providerNickname?: string; providerType?: string } {
  return {
    providerNickname: (p as any).providerConfig?.nickname,
    providerType: (p as any).providerConfig?.type,
  };
}

/** Filter out providers that are currently in a 429 cooldown window */
function filterCooledDown(providers: BaseProvider[]): BaseProvider[] {
  const ready = providers.filter(p => !p.isRateLimited());
  // If ALL are in cooldown, try them anyway (cooldown may have just expired)
  return ready.length > 0 ? ready : providers;
}

export async function listAllModels(): Promise<ProviderModel[]> {
  const allModels = registry.getAllDiscoveredModels();
  const seen = new Set<string>();
  const result: ProviderModel[] = [];

  for (const m of allModels) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      result.push({
        id: m.id,
        object: 'model',
        created: Date.now(),
        owned_by: m.providerId,
      });
    }
  }

  return result;
}

export async function chat(request: ChatRequest): Promise<any> {
  const requestId = Math.random().toString(36).substring(2, 11);
  request.model = stripAnsi(request.model);
  claudeCodeRedirect(request);
  if (request.max_tokens && request.max_tokens > 32768) {
    request.max_tokens = 32768;
  }
  trimMessagesToFit(request.messages);
  logService.add({ level: 'info', requestId, provider: '', model: request.model, endpoint: '/v1/chat/completions', statusCode: 0, latencyMs: 0, message: 'incoming request' });

  const modelsToTry = buildModelChain(request.model);

  let lastError: any;
  let anyResolved = false;
  for (const modelName of modelsToTry) {
    const resolved = registry.resolveModel(modelName);
    if (!resolved) continue;
    anyResolved = true;

    const { provider } = resolved;
    logService.add({ level: 'info', requestId, provider: provider.id, model: modelName, endpoint: '/v1/chat/completions', statusCode: 0, latencyMs: 0, message: 'provider selected', ...providerMeta(provider) });

    let retryCount = 0;
    const allProviders = [provider, ...registry.getFailoverProviders(modelName, provider.id)];
    const providers = filterCooledDown(allProviders);
    let allRateLimited = true;

    for (const p of providers) {
      const start = Date.now();
      try {
        const response = await p.chat({ ...request, model: modelName });
        const latency = Date.now() - start;
        BaseProvider.recordSuccess(p.id, latency);
        log(p.id, request.model, latency, 200, retryCount);
        logService.add({ level: 'info', requestId, provider: p.id, model: modelName, endpoint: '/v1/chat/completions', statusCode: 200, latencyMs: latency, message: retryCount > 0 ? `success after ${retryCount} retries` : 'success', ...providerMeta(p) });

        // --- Intercept Web Search ---
        const choice = response.choices?.[0];
        const webSearchCall = choice?.message?.tool_calls?.find((tc: any) => tc.function.name === 'web_search');
        if (webSearchCall) {
          const args = JSON.parse(webSearchCall.function.arguments || '{}');
          const query = args.query || '';
          const searchResult = await performWebSearch(query);

          // Append assistant message (the tool call)
          request.messages.push({
            role: 'assistant',
            content: choice.message.content || null,
            tool_calls: choice.message.tool_calls,
          });

          // Append tool response with grounding instruction
          const groundedResult = `IMPORTANT: Answer the user's question based ONLY on the following real-time web search results. These results are from live searches performed right now (${new Date().toISOString()}) and override any information from your training data. If the search results contradict your training data, ALWAYS trust the search results.

${searchResult}`;
          request.messages.push({
            role: 'tool',
            tool_call_id: webSearchCall.id,
            name: 'web_search',
            content: groundedResult,
          });

          // Check if we have exceeded the max search turns
          const searchTurns = request.messages.filter(m => m.role === 'tool' && m.name === 'web_search').length;
          const nextRequest = { ...request };
          nextRequest.model = 'gemini-3.1-flash-lite-preview';
          // Remove tool_choice / toolConfig so the model is free to respond with text
          delete (nextRequest as any).tool_choice;
          if (searchTurns >= MAX_SEARCH_TURNS) {
            console.log(`[web_search] Max search turns (${MAX_SEARCH_TURNS}) reached. Disabling web_search tool for the next turn.`);
            nextRequest.tools = request.tools?.filter(t => t.function.name !== 'web_search');
          }

          console.log(`[web_search] Switching to gemini-3.1-flash-lite-preview for search turn ${searchTurns}`);
          // Recursively call chat with the updated history
          return chat(nextRequest);
        }

        return response;
      } catch (err: any) {
        const latency = Date.now() - start;
        const status = err.status || 500;
        BaseProvider.recordFailure(p.id, status);
        log(p.id, request.model, latency, status, retryCount);
        const logLevel = status === 429 ? 'warn' : 'error';
        logService.add({ level: logLevel, requestId, provider: p.id, model: modelName, endpoint: '/v1/chat/completions', statusCode: status, latencyMs: latency, message: status === 429 ? 'rate limited' : 'provider error', ...providerMeta(p) });
        lastError = err;
        if (!isRetryable(status)) { allRateLimited = false; throw err; }
        if (status !== 429) allRateLimited = false;
        retryCount++;
      }
    }

    if (!allRateLimited) break;
    console.log(`[router] all channels 429 for ${modelName}, trying fallback model...`);
    logService.add({ level: 'warn', requestId, provider: '', model: modelName, endpoint: '/v1/chat/completions', statusCode: 429, latencyMs: 0, message: 'all providers rate limited, trying fallback' });
  }
  if (!anyResolved) {
    const err: any = new Error(`Model '${request.model}' is not available. No provider serves this model and no fallback chain is configured.`);
    err.status = 404;
    throw err;
  }
  throw lastError;
}

export async function* streamChat(request: ChatRequest): AsyncGenerator<StreamChunk> {
  const requestId = Math.random().toString(36).substring(2, 11);
  request.model = stripAnsi(request.model);
  claudeCodeRedirect(request);
  if (request.max_tokens && request.max_tokens > 32768) {
    request.max_tokens = 32768;
  }
  trimMessagesToFit(request.messages);
  logService.add({ level: 'info', requestId, provider: '', model: request.model, endpoint: '/v1/chat/completions', statusCode: 0, latencyMs: 0, message: 'incoming streaming request' });

  const modelsToTry = buildModelChain(request.model);

  let lastError: any;
  let anyResolved = false;
  for (const modelName of modelsToTry) {
    const resolved = registry.resolveModel(modelName);
    if (!resolved) continue;
    anyResolved = true;

    const { provider } = resolved;
    logService.add({ level: 'info', requestId, provider: provider.id, model: modelName, endpoint: '/v1/chat/completions', statusCode: 0, latencyMs: 0, message: 'provider selected', ...providerMeta(provider) });

    let retryCount = 0;
    const allProviders = [provider, ...registry.getFailoverProviders(modelName, provider.id)];
    const providers = filterCooledDown(allProviders);
    let allRateLimited = true;

    for (const p of providers) {
      const start = Date.now();
      try {
        const gen = p.stream({ ...request, model: modelName });
        
        let isWebSearch = false;
        let webSearchId = '';
        let webSearchArgs = '';
        let assistantText = '';
        const buffer: StreamChunk[] = [];
        
        for await (const chunk of gen) {
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            assistantText += delta.content;
          }
          if (delta?.tool_calls?.length) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name === 'web_search' || (webSearchId && !tc.function?.name)) {
                isWebSearch = true;
                if (tc.id) webSearchId = tc.id;
                if (tc.function?.arguments) webSearchArgs += tc.function.arguments;
              }
            }
          }
          buffer.push(chunk);
        }

        if (isWebSearch) {
          const latency = Date.now() - start;
          BaseProvider.recordSuccess(p.id, latency);
          log(p.id, request.model, latency, 200, retryCount);
          logService.add({ level: 'info', requestId, provider: p.id, model: modelName, endpoint: '/v1/chat/completions', statusCode: 200, latencyMs: latency, message: 'web search intercepted', ...providerMeta(p) });

          const query = JSON.parse(webSearchArgs || '{}').query || '';
          const searchResult = await performWebSearch(query);

          // Append assistant message (the tool call)
          request.messages.push({
            role: 'assistant',
            content: assistantText || null,
            tool_calls: [{
              id: webSearchId,
              type: 'function',
              function: {
                name: 'web_search',
                arguments: webSearchArgs,
              }
            }]
          });

          // Append tool response with grounding instruction
          const groundedResult = `IMPORTANT: Answer the user's question based ONLY on the following real-time web search results. These results are from live searches performed right now (${new Date().toISOString()}) and override any information from your training data. If the search results contradict your training data, ALWAYS trust the search results.

${searchResult}`;
          request.messages.push({
            role: 'tool',
            tool_call_id: webSearchId,
            name: 'web_search',
            content: groundedResult,
          });

          // Check if we have exceeded the max search turns
          const searchTurns = request.messages.filter(m => m.role === 'tool' && m.name === 'web_search').length;
          const nextRequest = { ...request };
          nextRequest.model = 'gemini-3.1-flash-lite-preview';
          // Remove tool_choice / toolConfig so the model is free to respond with text
          delete (nextRequest as any).tool_choice;
          if (searchTurns >= MAX_SEARCH_TURNS) {
            console.log(`[web_search] Max search turns (${MAX_SEARCH_TURNS}) reached. Disabling web_search tool for the next turn.`);
            nextRequest.tools = request.tools?.filter(t => t.function.name !== 'web_search');
          }

          console.log(`[web_search] Switching to gemini-3.1-flash-lite-preview for search turn ${searchTurns}`);
          // Recursively streamChat
          yield* streamChat(nextRequest);
          return;
        }

        // Normal path: yield all buffered chunks
        const latency = Date.now() - start;
        BaseProvider.recordSuccess(p.id, latency);
        log(p.id, request.model, latency, 200, retryCount);
        logService.add({ level: 'info', requestId, provider: p.id, model: modelName, endpoint: '/v1/chat/completions', statusCode: 200, latencyMs: latency, message: retryCount > 0 ? `success after ${retryCount} retries` : 'success', ...providerMeta(p) });

        for (const chunk of buffer) {
          yield chunk;
        }
        return;
      } catch (err: any) {
        const latency = Date.now() - start;
        const status = err.status || 500;
        BaseProvider.recordFailure(p.id, status);
        log(p.id, request.model, latency, status, retryCount);
        const logLevel = status === 429 ? 'warn' : 'error';
        logService.add({ level: logLevel, requestId, provider: p.id, model: modelName, endpoint: '/v1/chat/completions', statusCode: status, latencyMs: latency, message: status === 429 ? 'rate limited' : 'provider error', ...providerMeta(p) });
        lastError = err;
        if (!isRetryable(status)) { allRateLimited = false; throw err; }
        if (status !== 429) allRateLimited = false;
        retryCount++;
      }
    }

    if (!allRateLimited) break;
    console.log(`[router] all channels 429 for ${modelName}, trying fallback model...`);
    logService.add({ level: 'warn', requestId, provider: '', model: modelName, endpoint: '/v1/chat/completions', statusCode: 429, latencyMs: 0, message: 'all providers rate limited, trying fallback' });
  }
  if (!anyResolved) {
    const err: any = new Error(`Model '${request.model}' is not available. No provider serves this model and no fallback chain is configured.`);
    err.status = 404;
    throw err;
  }
  throw lastError;
}
