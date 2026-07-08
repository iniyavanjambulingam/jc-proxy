import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LogEntry {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  latency: number;
  status: number;
  retryCount?: number;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 1000;
const LOG_FILE_PATH = 'data/requests.jsonl';

export function log(provider: string, model: string, latency: number, status: number, retryCount?: number) {
  const retry = retryCount ? ` retry:${retryCount}` : '';
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${provider} ${model} ${latency}ms ${status}${retry}`);

  const entry: LogEntry = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp,
    provider,
    model,
    latency,
    status,
    retryCount,
  };

  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  try {
    mkdirSync(dirname(LOG_FILE_PATH), { recursive: true });
    appendFileSync(LOG_FILE_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error('[logger] Failed to write log to file:', err);
  }
}

export function getLogs(): LogEntry[] {
  // Return a copy, sorted newest first
  return [...logs].reverse();
}

export function clearLogs(): void {
  logs.length = 0;
}

