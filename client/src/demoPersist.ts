import { api, type DemoStateSnapshot } from './api';

export const STORAGE_KEY = 'nationwide_sms_demo_state_v1';

export function readLocalDemoState(): DemoStateSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoStateSnapshot;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalDemoState(snapshot: DemoStateSnapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearLocalDemoState() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Push browser backup into the current serverless DB (legacy helper). */
export async function restoreDemoStateFromLocalStorage(): Promise<boolean> {
  const snapshot = readLocalDemoState();
  if (!snapshot || !Array.isArray(snapshot.leads) || snapshot.leads.length === 0) {
    return false;
  }
  await api.importDemoState(snapshot);
  return true;
}

/** Pull server state into browser localStorage (legacy helper). */
export async function persistDemoStateToLocalStorage(): Promise<void> {
  try {
    const snapshot = await api.exportDemoState();
    writeLocalDemoState(snapshot);
  } catch (err) {
    console.warn('[demo-persist] save failed', err);
  }
}

/** @deprecated Prefer api methods that use /demo/run (atomic). Kept for compatibility. */
export async function withDemoPersistence<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function schedulePersistDemoState(_delayMs = 400) {
  // no-op: /demo/run persists snapshot on every call
}
