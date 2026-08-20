import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import { parseLegacyNumericPaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import { isPassiveCompletedHibernationEvidence } from '../../lib/sleeping-agent-pane-ownership'

const EMPTY_TAB_IDS: ReadonlySet<string> = new Set()

/** Tab ids whose panes own a sleeping record a mount can actually consume.
 *  Why: a parked pane can never cold-restore, so per-tab parks must exempt
 *  these — but only these: blocked and passive-completed records never resume,
 *  and exempting them would pin a hidden pane mounted indefinitely. */
export function selectSleepingRecordParkExemptTabIds(
  sleepingAgentSessionsByPaneKey: Record<string, SleepingAgentSessionRecord> | undefined,
  worktreeId: string
): ReadonlySet<string> {
  let owned: Set<string> | null = null
  for (const record of Object.values(sleepingAgentSessionsByPaneKey ?? {})) {
    if (record.worktreeId !== worktreeId) {
      continue
    }
    if (record.automaticResumeBlockedBy || isPassiveCompletedHibernationEvidence(record)) {
      continue
    }
    // Why the parsers, not slice(0, indexOf(':')): a paneKey with no delimiter
    // made that slice(0, -1), truncating the last character into a tab id that
    // owns nothing — so the tab actually holding the record got parked and
    // could never cold-restore. Both parsers reject a malformed key outright.
    const tabId =
      record.tabId ??
      parsePaneKey(record.paneKey)?.tabId ??
      parseLegacyNumericPaneKey(record.paneKey)?.tabId
    if (tabId) {
      owned ??= new Set()
      owned.add(tabId)
    }
  }
  return owned ?? EMPTY_TAB_IDS
}
