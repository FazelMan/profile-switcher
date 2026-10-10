import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { en } from '../../src/renderer/src/i18n/en';
import { format } from '../../src/renderer/src/i18n';
import { ERROR_CODES } from '../../src/shared/domain/errors';
import { MESSAGE_CODES } from '../../src/shared/domain/messages';
import { createFakeApi, desktopReport, makeProfile, makeSnapshot } from './fake-api';

function renderApp(api = createFakeApi()) {
  const user = userEvent.setup();
  render(<App api={api} />);
  return { api, user };
}

describe('first run', () => {
  it('creates Personal and Work template profiles with managed folders', async () => {
    const { api, user } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Create Personal and Work' }));

    await waitFor(() => expect(api.createProfile).toHaveBeenCalledTimes(2));
    expect(api.createProfile.mock.calls.map(([input]) => [input.name, input.storage])).toEqual([
      ['Personal', { kind: 'managed' }],
      ['Work', { kind: 'managed' }],
    ]);
    expect(await screen.findAllByTestId('profile-card')).toHaveLength(2);
    expect(screen.getByText('Created Personal and Work profiles.')).toBeInTheDocument();
  });

  it('only offers templates for applications with documented isolation', async () => {
    renderApp();
    const group = await screen.findByRole('group', { name: 'Application' });
    expect(within(group).getByText('Claude Code')).toBeInTheDocument();
    expect(within(group).queryByText('Claude Desktop')).not.toBeInTheDocument();
  });
});

describe('profile form', () => {
  it('validates names before calling the main process', async () => {
    const api = createFakeApi(makeSnapshot({ profiles: [makeProfile({ name: 'Work' })] }));
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'New profile' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create profile' }));
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Name'), ' work ');
    await user.click(within(dialog).getByRole('button', { name: 'Create profile' }));
    expect(
      within(dialog).getByText('Another Claude Code profile already uses this name.'),
    ).toBeInTheDocument();
    expect(api.createProfile).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before using a non-empty custom folder', async () => {
    const api = createFakeApi();
    api.chooseDirectory.mockResolvedValue({
      ok: true,
      value: { path: '/data/existing', exists: true, isEmpty: false },
    });
    api.createProfile.mockResolvedValueOnce({ ok: false, error: { code: 'DIRECTORY_NOT_EMPTY' } });
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'New profile' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Client A');
    await user.click(within(dialog).getByLabelText(/A folder I choose/));
    await user.click(within(dialog).getByRole('button', { name: 'Choose profile folder' }));
    const confirm = await within(dialog).findByLabelText(
      /Use this folder even though it already contains files/,
    );
    expect(confirm).not.toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Create profile' }));
    expect(
      await within(dialog).findByText('The folder already contains files'),
    ).toBeInTheDocument();
    expect(api.createProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        storage: { kind: 'custom', path: '/data/existing', allowNonEmpty: false },
      }),
    );

    await user.click(confirm);
    await user.click(within(dialog).getByRole('button', { name: 'Create profile' }));
    await waitFor(() =>
      expect(api.createProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          storage: { kind: 'custom', path: '/data/existing', allowNonEmpty: true },
        }),
      ),
    );
  });

  it('locks the application and folder when editing', async () => {
    const api = createFakeApi(makeSnapshot({ profiles: [makeProfile()] }));
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Edit: Work' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/cannot be changed after creation/)).toBeInTheDocument();
    for (const radio of within(dialog).getAllByRole('radio', { name: /Claude/ }))
      expect(radio).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Client B');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'work-abc234', name: 'Client B' }),
      ),
    );
  });
});

describe('deleting', () => {
  it('explains that the folder is kept and deletes only after confirmation', async () => {
    const api = createFakeApi(makeSnapshot({ profiles: [makeProfile()] }));
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Delete: Work' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/is NOT deleted/)).toBeInTheDocument();
    expect(within(dialog).getByText('/data/profiles/claude-code/work-abc234')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete: Work' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete profile' }),
    );
    await waitFor(() => expect(api.deleteProfile).toHaveBeenCalledWith('work-abc234'));
    expect(
      await screen.findByText('Deleted "Work". Its folder was kept on disk.'),
    ).toBeInTheDocument();
  });
});

