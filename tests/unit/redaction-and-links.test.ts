import { describe, expect, it } from 'vitest';
import { createRedactor } from '../../src/main/diagnostics/redact';
import { resolveExternalLink } from '../../src/main/external-links';
import { EXTERNAL_LINKS, LINK_IDS, type LinkId } from '../../src/shared/links';

describe('redactor', () => {
  const redactor = createRedactor('/home/ana');

  it('scrubs API keys, bearer tokens, JWTs, emails, and KEY=value pairs', () => {
    const text = redactor.text(
      'key sk-ant-api03-AbCdEf123456 auth Bearer abcdefghijklmnop jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2 mail ana@example.com ANTHROPIC_API_KEY=xyz CLAUDE_CODE_OAUTH_TOKEN=abc',
    );
    expect(text).not.toMatch(/sk-ant-api03|abcdefghijklmnop|eyJhbGci|ana@example\.com|=xyz|=abc/);
    expect(text).toContain('[redacted-api-key]');
    expect(text).toContain('ANTHROPIC_API_KEY=[redacted]');
  });

  it('replaces the home directory with ~', () => {
    expect(redactor.text('/home/ana/.config/profile-switcher')).toBe('~/.config/profile-switcher');
  });

  it('redacts sensitive keys in structured values recursively', () => {
    expect(
      redactor.value({
        token: 'x',
        nested: { apiKey: 'y', cookie: 'z', path: '/home/ana/a' },
        list: ['sk-ant-1234567890'],
      }),
    ).toEqual({
      token: '[redacted]',
      nested: { apiKey: '[redacted]', cookie: '[redacted]', path: '~/a' },
      list: ['[redacted-api-key]'],
    });
  });

  it('reduces errors to name, redacted message, and code', () => {
    const error = Object.assign(new Error('failed for /home/ana/x with sk-ant-abcdefgh123'), {
      code: 'EACCES',
    });
    expect(redactor.value(error)).toEqual({
      name: 'Error',
      message: 'failed for ~/x with [redacted-api-key]',
      code: 'EACCES',
    });
  });
});

describe('external links', () => {
  it('resolves every allow-listed ID to an https URL on an allowed host', () => {
    for (const id of LINK_IDS) {
      const url = new URL(resolveExternalLink(id));
      expect(url.protocol).toBe('https:');
      expect(['github.com', 'code.claude.com', 'claude.ai']).toContain(url.hostname);
    }
    expect(resolveExternalLink('repository')).toBe(EXTERNAL_LINKS.repository);
  });

  it('rejects unknown IDs, including prototype keys', () => {
    for (const id of [
      'constructor',
      '__proto__',
      'toString',
      'file:///etc/passwd',
      'https://evil.example',
    ]) {
      expect(() => resolveExternalLink(id as LinkId)).toThrow(
        expect.objectContaining({ appError: { code: 'LINK_NOT_ALLOWED' } }),
      );
    }
  });
});
