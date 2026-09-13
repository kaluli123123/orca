import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
vi.mock('./ssh-relay-deploy-helpers', () => ({
  execCommand: vi.fn(),
  isUnconfirmedSshCommandTermination: () => false
}))
import {
  relayEndpointIncumbentProbeCommand,
  parseRelayEndpointIncumbentProbe
} from './ssh-relay-endpoint-incumbent'

async function probe(script: string, listening = false) {
  const dir = mkdtempSync(join(tmpdir(), 'orca-incumbent-'))
  const socket = join(dir, 'socket with spaces.sock')
  const server = createServer((s) => s.end())
  const pidFile = join(dir, 'probe.pid')
  try {
    writeFileSync(join(dir, 'lsof'), `#!/bin/sh\n${script}`, { mode: 0o755 })
    if (listening) {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(socket, resolve)
      })
    }
    const start = performance.now()
    const result = await runProcess({
      program: '/bin/sh',
      args: ['-c', relayEndpointIncumbentProbeCommand(process.execPath, socket)],
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FIXTURE_PID: pidFile },
      timeoutMs: 12000,
      detached: true,
      terminationBarrier: true
    })
    const verdict = parseRelayEndpointIncumbentProbe(socket, result.stdout)
    let pidAlive: boolean | null = null
    try {
      const pid = Number(readFileSync(pidFile, 'utf8'))
      try {
        process.kill(pid, 0)
        pidAlive = true
      } catch (error) {
        pidAlive = !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
      }
    } catch {}
    return { result, verdict, elapsedMs: performance.now() - start, pidAlive }
  } finally {
    if (listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    rmSync(dir, { recursive: true, force: true })
  }
}
describe.skipIf(process.platform === 'win32')('real generated incumbent probe', () => {
  it('bounds hung lsof and preserves live connect evidence', async () => {
    const p = await probe('echo $$ > "$FIXTURE_PID"\nexec sleep 60\n', true)
    expect(p.result.timedOut).toBe(false)
    expect(p.result.code).toBe(0)
    expect(p.verdict).toMatchObject({
      verdict: 'live',
      holdersEnumerable: false,
      evidence: 'accepted-connection'
    })
    expect(p.pidAlive).toBe(false)
    expect(p.elapsedMs).toBeLessThan(10000)
  })
  it('does not mistake diagnostic enumeration failure for proven absence', async () => {
    const p = await probe('echo "lsof: access denied" >&2\nexit 1\n')
    expect(p.verdict).toMatchObject({ verdict: 'unverifiable', holdersEnumerable: false })
  })
  it('preserves a completed empty enumeration', async () => {
    const p = await probe('exit 1\n')
    expect(p.verdict).toMatchObject({ verdict: 'exited', holdersEnumerable: true })
  })
})