describe('compatibility presentation', () => {
  it('never labels shared profiles as isolated', async () => {
    const shared = makeProfile({
      id: 'default-1',
      name: 'Default',
      storage: { kind: 'app-default' },
      dataDirectory: null,
      compatibility: {
        ...desktopReport,
        state: 'Supported',
        summary: { code: 'compat.claudeCode.shared.summary' },
      },
    });
    const desktop = makeProfile({
      id: 'desk-1',
      name: 'Desk',
      appId: 'claude-desktop',
      storage: { kind: 'app-default' },
      dataDirectory: null,
      compatibility: desktopReport,
    });
    renderApp(createFakeApi(makeSnapshot({ profiles: [shared, desktop] })));

    const cards = await screen.findAllByTestId('profile-card');
    expect(within(cards[0]!).getByText('Shared · not isolated')).toBeInTheDocument();
    expect(within(cards[0]!).queryByText('Isolated')).not.toBeInTheDocument();
    expect(within(cards[1]!).getByText('Unsupported')).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('button', { name: 'Open (shared)' })).toBeEnabled();
  });

  it('shows what is and is not guaranteed, without verification for Claude Desktop', async () => {
    const desktop = makeProfile({
      id: 'desk-1',
      name: 'Desk',
      appId: 'claude-desktop',
      storage: { kind: 'app-default' },
      dataDirectory: null,
      compatibility: desktopReport,
    });
    const { user } = renderApp(createFakeApi(makeSnapshot({ profiles: [desktop] })));
    await user.click(await screen.findByRole('button', { name: 'Details: Desk' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(en.messages['compat.claudeDesktop.limitation.noIsolation']),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
  });

  it('shows verification results reported by the application', async () => {
    const { api, user } = renderApp(createFakeApi(makeSnapshot({ profiles: [makeProfile()] })));
    await user.click(await screen.findByRole('button', { name: 'Details: Work' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(/Configuration isolation confirmed/)).toBeInTheDocument();
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(api.verifyProfile).toHaveBeenCalledWith('work-abc234');
  });

  it('disables launch when the application is not installed', async () => {
    const missing = makeProfile({
      compatibility: {
        state: 'ApplicationNotFound',
        launch: { available: false, isolation: 'isolated' },
        summary: { code: 'compat.appNotFound.summary', params: { app: 'Claude Code' } },
        guarantees: [],
        limitations: [],
        guidance: [],
      },
    });
    renderApp(createFakeApi(makeSnapshot({ profiles: [missing] })));
    expect(await screen.findByRole('button', { name: 'Launch' })).toBeDisabled();
    expect(screen.getByText('Not installed')).toBeInTheDocument();
  });
});

describe('running state', () => {
  it('shows Running only for confirmed instances and lists them in details', async () => {
    const personal = makeProfile({ id: 'personal-1', name: 'Personal' });
    const work = makeProfile({ id: 'work-1', name: 'Work' });
    const runtime = {
      'personal-1': [
        {
          launchId: 'aaaaaaaaaaaa',
          pid: 4321,
          startedAt: new Date().toISOString(),
          state: 'running' as const,
          configDirectory: 'verified' as const,
        },
      ],
      'work-1': [
        {
          launchId: 'bbbbbbbbbbbb',
          pid: null,
          startedAt: new Date().toISOString(),
          state: 'unconfirmed' as const,
          configDirectory: 'not-checked' as const,
        },
      ],
    };
    const { user } = renderApp(
      createFakeApi(makeSnapshot({ profiles: [personal, work], runtime })),
    );
    const [personalCard, workCard] = await screen.findAllByTestId('profile-card');
    expect(within(personalCard!).getByTestId('runtime-indicator')).toHaveTextContent(
      'Running · folder confirmed',
    );
    expect(within(workCard!).getByTestId('runtime-indicator')).toHaveTextContent(
      'Launched — not confirmed running',
    );
    expect(within(workCard!).queryByText('Running')).not.toBeInTheDocument();
    // Launch stays available while the profile is running: instances are independent.
    expect(within(personalCard!).getByRole('button', { name: 'Launch' })).toBeEnabled();

    await user.click(within(personalCard!).getByRole('button', { name: 'Details: Personal' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/PID 4321/)).toBeInTheDocument();
    expect(
      within(dialog).getByText('Folder confirmed from the running process'),
    ).toBeInTheDocument();
  });

  it('warns loudly if a running process reports a different folder', async () => {
    const profile = makeProfile();
    const runtime = {
      [profile.id]: [
        {
          launchId: 'aaaaaaaaaaaa',
          pid: 1,
          startedAt: new Date().toISOString(),
          state: 'running' as const,
          configDirectory: 'mismatch' as const,
        },
      ],
    };
    renderApp(createFakeApi(makeSnapshot({ profiles: [profile], runtime })));
    expect(await screen.findByTestId('runtime-indicator')).toHaveTextContent(
      'Running with a different configuration folder',
    );
  });
});

describe('launching', () => {
  it('reports what failed, why, and what to do next', async () => {
    const api = createFakeApi(makeSnapshot({ profiles: [makeProfile()] }));
    api.launchProfile.mockResolvedValueOnce({ ok: false, error: { code: 'TERMINAL_NOT_FOUND' } });
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Launch' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.errors.TERMINAL_NOT_FOUND.title);
    expect(alert).toHaveTextContent(en.errors.TERMINAL_NOT_FOUND.reason);
    expect(alert).toHaveTextContent(en.errors.TERMINAL_NOT_FOUND.next);
  });

  it('copies the launch command instead when that is the configured behavior', async () => {
    const api = createFakeApi(
      makeSnapshot({
        profiles: [makeProfile()],
        settings: { ...makeSnapshot().settings, cliLaunchBehavior: 'copy-command' },
      }),
    );
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Copy command' }));
    await waitFor(() => expect(api.copyLaunchCommand).toHaveBeenCalledWith('work-abc234', 'posix'));
    expect(api.launchProfile).not.toHaveBeenCalled();
  });
});

describe('read-only and notices', () => {
  it('disables changes when metadata comes from a newer version', async () => {
    renderApp(
      createFakeApi(
        makeSnapshot({
          readOnly: true,
          profiles: [makeProfile()],
          notices: [{ code: 'notice.metadataNewerSchema', params: { version: 2 } }],
        }),
      ),
    );
    expect(
      await screen.findByText(/saved by a newer version of Profile Switcher \(format 2\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit: Work' })).toBeDisabled();
  });
});

describe('locale catalog', () => {
  it('translates every message and error code', () => {
    for (const code of MESSAGE_CODES) expect(en.messages[code].length).toBeGreaterThan(0);
    for (const code of ERROR_CODES) {
      const text = en.errors[code];
      expect(text.title && text.reason && text.next).toBeTruthy();
    }
  });

  it('interpolates parameters and leaves unknown placeholders visible', () => {
    expect(format('Hello {name}', { name: 'Ana' })).toBe('Hello Ana');
    expect(format('Hello {missing}', {})).toBe('Hello {missing}');
  });
});

describe('Switch mode', () => {
  const personal = makeProfile({ id: 'personal-aaa234', name: 'Personal', color: 'blue' });
  const work = makeProfile({ id: 'work-abc234', name: 'Work' });

  function switchApi() {
    const api = createFakeApi(
      makeSnapshot({
        profiles: [personal, work],
        settings: { ...makeSnapshot().settings, launchModes: { 'claude-code': 'switch' } },
      }),
    );
    api.launchProfile.mockResolvedValueOnce({
      ok: true,
      value: {
        kind: 'confirm-switch',
        running: [{ profileId: personal.id, launchId: 'aaaaaaaaaaaa', pid: 4321 }],
        untrackedProfileIds: [],
      },
    });
    return api;
  }

  it('asks before closing, then closes exactly the listed instance', async () => {
    const api = switchApi();
    const { user } = renderApp(api);
    const card = (await screen.findAllByTestId('profile-card'))[1]!;
    await user.click(within(card).getByRole('button', { name: 'Launch' }));

    const dialog = await screen.findByRole('dialog', { name: 'Switch to "Work"?' });
    expect(within(dialog).getByTestId('switch-list')).toHaveTextContent('Personal · PID 4321');
    expect(dialog).toHaveTextContent(/nothing is forced/);
    expect(api.launchProfile).toHaveBeenCalledTimes(1);
    expect(api.launchProfile).toHaveBeenLastCalledWith(work.id, {});

    await user.click(within(dialog).getByRole('button', { name: 'Close and open "Work"' }));
    await waitFor(() =>
      expect(api.launchProfile).toHaveBeenLastCalledWith(work.id, {
        switch: { action: 'close', launchIds: ['aaaaaaaaaaaa'] },
      }),
    );
  });

  it('can open alongside or cancel without closing anything', async () => {
    const api = switchApi();
    const { user } = renderApp(api);
    const card = (await screen.findAllByTestId('profile-card'))[1]!;
    await user.click(within(card).getByRole('button', { name: 'Launch' }));
    const dialog = await screen.findByRole('dialog', { name: 'Switch to "Work"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Open alongside' }));
    await waitFor(() =>
      expect(api.launchProfile).toHaveBeenLastCalledWith(work.id, { switch: { action: 'keep' } }),
    );

    api.launchProfile.mockResolvedValueOnce({
      ok: true,
      value: {
        kind: 'confirm-switch',
        running: [{ profileId: personal.id, launchId: 'aaaaaaaaaaaa', pid: 4321 }],
        untrackedProfileIds: [],
      },
    });
    await user.click(within(card).getByRole('button', { name: 'Launch' }));
    const again = await screen.findByRole('dialog', { name: 'Switch to "Work"?' });
    await user.click(within(again).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Switch to "Work"?' })).not.toBeInTheDocument(),
    );
    expect(api.launchProfile).toHaveBeenCalledTimes(3);
  });

  it('saves the launch mode per application from Settings', async () => {
    const api = createFakeApi();
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    const group = screen.getByRole('group', { name: 'Claude Code' });
    expect(within(group).getByRole('radio', { name: /Run side by side/ })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: /Switch/ }));
    expect(api.updateSettings).toHaveBeenCalledWith({ launchModes: { 'claude-code': 'switch' } });
  });
});

describe('experimental Claude Desktop profiles', () => {
  it('is off by default and turned on only through an explicit, explained setting', async () => {
    const api = createFakeApi();
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    const section = screen.getByRole('region', { name: 'Experimental' });
    expect(section).toHaveTextContent(/does not document or support/);
    const toggle = within(section).getByRole('checkbox', { name: /I understand the risks/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(api.updateSettings).toHaveBeenCalledWith({
      experimental: { claudeDesktopIsolation: true },
    });
  });

  it('labels experimental profiles and lets the user record their own check', async () => {
    const desktop = makeProfile({
      id: 'desk-abc234',
      appId: 'claude-desktop',
      name: 'Desktop Work',
      storage: { kind: 'managed' },
      dataDirectory: '/data/profiles/claude-desktop/desk-abc234',
      compatibility: {
        state: 'NeedsVerification',
        launch: { available: true, isolation: 'experimental' },
        summary: { code: 'compat.claudeDesktop.experimental.summary' },
        guarantees: [{ code: 'compat.claudeDesktop.experimental.guarantee.folder' }],
        limitations: [{ code: 'compat.claudeDesktop.experimental.limitation.signInCallback' }],
        guidance: [{ code: 'compat.claudeDesktop.experimental.guidance.check' }],
      },
    });
    const snapshot = makeSnapshot({ profiles: [desktop] });
    snapshot.apps = snapshot.apps.map((app) =>
      app.experimental ? { ...app, experimental: { ...app.experimental, enabled: true } } : app,
    );
    const api = createFakeApi(snapshot);
    const { user } = renderApp(api);
    const card = await screen.findByTestId('profile-card');
    expect(card).toHaveTextContent('Experimental');
    expect(card).toHaveTextContent('Needs verification');
    await user.click(within(card).getByRole('button', { name: 'Details: Desktop Work' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('--user-data-dir (undocumented · experimental)');
    expect(dialog).toHaveTextContent(/claude:\/\/ link/);
    await user.click(within(dialog).getByRole('button', { name: 'I checked this profile' }));
    await waitFor(() => expect(api.setManualCheck).toHaveBeenCalledWith('desk-abc234', true));
  });
});

describe('Persian', () => {
  it('switches the interface to Persian, right to left, with Persian digits', async () => {
    const runtime = {
      'work-abc234': [
        {
          launchId: 'aaaaaaaaaaaa',
          pid: 4321,
          startedAt: new Date().toISOString(),
          state: 'running' as const,
          configDirectory: 'verified' as const,
        },
      ],
    };
    const api = createFakeApi(makeSnapshot({ profiles: [makeProfile()], runtime }));
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.selectOptions(screen.getByLabelText('Language'), 'fa');
    expect(api.updateSettings).toHaveBeenCalledWith({ language: 'fa' });

    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    expect(document.documentElement.lang).toBe('fa-IR');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('تنظیمات');
    await user.click(screen.getByRole('button', { name: 'پروفایل‌ها' }));
    expect(await screen.findByRole('button', { name: 'اجرا' })).toBeInTheDocument();
    expect(screen.getByTestId('runtime-indicator').getAttribute('title')).toMatch(
      /^شناسهٔ فرایند \u2068۴۳۲۱\u2069$/,
    );

    await user.click(screen.getByRole('button', { name: 'تنظیمات' }));
    await user.selectOptions(screen.getByLabelText('زبان'), 'en');
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'));
  });
});

describe('Terminal and Desktop buttons', () => {
  function withDesktop() {
    const snapshot = makeSnapshot({ profiles: [makeProfile()] });
    snapshot.apps = snapshot.apps.map((app) =>
      app.desktopCompanion
        ? { ...app, desktopCompanion: { ...app.desktopCompanion, available: true } }
        : app,
    );
    return createFakeApi(snapshot);
  }

  it('offers both when Claude Desktop is installed and opens the chosen one', async () => {
    const api = withDesktop();
    const { user } = renderApp(api);
    const card = await screen.findByTestId('profile-card');
    const group = within(card).getByRole('group', { name: 'Open this profile in' });
    await user.click(within(group).getByRole('button', { name: 'Terminal' }));
    await waitFor(() => expect(api.launchProfile).toHaveBeenLastCalledWith('work-abc234', {}));
    await user.click(within(group).getByRole('button', { name: 'Desktop' }));
    await waitFor(() =>
      expect(api.launchProfile).toHaveBeenLastCalledWith('work-abc234', { target: 'desktop' }),
    );
  });

  it('asks before turning on the experimental option for Desktop', async () => {
    const api = withDesktop();
    api.launchProfile.mockResolvedValueOnce({
      ok: false,
      error: { code: 'EXPERIMENTAL_DISABLED', params: { app: 'Claude Desktop' } },
    });
    const { user } = renderApp(api);
    const card = await screen.findByTestId('profile-card');
    await user.click(within(card).getByRole('button', { name: 'Desktop' }));
    const dialog = await screen.findByRole('dialog', { name: 'Open "Work" in Claude Desktop?' });
    expect(api.updateSettings).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Turn on and open' }));
    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith({
        experimental: { claudeDesktopIsolation: true },
      }),
    );
    await waitFor(() =>
      expect(api.launchProfile).toHaveBeenLastCalledWith('work-abc234', { target: 'desktop' }),
    );
  });

  it('shows a single Launch button when Claude Desktop is not available', async () => {
    renderApp(createFakeApi(makeSnapshot({ profiles: [makeProfile()] })));
    const card = await screen.findByTestId('profile-card');
    expect(within(card).getByRole('button', { name: 'Launch' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Desktop' })).not.toBeInTheDocument();
  });
});

describe('sign-in browser setting', () => {
  it('defaults to the default browser and can be changed', async () => {
    const api = createFakeApi();
    const { user } = renderApp(api);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    const select = screen.getByLabelText('Sign-in browser');
    expect(select).toHaveValue('auto');
    expect(
      within(select).getByRole('option', { name: 'Default browser (Google Chrome)' }),
    ).toBeInTheDocument();
    await user.selectOptions(select, 'firefox');
    expect(api.updateSettings).toHaveBeenCalledWith({ signInBrowser: 'firefox' });
  });
});
