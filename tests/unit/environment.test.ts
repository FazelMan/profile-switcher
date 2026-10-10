import { describe, expect, it } from 'vitest';
import {
  activeProviderVariables,
  applyEnvChanges,
  CLAUDE_CREDENTIAL_OVERRIDE_VARS,
  presentVariables,
} from '../../src/main/launch/environment';

describe('applyEnvChanges', () => {
  const base = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/ana',
    LANG: 'de_DE.UTF-8',
    EDITOR: 'vim',
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    CLAUDE_CONFIG_DIR: '/old',
    UNDEFINED_VALUE: undefined,
  };

  it('sets, unsets, and leaves every unrelated variable untouched', () => {
    const env = applyEnvChanges(
      base,
      {
        set: { CLAUDE_CONFIG_DIR: '/profiles/work' },
        unset: ['ANTHROPIC_API_KEY'],
        prependPath: [],
      },
      'linux',
    );
    expect(env.CLAUDE_CONFIG_DIR).toBe('/profiles/work');
    expect('ANTHROPIC_API_KEY' in env).toBe(false);
    expect(env.LANG).toBe('de_DE.UTF-8');
    expect(env.EDITOR).toBe('vim');
    expect(env.HOME).toBe('/home/ana');
    expect(env.PATH).toBe('/usr/bin:/bin');
    expect('UNDEFINED_VALUE' in env).toBe(false);
  });

  it('does not mutate the source environment', () => {
    const source = { ...base };
    applyEnvChanges(
      source,
      { set: { X: '1' }, unset: ['HOME'], prependPath: ['/opt/bin'] },
      'linux',
    );
    expect(source).toEqual(base);
  });

  it('prepends PATH directories once', () => {
    const env = applyEnvChanges(
      { PATH: '/usr/bin:/opt/claude/bin:/bin' },
      { set: {}, unset: [], prependPath: ['/opt/claude/bin'] },
      'linux',
    );
    expect(env.PATH).toBe('/opt/claude/bin:/usr/bin:/bin');
  });

  it('treats variable names case-insensitively on Windows', () => {
    const env = applyEnvChanges(
      {
        Path: 'C:\\Windows',
        anthropic_api_key: 'secret',
        Claude_Config_Dir: 'C:\\old',
        Other: 'kept',
      },
      {
        set: { CLAUDE_CONFIG_DIR: 'C:\\profiles\\work' },
        unset: ['ANTHROPIC_API_KEY'],
        prependPath: ['C:\\Tools'],
      },
      'win32',
    );
    expect(env).toEqual({
      Path: 'C:\\Tools;C:\\Windows',
      CLAUDE_CONFIG_DIR: 'C:\\profiles\\work',
      Other: 'kept',
    });
  });

  it('is case-sensitive on POSIX', () => {
    const env = applyEnvChanges(
      { anthropic_api_key: 'x' },
      { set: {}, unset: ['ANTHROPIC_API_KEY'], prependPath: [] },
      'linux',
    );
    expect(env.anthropic_api_key).toBe('x');
  });
});

describe('environment findings', () => {
  it('reports names of credential overrides that are present and non-empty, never values', () => {
    const names = presentVariables(
      { ANTHROPIC_API_KEY: 'sk-ant-x', CLAUDE_CODE_OAUTH_TOKEN: '', ANTHROPIC_AUTH_TOKEN: 'y' },
      CLAUDE_CREDENTIAL_OVERRIDE_VARS,
      'linux',
    );
    expect(names).toEqual(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']);
    expect(JSON.stringify(names)).not.toContain('sk-ant');
  });

  it('treats provider switches as active only when truthy', () => {
    expect(activeProviderVariables({ CLAUDE_CODE_USE_BEDROCK: '1' }, 'linux')).toEqual([
      'CLAUDE_CODE_USE_BEDROCK',
    ]);
    expect(
      activeProviderVariables(
        { CLAUDE_CODE_USE_BEDROCK: '0', CLAUDE_CODE_USE_VERTEX: 'false' },
        'linux',
      ),
    ).toEqual([]);
    expect(activeProviderVariables({ ANTHROPIC_FEDERATION_RULE_ID: 'rule' }, 'linux')).toEqual([
      'ANTHROPIC_FEDERATION_RULE_ID',
    ]);
    expect(activeProviderVariables({ claude_code_use_vertex: 'true' }, 'win32')).toEqual([
      'CLAUDE_CODE_USE_VERTEX',
    ]);
  });
});
