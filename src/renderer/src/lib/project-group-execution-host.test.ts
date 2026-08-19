import { describe, expect, it } from 'vitest'
import { getProjectGroupExecutionHostId } from './project-group-execution-host'

describe('getProjectGroupExecutionHostId', () => {
  it('returns undefined when the group is missing', () => {
    expect(getProjectGroupExecutionHostId(undefined)).toBeUndefined()
  })

  it('normalizes a local group to the local host id', () => {
    expect(getProjectGroupExecutionHostId({ executionHostId: 'local' })).toBe('local')
  })

  it('normalizes a runtime-owned group to its runtime host id', () => {
    expect(getProjectGroupExecutionHostId({ executionHostId: 'runtime:env-1' })).toBe(
      'runtime:env-1'
    )
  })

  it('returns undefined for a group with no execution host set', () => {
    expect(getProjectGroupExecutionHostId({ executionHostId: null })).toBeUndefined()
  })
})
