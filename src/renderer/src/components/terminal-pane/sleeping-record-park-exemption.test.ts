import { describe, expect, it } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import { selectSleepingRecordParkExemptTabIds } from './sleeping-record-park-exemption'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'

function sleepingRecord(
  overrides: Partial<SleepingAgentSessionRecord> & Pick<SleepingAgentSessionRecord, 'paneKey'>
): SleepingAgentSessionRecord {
  return {
    worktreeId: 'wt-1',
    agent: 'claude',
    providerSession: { key: 'session_id', id: 'session-1' },
    prompt: 'p',
    state: 'working',
    capturedAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('selectSleepingRecordParkExemptTabIds', () => {
  it('derives the owning tab id from a canonical paneKey', () => {
    const records = { [`tab-1:${LEAF_ID}`]: sleepingRecord({ paneKey: `tab-1:${LEAF_ID}` }) }

    expect([...selectSleepingRecordParkExemptTabIds(records, 'wt-1')]).toEqual(['tab-1'])
  })

  it('derives the owning tab id from a legacy numeric paneKey', () => {
    const records = { 'tab-1:0': sleepingRecord({ paneKey: 'tab-1:0' }) }

    expect([...selectSleepingRecordParkExemptTabIds(records, 'wt-1')]).toEqual(['tab-1'])
  })

  it('prefers the record tabId over the paneKey', () => {
    const records = {
      [`tab-1:${LEAF_ID}`]: sleepingRecord({ paneKey: `tab-1:${LEAF_ID}`, tabId: 'tab-real' })
    }

    expect([...selectSleepingRecordParkExemptTabIds(records, 'wt-1')]).toEqual(['tab-real'])
  })

  it('exempts nothing for a paneKey with no delimiter', () => {
    // Why: slice(0, indexOf(':')) on a key with no ":" is slice(0, -1) — it
    // truncated the last character into a tab id that owns nothing, so the tab
    // that really holds the sleeping record got parked and could never
    // cold-restore. Every other paneKey→tabId reader guards with `<= 0`.
    const records = { 'orphan-pane-key': sleepingRecord({ paneKey: 'orphan-pane-key' }) }

    const exempt = selectSleepingRecordParkExemptTabIds(records, 'wt-1')

    expect(exempt.has('orphan-pane-ke')).toBe(false)
    expect([...exempt]).toEqual([])
  })

  it('skips records from other worktrees and passive-completed evidence', () => {
    const records = {
      [`tab-other:${LEAF_ID}`]: sleepingRecord({
        paneKey: `tab-other:${LEAF_ID}`,
        worktreeId: 'wt-2'
      }),
      [`tab-done:${LEAF_ID}`]: sleepingRecord({ paneKey: `tab-done:${LEAF_ID}`, state: 'done' }),
      [`tab-blocked:${LEAF_ID}`]: sleepingRecord({
        paneKey: `tab-blocked:${LEAF_ID}`,
        automaticResumeBlockedBy: 'legacy-orchestration-worker'
      })
    }

    expect([...selectSleepingRecordParkExemptTabIds(records, 'wt-1')]).toEqual([])
  })
})
