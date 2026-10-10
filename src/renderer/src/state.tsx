import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppError, Result } from '@shared/domain/errors';
import type { ProfileSwitcherApi, RuntimeSnapshot, Snapshot } from '@shared/ipc';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  error?: AppError;
}

export interface AppController {
  api: ProfileSwitcherApi;
  snapshot: Snapshot | null;
  /** Live instances per profile, refreshed periodically from the main process. */
  runtime: RuntimeSnapshot;
  loadError: AppError | null;
  reload(): Promise<void>;
  refreshRuntime(): Promise<void>;
  applySnapshot(snapshot: Snapshot): void;
  toasts: Toast[];
  notify(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  /**
   * Runs an API call and returns its result. Errors are surfaced as toasts
   * unless `quiet` is set (callers that render errors inline).
   */
  call<T>(operation: () => Promise<Result<T>>, options?: { quiet?: boolean }): Promise<Result<T>>;
}

const ControllerContext = createContext<AppController | null>(null);

const TOAST_TIMEOUT_MS = 6_000;
/** How often running state is re-checked. Each check only observes processes. */
export const RUNTIME_POLL_MS = 3_000;

function unexpected(error: unknown): AppError {
  return { code: 'INTERNAL_ERROR', detail: error instanceof Error ? error.message : String(error) };
}

export function AppControllerProvider({
  api,
  children,
}: {
  api: ProfileSwitcherApi;
  children: ReactNode;
}) {
  const [snapshot, setSnapshotState] = useState<Snapshot | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSnapshot>({});
  const setSnapshot = useCallback((next: Snapshot) => {
    setSnapshotState(next);
    setRuntime(next.runtime);
  }, []);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      if (toast.kind !== 'error') setTimeout(() => dismissToast(id), TOAST_TIMEOUT_MS);
    },
    [dismissToast],
  );

  const reload = useCallback(async () => {
    let result: Result<Snapshot>;
    try {
      result = await api.getSnapshot();
    } catch (error) {
      result = { ok: false, error: unexpected(error) };
    }
    if (result.ok) {
      setSnapshot(result.value);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, [api, setSnapshot]);

  const refreshRuntime = useCallback(async () => {
    try {
      const result = await api.getRuntime();
      if (result.ok) setRuntime(result.value);
    } catch {
      // Transient; the next poll retries.
    }
  }, [api]);

  const call = useCallback(
    async <T,>(
      operation: () => Promise<Result<T>>,
      options?: { quiet?: boolean },
    ): Promise<Result<T>> => {
      let result: Result<T>;
      try {
        result = await operation();
      } catch (error) {
        result = { ok: false, error: unexpected(error) };
      }
      if (!result.ok) {
        if (!options?.quiet) notify({ kind: 'error', title: '', error: result.error });
        if (result.error.code === 'PROFILE_NOT_FOUND') void reload();
      }
      return result;
    },
    [notify, reload],
  );

  useEffect(() => {
    // Initial load from the main process; state is set after the IPC call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const loaded = snapshot !== null;
  useEffect(() => {
    if (!loaded) return;
    const timer = setInterval(() => void refreshRuntime(), RUNTIME_POLL_MS);
    return () => clearInterval(timer);
  }, [loaded, refreshRuntime]);

  const value = useMemo<AppController>(
    () => ({
      api,
      snapshot,
      runtime,
      loadError,
      reload,
      refreshRuntime,
      applySnapshot: setSnapshot,
      toasts,
      notify,
      dismissToast,
      call,
    }),
    [
      api,
      snapshot,
      runtime,
      loadError,
      reload,
      refreshRuntime,
      setSnapshot,
      toasts,
      notify,
      dismissToast,
      call,
    ],
  );

  return <ControllerContext.Provider value={value}>{children}</ControllerContext.Provider>;
}

export function useController(): AppController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error('useController must be used inside AppControllerProvider');
  return controller;
}
