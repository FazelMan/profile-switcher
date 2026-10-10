import { z } from 'zod';
import { COMMAND_SHELLS } from '@shared/domain/compatibility';
import {
  createProfileInputSchema,
  profileIdSchema,
  updateProfileInputSchema,
} from '@shared/domain/profile';
import { settingsPatchSchema } from '@shared/domain/settings';
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc';
import { LINK_IDS } from '@shared/links';
import { LAUNCH_ID_PATTERN } from '../runtime/process-tracker';

const none = z.tuple([]);
const idArg = z.tuple([profileIdSchema]);

export const launchRequestSchema = z
  .object({
    switch: z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('keep') }).strict(),
        z
          .object({
            action: z.literal('close'),
            launchIds: z.array(z.string().regex(LAUNCH_ID_PATTERN)).min(1).max(64),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();

/**
 * Runtime schema for the argument list of every IPC channel. The main process
 * parses `args` with these before any handler runs; anything that does not
 * match (extra arguments, wrong types, unknown keys) is rejected.
 */
export const IPC_ARG_SCHEMAS = {
  [IPC_CHANNELS.getSnapshot]: none,
  [IPC_CHANNELS.refreshApps]: none,
  [IPC_CHANNELS.createProfile]: z.tuple([createProfileInputSchema]),
  [IPC_CHANNELS.updateProfile]: z.tuple([updateProfileInputSchema]),
  [IPC_CHANNELS.deleteProfile]: idArg,
  [IPC_CHANNELS.launchProfile]: z.tuple([profileIdSchema, launchRequestSchema]),
  [IPC_CHANNELS.verifyProfile]: idArg,
  [IPC_CHANNELS.openProfileDirectory]: idArg,
  [IPC_CHANNELS.copyLaunchCommand]: z.tuple([profileIdSchema, z.enum(COMMAND_SHELLS)]),
  [IPC_CHANNELS.updateSettings]: z.tuple([settingsPatchSchema]),
  [IPC_CHANNELS.chooseDirectory]: z.tuple([z.enum(['profile-data', 'working-directory'])]),
  [IPC_CHANNELS.getDiagnostics]: none,
  [IPC_CHANNELS.copyDiagnostics]: none,
  [IPC_CHANNELS.openLogsDirectory]: none,
  [IPC_CHANNELS.openLink]: z.tuple([z.enum(LINK_IDS as [string, ...string[]])]),
  [IPC_CHANNELS.getRuntime]: none,
  [IPC_CHANNELS.setManualCheck]: z.tuple([profileIdSchema, z.boolean()]),
} as const satisfies Record<IpcChannel, z.ZodType>;

export type IpcArgs<C extends IpcChannel> = z.output<(typeof IPC_ARG_SCHEMAS)[C]>;
