import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { ProjectGroup } from '../../../shared/project-group-types'

/** Normalizes a project group's stored host field into a routable ExecutionHostId. */
export function getProjectGroupExecutionHostId(
  projectGroup: Pick<ProjectGroup, 'executionHostId'> | undefined
): ExecutionHostId | undefined {
  return parseExecutionHostId(projectGroup?.executionHostId)?.id ?? undefined
}
