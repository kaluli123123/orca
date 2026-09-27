// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { makeWorktree, TEST_REPO } from '@/store/slices/store-test-helpers'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { useAiVaultSessionLaunchActions } from './ai-vault-session-launch-actions'

const { launchMock, toastErrorMock, pathExistsMock } = vi.hoisted(() => ({
  launchMock: vi.fn(),
  toastErrorMock: vi.fn(),
  pathExistsMock: vi.fn()
}))

vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'darwin' }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: toastErrorMock }
}))
vi.mock('@/lib/launch-ai-vault-session', () => ({
  launchAiVaultSessionInNewTab: launchMock
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealFolderWorkspace: vi.fn(),
  activateAndRevealWorktree: vi.fn()
}))

const initialAppState = useAppStore.getInitialState()
const RELOCATED_ID = `${TEST_REPO.id}::/Users/ada/relocated`
const RELOCATED_PATH = '/Users/ada/relocated'

type LaunchActions = ReturnType<typeof useAiVaultSessionLaunchActions>
let latest: LaunchActions | null = null
const roots: Root[] = []

function HookProbe(): null {
  const state = useAppStore.getState()
  latest = useAiVaultSessionLaunchActions({
    activeWorktree: null,
    activeWorktreeId: RELOCATED_ID,
    targetState: {
      folderWorkspaces: state.folderWorkspaces,
      projectGroups: state.projectGroups,
      repos: state.repos,
      worktreesByRepo: state.worktreesByRepo
    }
  })
  return null
}

async function renderLaunchActions(): Promise<LaunchActions> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(createElement(HookProbe))
  })
  return latest!
}

function session(cwd: string): AiVaultSession {
  return {
    id: 'claude:session-1',
    executionHostId: 'local',
    agent: 'claude',
    sessionId: 'session-1',
    title: 'Session',
    cwd,
    branch: null,
    model: null,
    filePath: '/Users/ada/.claude/projects/-Users-ada-original/session-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-09-20T00:00:00.000Z',
    messageCount: 2,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `cd '${cwd}' && claude --resume session-1`,
    subagent: null
  } as AiVaultSession
}

async function resumeFromSidebar(recordedCwd: string): Promise<{ cwd?: string; command: string }> {
  const actions = await renderLaunchActions()
  actions.handleResume(session(recordedCwd), RELOCATED_ID)
  await vi.waitFor(() => expect(launchMock).toHaveBeenCalledTimes(1))
  return launchMock.mock.calls[0][0]
}

beforeEach(() => {
  launchMock.mockReset().mockReturnValue({ tabId: 'tab-1' })
  toastErrorMock.mockReset()
  pathExistsMock.mockReset()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only window.api shim
  ;(window as any).api = {
    shell: { pathExists: pathExistsMock },
    fs: { pathExists: pathExistsMock }
  }
  useAppStore.setState(initialAppState, true)
  useAppStore.setState({
    activeRepoId: TEST_REPO.id,
    activeWorktreeId: RELOCATED_ID,
    repos: [TEST_REPO],
    worktreesByRepo: {
      [TEST_REPO.id]: [
        makeWorktree({
          id: RELOCATED_ID,
          repoId: TEST_REPO.id,
          path: RELOCATED_PATH
        })
      ]
    }
  } as Partial<AppState>)
})

afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()))
  document.body.replaceChildren()
  useAppStore.setState(initialAppState, true)
  latest = null
})

describe('right sidebar Resume after the recorded workspace moved or was recreated', () => {
  it('launches in the selected workspace when the original folder was moved away', async () => {
    pathExistsMock.mockResolvedValue(false)

    const launch = await resumeFromSidebar('/Users/ada/original/packages/app')

    expect(launch.cwd).toBe(RELOCATED_PATH)
    expect(launch.command).not.toContain('/Users/ada/original')
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('falls back to the recreated workspace root when the nested recorded cwd is gone', async () => {
    pathExistsMock.mockResolvedValue(false)

    const launch = await resumeFromSidebar(`${RELOCATED_PATH}/packages/deleted`)

    expect(pathExistsMock).toHaveBeenCalledWith(`${RELOCATED_PATH}/packages/deleted`)
    expect(launch.cwd).toBe(RELOCATED_PATH)
  })

  it('keeps a nested recorded cwd that still exists in the recreated workspace', async () => {
    pathExistsMock.mockResolvedValue(true)

    const launch = await resumeFromSidebar(`${RELOCATED_PATH}/packages/app`)

    expect(launch.cwd).toBe(`${RELOCATED_PATH}/packages/app`)
  })
})
