import { AppFailure } from '@shared/domain/errors';
import { ALLOWED_LINK_HOSTS, EXTERNAL_LINKS, type LinkId } from '@shared/links';

/**
 * Resolves an allow-listed link ID to a URL and re-checks it. The renderer
 * can only name a link; it can never supply a URL, so `shell.openExternal`
 * is never reachable with attacker-controlled input (e.g. `file:` or custom
 * protocol handlers).
 */
export function resolveExternalLink(id: LinkId): string {
  const raw: string | undefined = Object.hasOwn(EXTERNAL_LINKS, id)
    ? EXTERNAL_LINKS[id]
    : undefined;
  if (!raw) throw new AppFailure('LINK_NOT_ALLOWED');
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    !ALLOWED_LINK_HOSTS.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new AppFailure('LINK_NOT_ALLOWED');
  }
  return url.toString();
}
