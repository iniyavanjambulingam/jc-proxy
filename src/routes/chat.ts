import { FastifyInstance } from 'fastify';
import { chat, streamChat } from '../router.js';
import { authenticate } from '../auth.js';
import { formatSSE, SSE_DONE } from '../utils/stream.js';
import { ChatRequest, ChatRequestSchema } from '../types.js';
import { logService } from '../services/logService.js';

export async function chatRoutes(app: FastifyInstance) {
  app.post('/v1/chat/completions', { preHandler: authenticate }, async (request, reply) => {
    const parseResult = ChatRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      logService.add({ level: 'error', requestId: '', provider: '', model: '', endpoint: '/v1/chat/completions', statusCode: 400, latencyMs: 0, message: `validation error: ${parseResult.error.message}` });
      return reply.status(400).send({
        error: {
          message: parseResult.error.message,
          type: 'invalid_request_error',
          code: 400,
        },
      });
    }

    const body: ChatRequest = parseResult.data;
    const apiKeyConfig = (request as any).apiKeyConfig as { key: string, allowedModels?: string[] };
    
    if (apiKeyConfig.allowedModels && apiKeyConfig.allowedModels.length > 0) {
      if (!apiKeyConfig.allowedModels.includes(body.model)) {
        return reply.status(403).send({
          error: {
            message: `Model '${body.model}' is not allowed for this API key`,
            type: 'invalid_request_error',
            code: 403,
          },
        });
      }
    }

    if (body.stream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      try {
        for await (const chunk of streamChat(body)) {
          reply.raw.write(formatSSE(chunk));
        }
        reply.raw.write(SSE_DONE);
      } catch (err: any) {
        const error = {
          error: {
            message: err.body?.error?.message || 'Provider error',
            type: 'provider_error',
            code: err.status || 500,
          },
        };
        reply.raw.write(`data: ${JSON.stringify(error)}\n\n`);
      }
      reply.raw.end();
      return;
    }

    try {
      const response = await chat(body);
      return response;
    } catch (err: any) {
      if (err.status === 400) {
        console.error('[chat] 400 error from provider:', JSON.stringify(err.body || err, null, 2));
      }
      logService.add({ level: 'error', requestId: '', provider: '', model: body.model, endpoint: '/v1/chat/completions', statusCode: err.status || 500, latencyMs: 0, message: err.body?.error?.message || 'provider error' });
      reply.status(err.status || 500).send({
        error: {
          message: err.body?.error?.message || err.body?.message || JSON.stringify(err.body) || 'Provider error',
          type: 'provider_error',
          code: err.status || 500,
        },
      });
    }
  });
}
