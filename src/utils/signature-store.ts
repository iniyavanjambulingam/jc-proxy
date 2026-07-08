import { promises as fs } from 'fs';
import path from 'path';

const STORE_PATH = process.env.SIGNATURE_STORE_PATH || '/app/data/thought-signatures.json';
const TTL_MS = 60 * 60 * 1000; // 1 hour

interface Entry {
  value: string;
  expiresAt: number;
}

export class SignatureStore {
  private cache = new Map<string, Entry>();
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load().catch(() => {}); // non-blocking — fail silently if file missing
    // Flush dirty writes every 5 seconds
    setInterval(() => { if (this.dirty) this.save().catch(() => {}); }, 5000);
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.dirty = true;
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: string) {
    this.cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    this.dirty = true;
  }

  delete(key: string) {
    this.cache.delete(key);
    this.dirty = true;
  }

  private async load() {
    try {
      const raw = await fs.readFile(STORE_PATH, 'utf-8');
      const data: Record<string, Entry> = JSON.parse(raw);
      const now = Date.now();
      for (const [k, v] of Object.entries(data)) {
        if (v.expiresAt > now) this.cache.set(k, v); // skip expired
      }
      console.log(`[SignatureStore] loaded ${this.cache.size} entries from ${STORE_PATH}`);
    } catch {
      // File doesn't exist yet — that's fine
    }
  }

  private async save() {
    this.dirty = false;
    try {
      await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
      const data: Record<string, Entry> = {};
      for (const [k, v] of this.cache.entries()) {
        if (Date.now() < v.expiresAt) data[k] = v;
      }
      await fs.writeFile(STORE_PATH, JSON.stringify(data), 'utf-8');
    } catch (e) {
      console.warn('[SignatureStore] save failed:', e);
    }
  }
}
