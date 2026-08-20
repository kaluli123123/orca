import type { ExecutionHostId } from '../../../shared/execution-host'
import { catalogOwnerHostId } from './worktree-runtime-owner-index'

/** Normalizes an already-selected catalog row's (project group or repo) host
 *  fields into a routable ExecutionHostId, matching catalogOwnerHostId's
 *  SSH/local fallback. */
export function getCatalogEntryExecutionHostId(
  entry: { executionHostId?: string | null; connectionId?: string | null } | undefined
): ExecutionHostId | undefined {
  return entry ? catalogOwnerHostId(entry) : undefined
}
