import { ClaudeCodeAdapter } from './claude-code';
import { ClaudeDesktopAdapter } from './claude-desktop';
import { createCodexCliAdapter } from './codex-cli';
import { createGeminiCliAdapter } from './gemini-cli';
import type { AppAdapter } from './types';

/**
 * The adapter registry. To support another application (for example
 * Cursor), implement `AppAdapter` in its own module, add locale strings
 * for its message codes, and register it here. Nothing else in the main
 * process or the renderer needs to change.
 */
export class AdapterRegistry {
  private readonly adapters: Map<string, AppAdapter>;

  constructor(adapters: readonly AppAdapter[]) {
    this.adapters = new Map();
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.id)) throw new Error(`Duplicate adapter ID: ${adapter.id}`);
      this.adapters.set(adapter.id, adapter);
    }
  }

  get(id: string): AppAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): AppAdapter[] {
    return [...this.adapters.values()];
  }
}

export function createDefaultRegistry(): AdapterRegistry {
  return new AdapterRegistry([
    new ClaudeCodeAdapter(),
    new ClaudeDesktopAdapter(),
    createCodexCliAdapter(),
    createGeminiCliAdapter(),
  ]);
}
