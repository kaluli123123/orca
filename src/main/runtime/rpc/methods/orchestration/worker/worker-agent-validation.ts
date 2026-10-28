import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { TuiAgent } from '../../../../../../shared/tui-agent'
import type { WorkerWorktreeCreationTarget } from './worker-worktree-creation'

export async function validateWorkerAgent(
  runtime: OrcaRuntimeService,
  agent: TuiAgent | undefined,
  creationTarget: WorkerWorktreeCreationTarget | undefined,
  resolvedWorktree: { repoId: string } | undefined
): Promise<void> {
  if (agent) {
    const repo = creationTarget?.repoSelector ?? `id:${resolvedWorktree!.repoId}`
    await runtime.validateOrchestrationAgentLauncherForRepo(agent, repo)
  }
}
