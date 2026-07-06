/**
 * Local IPC trust checks. The Beck and Juris daemons expose a Unix domain
 * socket that any process able to reach the path can connect to. The socket
 * lives under a per-user state directory that is meant to be owner-only
 * (mode 0700). These helpers assert that assumption holds before a daemon binds
 * its shared endpoint, so a pre-existing directory with loosened permissions or
 * a foreign owner fails closed instead of silently widening the trust boundary.
 *
 * On Windows the daemon uses a named pipe, whose access is governed by an ACL
 * rather than POSIX file modes, so these checks are skipped there.
 *
 * See docs/local-trust-model.md.
 */

import { chmod, stat } from 'node:fs/promises';

export interface OwnershipProbe {
  /** Owner uid of the directory. */
  uid: number;
  /** Raw st_mode; only the permission bits are inspected. */
  mode: number;
}

/**
 * Pure policy: an IPC directory is secure only if the current user owns it and
 * it grants no permission bits to group or other (0o077 mask must be clear).
 */
export function isSecureOwnedDir(probe: OwnershipProbe, selfUid: number): boolean {
  if (probe.uid !== selfUid) return false;
  return (probe.mode & 0o077) === 0;
}

/**
 * Ensure an IPC directory is owner-only before trusting it. Best-effort tightens
 * the mode to 0700 first (self-healing an older 0755 layout we created), then
 * verifies ownership and permissions and throws if they cannot be guaranteed.
 * No-op on Windows and on platforms without POSIX uids.
 */
export async function assertSecureIpcDir(dir: string): Promise<void> {
  if (process.platform === 'win32') return;
  const selfUid = process.getuid?.();
  if (selfUid === undefined) return; // non-POSIX runtime — nothing to assert

  await chmod(dir, 0o700).catch(() => undefined); // best-effort self-heal
  const s = await stat(dir);
  if (!isSecureOwnedDir({ uid: s.uid, mode: s.mode }, selfUid)) {
    throw new Error(
      `Refusing to use IPC directory ${dir}: it must be owned by the current user ` +
        `(uid ${selfUid}) and not accessible by group or other (mode 0700). ` +
        `Found uid ${s.uid}, mode ${(s.mode & 0o777).toString(8)}.`
    );
  }
}
