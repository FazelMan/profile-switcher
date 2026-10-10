/**
 * Builds the environment for a launched application without leaking or
 * clobbering unrelated variables: the parent environment is copied, only the
 * named variables are set or removed, and nothing else changes.
 */

/**
 * Variables that supply a credential directly and outrank a configuration
 * directory's stored sign-in in Claude Code's documented authentication
 * precedence. Left in place, they would make every profile use the same
 * account regardless of CLAUDE_CONFIG_DIR.
 * Source: https://code.claude.com/docs/en/authentication#authentication-precedence
 */
export const CLAUDE_CREDENTIAL_OVERRIDE_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
  'CLAUDE_CODE_OAUTH_SCOPES',
  'ANTHROPIC_PROFILE',
] as const;

/**
 * Variables that switch Claude Code to another provider or credential
 * system. They are not removed (that would change how the user's tooling
 * works), but their presence means account isolation does not apply.
 */
export const CLAUDE_PROVIDER_OVERRIDE_VARS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_FEDERATION_RULE_ID',
] as const;

export type EnvMap = Record<string, string>;

export interface EnvChanges {
  set: Readonly<Record<string, string>>;
  unset: readonly string[];
  /** Directories prepended to PATH (deduplicated). */
  prependPath: readonly string[];
}

function findKey(env: EnvMap, name: string, caseInsensitive: boolean): string | undefined {
  if (!caseInsensitive) return name in env ? name : undefined;
  const lower = name.toLowerCase();
  return Object.keys(env).find((key) => key.toLowerCase() === lower);
}

export function cloneEnv(source: Readonly<Record<string, string | undefined>>): EnvMap {
  const out: EnvMap = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

/** Names of the given variables present (non-empty) in `env`. Values are never returned. */
export function presentVariables(
  env: Readonly<Record<string, string | undefined>>,
  names: readonly string[],
  platform: NodeJS.Platform,
): string[] {
  const map = cloneEnv(env);
  return names.filter((name) => {
    const key = findKey(map, name, platform === 'win32');
    return key !== undefined && map[key] !== '';
  });
}

/**
 * A variable whose presence changes how an application authenticates.
 * `non-empty`: any non-empty value counts; `truthy`: any value except empty,
 * "0", or "false"; `true`: only the literal "true" (case-insensitive).
 */
export interface EnvSwitch {
  name: string;
  active: 'non-empty' | 'truthy' | 'true';
}

/** Names of the switches that are active in `env`. Values are never returned. */
export function activeVariables(
  env: Readonly<Record<string, string | undefined>>,
  switches: readonly EnvSwitch[],
  platform: NodeJS.Platform,
): string[] {
  const map = cloneEnv(env);
  return switches
    .filter(({ name, active }) => {
      const key = findKey(map, name, platform === 'win32');
      if (key === undefined) return false;
      const value = map[key] ?? '';
      if (active === 'non-empty') return value !== '';
      if (active === 'true') return value.trim().toLowerCase() === 'true';
      return isTruthyEnv(value);
    })
    .map(({ name }) => name);
}

export const CLAUDE_PROVIDER_SWITCHES: readonly EnvSwitch[] = CLAUDE_PROVIDER_OVERRIDE_VARS.map(
  (name) => ({
    name,
    active: name === 'ANTHROPIC_FEDERATION_RULE_ID' ? ('non-empty' as const) : ('truthy' as const),
  }),
);

/** Provider variables that are actually enabled (e.g. CLAUDE_CODE_USE_BEDROCK=1). */
export function activeProviderVariables(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
): string[] {
  return activeVariables(env, CLAUDE_PROVIDER_SWITCHES, platform);
}

export function applyEnvChanges(
  base: Readonly<Record<string, string | undefined>>,
  changes: EnvChanges,
  platform: NodeJS.Platform,
): EnvMap {
  // Windows environment names are case-insensitive; `Path` and `PATH` are the
  // same variable there.
  const caseInsensitive = platform === 'win32';
  const normalize = (name: string) => (caseInsensitive ? name.toLowerCase() : name);
  const removed = new Set([...changes.unset, ...Object.keys(changes.set)].map(normalize));

  const entries = Object.entries(cloneEnv(base)).filter(([key]) => !removed.has(normalize(key)));
  entries.push(...Object.entries(changes.set));
  const env: EnvMap = Object.fromEntries(entries);

  if (changes.prependPath.length > 0) {
    const delimiter = platform === 'win32' ? ';' : ':';
    const pathKey = findKey(env, 'PATH', caseInsensitive) ?? 'PATH';
    const current = (env[pathKey] ?? '').split(delimiter).filter(Boolean);
    const wanted = [...new Set(changes.prependPath)];
    const rest = current.filter(
      (entry) => !wanted.some((dir) => normalize(dir) === normalize(entry)),
    );
    env[pathKey] = [...wanted, ...rest].join(delimiter);
  }

  return env;
}
