import { z } from 'zod';

export interface ProviderCapabilities {
  tools: boolean;
  streaming: boolean;
  vision: boolean;
  embeddings: boolean;
  jsonMode: boolean;
  reasoning: boolean;
}

export interface DiscoveredModel {
  id: string;
  providerId: string;
  source: 'discovered' | 'custom' | 'dedicated';
}

export interface ProviderConfig {
  id: string;
  nickname?: string;
  type: 'groq' | 'gemini' | 'openrouter' | 'cloudflare' | 'openai-compatible';
  apiKey?: string;
  accountId?: string;
  baseUrl?: string;
  customModels?: string[];
  dedicatedModels?: string[];
  enabledModels?: string[];
}

export function defaultCapabilities(type: string): ProviderCapabilities {
  switch (type) {
    case 'groq':
      return { tools: true, streaming: true, vision: false, embeddings: false, jsonMode: false, reasoning: true };
    case 'gemini':
      return { tools: true, streaming: true, vision: true, embeddings: false, jsonMode: false, reasoning: true };
    case 'openrouter':
      return { tools: true, streaming: true, vision: true, embeddings: false, jsonMode: true, reasoning: true };
    case 'cloudflare':
      return { tools: false, streaming: true, vision: false, embeddings: false, jsonMode: false, reasoning: false };
    case 'openai-compatible':
      return { tools: true, streaming: true, vision: true, embeddings: true, jsonMode: true, reasoning: true };
    default:
      return { tools: true, streaming: true, vision: false, embeddings: false, jsonMode: false, reasoning: false };
  }
}

export interface RoutingConfig {
  mode: 'priority' | 'round-robin' | 'random';
  providers: ProviderConfig[];
}

export interface ApiKeyConfig {
  key: string;
  allowedModels?: string[];
}

export interface SecurityConfig {
  apiKeys: ApiKeyConfig[];
  adminKey?: string;
}

export interface AppConfig {
  listen: { port: number; host?: string };
  security: SecurityConfig;
  routing: RoutingConfig;
  aliases?: Record<string, string[]>;
  fallbackChains?: Record<string, string[]>;
  claudeCode?: {
    enabled?: boolean;
    target?: string;
    fallbacks?: string[];
  };
  webSearch?: {
    tavilyApiKey?: string;
    braveApiKey?: string;
    searxngUrl?: string;
  };
}

export interface HealthStatus {
  healthy: boolean;
  latency: number;
  successCount: number;
  failureCount: number;
  rateLimitCount: number;
  lastFailure: number | null;
}

export interface MultimodalPart {
  type: 'text' | 'image' | 'document';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  multimodal_content?: MultimodalPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  extra_content?: any;
}

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
  extra_content: z.any().optional(),
});

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: Tool[];
  tool_choice?: string | { type: string; function?: { name: string } };
  parallel_tool_calls?: boolean;
}

export const MultimodalPartSchema = z.object({
  type: z.enum(['text', 'image', 'document']),
  text: z.string().optional(),
  source: z.object({
    type: z.literal('base64'),
    media_type: z.string(),
    data: z.string(),
  }).optional(),
});

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullish(),
  multimodal_content: z.array(MultimodalPartSchema).optional(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
});

export interface Tool {
  type: 'function';
  function: { name: string; description?: string; parameters?: any };
}

export const ToolSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.any().optional(),
  }),
});

export const ChatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().optional(),
  max_tokens: z.number().int().optional(),
  stream: z.boolean().optional(),
  tools: z.array(ToolSchema).optional(),
  tool_choice: z.union([
    z.string(),
    z.object({
      type: z.string(),
      function: z.object({
        name: z.string(),
      }).optional(),
    }),
  ]).optional(),
  parallel_tool_calls: z.boolean().optional(),
});

export interface ChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Choice[];
  usage?: Usage;
}

export interface Choice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ProviderModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: StreamChoice[];
}

export interface StreamChoice {
  index: number;
  delta: Partial<ChatMessage> & { tool_calls?: { index: number; id?: string; type?: string; function?: { name: string; arguments: string }; extra_content?: any }[] };
  finish_reason: string | null;
}
