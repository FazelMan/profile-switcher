import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ProfileSwitcherApi } from '../shared/ipc';

/**
 * The only bridge between the sandboxed renderer and the main process.
 * Each method maps to one fixed channel; the renderer cannot choose a
 * channel name, reach `ipcRenderer`, or receive Node/Electron objects.
 * Arguments are validated again in the main process.
 */
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: ProfileSwitcherApi = {
  getSnapshot: () => invoke(IPC_CHANNELS.getSnapshot),
  refreshApps: () => invoke(IPC_CHANNELS.refreshApps),
  createProfile: (input) => invoke(IPC_CHANNELS.createProfile, input),
  updateProfile: (input) => invoke(IPC_CHANNELS.updateProfile, input),
  deleteProfile: (id) => invoke(IPC_CHANNELS.deleteProfile, id),
  launchProfile: (id) => invoke(IPC_CHANNELS.launchProfile, id),
  verifyProfile: (id) => invoke(IPC_CHANNELS.verifyProfile, id),
  openProfileDirectory: (id) => invoke(IPC_CHANNELS.openProfileDirectory, id),
  copyLaunchCommand: (id, shell) => invoke(IPC_CHANNELS.copyLaunchCommand, id, shell),
  updateSettings: (patch) => invoke(IPC_CHANNELS.updateSettings, patch),
  chooseDirectory: (purpose) => invoke(IPC_CHANNELS.chooseDirectory, purpose),
  getDiagnostics: () => invoke(IPC_CHANNELS.getDiagnostics),
  copyDiagnostics: () => invoke(IPC_CHANNELS.copyDiagnostics),
  openLogsDirectory: () => invoke(IPC_CHANNELS.openLogsDirectory),
  openLink: (id) => invoke(IPC_CHANNELS.openLink, id),
  getRuntime: () => invoke(IPC_CHANNELS.getRuntime),
};

contextBridge.exposeInMainWorld('profileSwitcher', Object.freeze(api));
