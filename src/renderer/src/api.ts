import type { ProfileSwitcherApi } from '@shared/ipc';

declare global {
  interface Window {
    profileSwitcher?: ProfileSwitcherApi;
  }
}

/** The preload bridge. Components receive it through context so tests can supply a fake. */
export function getBridge(): ProfileSwitcherApi {
  const api = window.profileSwitcher;
  if (!api) throw new Error('Profile Switcher bridge is not available');
  return api;
}
