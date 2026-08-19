import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'

const remoteRepo: Repo = {
  id: 'remote-repo',
  path: '/remote',
  displayName: 'Remote',
  badgeColor: '#111',
  addedAt: 2
}

const projectGroup: ProjectGroup = {
  id: 'group-1',
  name: 'Platform',
  parentPath: null,
  parentGroupId: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1
}

const reposRemove = vi.fn()
const reposRemoveForHost = vi.fn()
const projectGroupsDelete = vi.fn()
const projectGroupsUpdate = vi.fn()
const projectGroupsMoveProject = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  reposRemove.mockReset()
  reposRemove.mockResolvedValue(undefined)
  reposRemoveForHost.mockReset()
  reposRemoveForHost.mockResolvedValue(undefined)
  projectGroupsDelete.mockReset()
  projectGroupsUpdate.mockReset()
  projectGroupsMoveProject.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      repos: { remove: reposRemove, removeForHost: reposRemoveForHost },
      projectGroups: {
        delete: projectGroupsDelete,
        update: projectGroupsUpdate,
        moveProject: projectGroupsMoveProject
      },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

describe('project group deletion store routing', () => {
  it('removes local project group subtrees from renderer state after delete', async () => {
    const childGroup: ProjectGroup = {
      ...projectGroup,
      id: 'child',
      parentGroupId: projectGroup.id
    }
    const siblingGroup: ProjectGroup = {
      ...projectGroup,
      id: 'sibling',
      name: 'Tools',
      tabOrder: 1
    }
    const childWorkspace: FolderWorkspace = {
      id: 'folder-workspace-1',
      projectGroupId: childGroup.id,
      name: 'Shared cleanup',
      folderPath: '/workspace/platform/shared',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 1,
      lastActivityAt: 0,
      createdAt: 1,
      updatedAt: 1
    }
    projectGroupsDelete.mockResolvedValue(true)
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup, childGroup, siblingGroup],
      folderWorkspaces: [childWorkspace],
      repos: [
        { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id },
        { ...remoteRepo, id: 'nested', projectGroupId: childGroup.id },
        { ...remoteRepo, id: 'sibling', projectGroupId: siblingGroup.id }
      ]
    })

    await expect(store.getState().deleteProjectGroup(projectGroup.id)).resolves.toBe(true)

    expect(store.getState().projectGroups.map((group) => group.id)).toEqual([siblingGroup.id])
    expect(store.getState().folderWorkspaces).toEqual([])
    expect(store.getState().repos).toMatchObject([
      { id: 'direct', projectGroupId: null },
      { id: 'nested', projectGroupId: null },
      { id: 'sibling', projectGroupId: siblingGroup.id }
    ])
  })

  it('uses the remote delete response shape before mutating local state', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-delete-group',
      ok: true,
      result: { deleted: false },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const groupedRepo = { ...remoteRepo, projectGroupId: projectGroup.id }
    const remotelyOwnedGroup = { ...projectGroup, executionHostId: 'runtime:env-1' }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [remotelyOwnedGroup],
      repos: [groupedRepo]
    })

    await expect(store.getState().deleteProjectGroup(projectGroup.id)).resolves.toBe(false)

    expect(store.getState().projectGroups).toEqual([remotelyOwnedGroup])
    expect(store.getState().repos).toEqual([groupedRepo])
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'projectGroup.delete',
      params: { groupId: projectGroup.id },
      timeoutMs: 15_000
    })
    expect(projectGroupsDelete).not.toHaveBeenCalled()
  })

  it('routes a locally owned group to the local runtime when a remote runtime is active', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const locallyOwnedGroup = { ...projectGroup, executionHostId: 'local' }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [locallyOwnedGroup]
    })

    await expect(store.getState().deleteProjectGroup(locallyOwnedGroup.id)).resolves.toBe(true)

    expect(projectGroupsDelete).toHaveBeenCalledWith({ groupId: locallyOwnedGroup.id })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('routes renames to the group owner instead of the active runtime', async () => {
    const locallyOwnedGroup = { ...projectGroup, executionHostId: 'local' }
    const renamedGroup = { ...locallyOwnedGroup, name: 'Renamed' }
    projectGroupsUpdate.mockResolvedValue(renamedGroup)
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [locallyOwnedGroup]
    })

    await expect(
      store.getState().updateProjectGroup(locallyOwnedGroup.id, { name: renamedGroup.name })
    ).resolves.toBe(true)

    expect(projectGroupsUpdate).toHaveBeenCalledWith({
      groupId: locallyOwnedGroup.id,
      updates: { name: renamedGroup.name }
    })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('aborts a mutation instead of guessing the host when the group id is ambiguous', async () => {
    const localGroup = { ...projectGroup, executionHostId: 'local' }
    const remoteGroup = { ...projectGroup, executionHostId: 'runtime:env-1' }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [localGroup, remoteGroup]
    })

    await expect(store.getState().deleteProjectGroup(projectGroup.id)).resolves.toBe(false)
    await expect(
      store.getState().updateProjectGroup(projectGroup.id, { name: 'Renamed' })
    ).resolves.toBe(false)

    expect(projectGroupsDelete).not.toHaveBeenCalled()
    expect(projectGroupsUpdate).not.toHaveBeenCalled()
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('aborts instead of falling back to the active runtime when an explicit executionHostId owns nothing', async () => {
    const remoteGroup = { ...projectGroup, executionHostId: 'runtime:env-1' }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [remoteGroup]
    })

    await expect(
      store.getState().deleteProjectGroup(projectGroup.id, { executionHostId: 'local' })
    ).resolves.toBe(false)

    expect(projectGroupsDelete).not.toHaveBeenCalled()
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('disambiguates a mutation on a duplicate group id with an explicit executionHostId', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const localGroup = { ...projectGroup, executionHostId: 'local' }
    const remoteGroup = { ...projectGroup, executionHostId: 'runtime:env-1' }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [localGroup, remoteGroup]
    })

    await expect(
      store.getState().deleteProjectGroup(projectGroup.id, { executionHostId: 'local' })
    ).resolves.toBe(true)

    expect(projectGroupsDelete).toHaveBeenCalledWith({ groupId: projectGroup.id })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('routes a move to the explicit host when a duplicate group id spans catalogs', async () => {
    const movedRepo = { ...remoteRepo, projectGroupId: projectGroup.id }
    projectGroupsMoveProject.mockResolvedValue(movedRepo)
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      repos: [remoteRepo],
      projectGroups: [
        { ...projectGroup, executionHostId: 'local' },
        { ...projectGroup, executionHostId: 'runtime:env-1' }
      ]
    })

    await expect(
      store
        .getState()
        .moveProjectToGroup(remoteRepo.id, projectGroup.id, 3, { executionHostId: 'local' })
    ).resolves.toBe(true)

    expect(projectGroupsMoveProject).toHaveBeenCalledWith({
      projectId: remoteRepo.id,
      groupId: projectGroup.id,
      order: 3
    })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('scopes delete state reconciliation to the disambiguated host, leaving the sibling host untouched', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const localGroup = { ...projectGroup, executionHostId: 'local' }
    const remoteGroup = { ...projectGroup, executionHostId: 'runtime:env-1' }
    const localRepo: Repo = {
      ...remoteRepo,
      id: 'local-repo',
      executionHostId: 'local',
      projectGroupId: projectGroup.id
    }
    const remoteGroupedRepo: Repo = {
      ...remoteRepo,
      id: 'remote-grouped-repo',
      executionHostId: 'runtime:env-1',
      projectGroupId: projectGroup.id
    }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [localGroup, remoteGroup],
      repos: [localRepo, remoteGroupedRepo]
    })

    await expect(
      store.getState().deleteProjectGroup(projectGroup.id, { executionHostId: 'local' })
    ).resolves.toBe(true)

    expect(store.getState().projectGroups).toEqual([remoteGroup])
    expect(store.getState().repos).toEqual([
      { ...localRepo, projectGroupId: null },
      remoteGroupedRepo
    ])
  })

  it('scopes update state reconciliation to the disambiguated host, leaving the sibling host untouched', async () => {
    const localGroup = { ...projectGroup, executionHostId: 'local' }
    const remoteGroup = { ...projectGroup, executionHostId: 'runtime:env-1' }
    const renamedLocalGroup = { ...localGroup, name: 'Renamed' }
    projectGroupsUpdate.mockResolvedValue(renamedLocalGroup)
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [localGroup, remoteGroup]
    })

    await expect(
      store
        .getState()
        .updateProjectGroup(projectGroup.id, { name: 'Renamed' }, { executionHostId: 'local' })
    ).resolves.toBe(true)

    expect(store.getState().projectGroups).toEqual([renamedLocalGroup, remoteGroup])
  })

  it('deletes only the group when contained project removal is not requested', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const groupedRepo = { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id }
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup],
      repos: [groupedRepo]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: false
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: [],
      removedProjectIds: [],
      failedProjectRemovals: []
    })

    expect(reposRemove).not.toHaveBeenCalled()
    expect(store.getState().repos).toMatchObject([{ id: 'direct', projectGroupId: null }])
  })

  it('removes direct and nested child projects after deleting a group', async () => {
    const childGroup: ProjectGroup = {
      ...projectGroup,
      id: 'child',
      parentGroupId: projectGroup.id
    }
    const siblingRepo = { ...remoteRepo, id: 'sibling', projectGroupId: null }
    projectGroupsDelete.mockResolvedValue(true)
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup, childGroup],
      repos: [
        { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id },
        { ...remoteRepo, id: 'nested', projectGroupId: childGroup.id },
        siblingRepo
      ]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: ['direct', 'nested'],
      removedProjectIds: ['direct', 'nested'],
      failedProjectRemovals: []
    })

    expect(reposRemove).toHaveBeenCalledWith({ repoId: 'direct' })
    expect(reposRemove).toHaveBeenCalledWith({ repoId: 'nested' })
    expect(store.getState().repos).toEqual([siblingRepo])
  })

  it('reports a contained-project removal as successful even when a same-id repo survives on another host', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const localDupRepo: Repo = {
      ...remoteRepo,
      id: 'dup-repo',
      executionHostId: 'local',
      projectGroupId: projectGroup.id
    }
    const remoteDupRepo: Repo = {
      ...remoteRepo,
      id: 'dup-repo',
      executionHostId: 'runtime:env-1',
      projectGroupId: null
    }
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup],
      repos: [localDupRepo, remoteDupRepo]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: ['dup-repo'],
      removedProjectIds: ['dup-repo'],
      failedProjectRemovals: []
    })

    expect(reposRemoveForHost).toHaveBeenCalledWith({ repoId: 'dup-repo', hostId: 'local' })
    expect(store.getState().repos).toEqual([remoteDupRepo])
  })

  it('selects the owner-host repo for contained removal even when the sibling host row comes first', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const remoteDupRepo: Repo = {
      ...remoteRepo,
      id: 'dup-repo',
      executionHostId: 'runtime:env-1',
      projectGroupId: null
    }
    const localDupRepo: Repo = {
      ...remoteRepo,
      id: 'dup-repo',
      executionHostId: 'local',
      projectGroupId: projectGroup.id
    }
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup],
      // Why: the sibling-host row is listed before the owner-host row on purpose.
      repos: [remoteDupRepo, localDupRepo]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: ['dup-repo'],
      removedProjectIds: ['dup-repo'],
      failedProjectRemovals: []
    })

    expect(reposRemoveForHost).toHaveBeenCalledWith({ repoId: 'dup-repo', hostId: 'local' })
  })

  it('does not remove contained projects when group deletion fails', async () => {
    projectGroupsDelete.mockResolvedValue(false)
    const groupedRepo = { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id }
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup],
      repos: [groupedRepo]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'group-delete-failed',
      groupId: projectGroup.id,
      requestedProjectIds: ['direct'],
      removedProjectIds: [],
      failedProjectRemovals: []
    })

    expect(reposRemove).not.toHaveBeenCalled()
    expect(store.getState().repos).toEqual([groupedRepo])
  })

  it('reports project removal failures by comparing store state after removeProject', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reposRemove.mockImplementation(async ({ repoId }: { repoId: string }) => {
      if (repoId === 'nested') {
        throw new Error('remove failed')
      }
    })
    const childGroup: ProjectGroup = {
      ...projectGroup,
      id: 'child',
      parentGroupId: projectGroup.id
    }
    projectGroupsDelete.mockResolvedValue(true)
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup, childGroup],
      repos: [
        { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id },
        { ...remoteRepo, id: 'nested', projectGroupId: childGroup.id }
      ]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: ['direct', 'nested'],
      removedProjectIds: ['direct'],
      failedProjectRemovals: [
        {
          projectId: 'nested',
          reason: 'Project remained in Orca after removeProject completed.'
        }
      ]
    })

    expect(store.getState().repos.map((repo) => repo.id)).toEqual(['nested'])
    consoleError.mockRestore()
  })
})
