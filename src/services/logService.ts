import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId: string;
  provider: string;
  providerNickname?: string;
  providerType?: string;
  model: string;
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  message: string;
}

interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byProvider: Record<string, number>;
  byStatusCode: Record<number, number>;
  avgLatency: number;
}

// ── Storage backends ─────────────────────────────────────────────────────────

export interface LogStorage {
  write(entries: LogEntry[]): void | Promise<void>;
  read(limit?: number): LogEntry[];
  clear(): void;
}

export class MemoryLogStorage implements LogStorage {
  private buffer: LogEntry[];
  private maxSize: number;
  private head = 0;
  private count = 0;

  constructor(maxSize = 1000) {
    this.buffer = new Array(maxSize);
    this.maxSize = maxSize;
  }

  write(entries: LogEntry[]): void {
    for (const entry of entries) {
      this.buffer[this.head] = entry;
      this.head = (this.head + 1) % this.maxSize;
      if (this.count < this.maxSize) this.count++;
    }
  }

  read(limit?: number): LogEntry[] {
    const result: LogEntry[] = [];
    const n = limit !== undefined ? Math.min(limit, this.count) : this.count;
    for (let i = 0; i < n; i++) {
      const idx = (this.head - 1 - i + this.maxSize) % this.maxSize;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

export class JsonlLogStorage implements LogStorage {
  private logDir: string;

  constructor(logDir = 'logs') {
    this.logDir = logDir;
  }

  async write(entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await mkdir(this.logDir, { recursive: true });

    const byDate = new Map<string, LogEntry[]>();
    for (const entry of entries) {
      const date = entry.timestamp.slice(0, 10);
      let list = byDate.get(date);
      if (!list) {
        list = [];
        byDate.set(date, list);
      }
      list.push(entry);
    }

    for (const [date, dateEntries] of byDate) {
      const filePath = join(this.logDir, `${date}.jsonl`);
      const lines = dateEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await appendFile(filePath, lines, 'utf-8');
    }
  }

  read(): LogEntry[] {
    return [];
  }

  clear(): void {}
}

// ── Service ──────────────────────────────────────────────────────────────────

class LogService {
  private memory: MemoryLogStorage;
  private disk: JsonlLogStorage | null;
  private pending: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(memory?: MemoryLogStorage, disk?: JsonlLogStorage) {
    this.memory = memory ?? new MemoryLogStorage();
    this.disk = disk ?? null;
  }

  add(entry: Omit<LogEntry, 'timestamp'>): void {
    const full: LogEntry = { ...entry, timestamp: new Date().toISOString() };
    this.memory.write([full]);
    this.pending.push(full);
  }

  getRecent(limit?: number): LogEntry[] {
    return this.memory.read(limit);
  }

  clear(): void {
    this.memory.clear();
    this.pending.length = 0;
  }

  stats(): LogStats {
    const entries = this.memory.read();
    const byLevel: Record<LogLevel, number> = { info: 0, warn: 0, error: 0, debug: 0 };
    const byProvider: Record<string, number> = {};
    const byStatusCode: Record<number, number> = {};
    let totalLatency = 0;

    for (const e of entries) {
      byLevel[e.level]++;
      byProvider[e.provider] = (byProvider[e.provider] || 0) + 1;
      byStatusCode[e.statusCode] = (byStatusCode[e.statusCode] || 0) + 1;
      totalLatency += e.latencyMs;
    }

    return {
      total: entries.length,
      byLevel,
      byProvider,
      byStatusCode,
      avgLatency: entries.length > 0 ? totalLatency / entries.length : 0,
    };
  }

  startFlushTimer(intervalMs = 60_000): void {
    if (this.flushTimer || !this.disk) return;
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => console.error('[logService] flush error:', err.message));
    }, intervalMs);
  }

  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async flush(): Promise<void> {
    if (!this.disk || this.pending.length === 0) return;
    const entries = this.pending.splice(0);
    await this.disk.write(entries);
  }
}

export const logService = new LogService();
