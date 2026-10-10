/**
 * Redaction applied to everything written to logs or diagnostics output.
 * The goal is defense in depth: Profile Switcher never intentionally logs
 * secrets, but anything that slips through (an error message echoing an
 * environment value, a tool's stderr) is scrubbed here.
 */

const SENSITIVE_KEY =
  /token|secret|password|passwd|cookie|credential|api[-_]?key|authorization|session|email/i;

const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, '[redacted-api-key]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-jwt]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]'],
  [
    /\b((?:ANTHROPIC|CLAUDE_CODE|OPENAI|AWS|GOOGLE|AZURE)[A-Z0-9_]*(?:KEY|TOKEN|SECRET)[A-Z0-9_]*)=\S+/g,
    '$1=[redacted]',
  ],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Redactor {
  text(value: string): string;
  value(value: unknown, depth?: number): unknown;
}

export function createRedactor(homeDir: string | null): Redactor {
  const homePattern =
    homeDir && homeDir.length > 1
      ? new RegExp(escapeRegExp(homeDir), process.platform === 'win32' ? 'gi' : 'g')
      : null;

  const text = (value: string): string => {
    let out = value;
    for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
    if (homePattern) out = out.replace(homePattern, '~');
    return out;
  };

  const redactValue = (value: unknown, depth = 0): unknown => {
    if (depth > 6) return '[truncated]';
    if (typeof value === 'string') return text(value);
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      value === undefined
    ) {
      return value;
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: text(value.message),
        code: (value as { code?: unknown }).code,
      };
    }
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactValue(item, depth + 1));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(item, depth + 1);
      }
      return out;
    }
    return String(value);
  };

  return { text, value: redactValue };
}
