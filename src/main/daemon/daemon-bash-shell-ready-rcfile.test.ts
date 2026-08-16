import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDaemonBashShellReadyRcfileContent } from './daemon-bash-shell-ready-rcfile'

const hasBash = process.platform !== 'win32' && spawnSync('bash', ['--version']).status === 0
const itWithBash = hasBash ? it : it.skip

function runInteractiveBashRcfile(rcfileContent: string, input = 'true\nfalse\nexit 0\n'): string {
  const tempHome = mkdtempSync(join(tmpdir(), 'daemon-bash-rcfile-test-'))
  const rcfile = join(tempHome, 'rcfile')
  writeFileSync(rcfile, rcfileContent)

  try {
    const result = spawnSync(
      'bash',
      ['-lc', 'bash --noprofile --rcfile "$1" -i 2>&1', 'bash', rcfile],
      {
        input,
        encoding: 'utf8',
        env: { ...process.env, HOME: tempHome, ORCA_SHELL_READY_MARKER: '1', TERM: 'xterm' },
        timeout: 5000
      }
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    return result.stdout
  } finally {
    rmSync(tempHome, { recursive: true, force: true })
  }
}

describe('daemon Bash shell-ready rcfile', () => {
  itWithBash('normalizes suffixes without swallowing escaped characters', () => {
    for (const [promptCommand, hookOutput] of [
      ['printf "TRAILING_SEPARATOR\\n"; ', 'TRAILING_SEPARATOR'],
      ['printf "DOUBLE_SEPARATOR\\n";;', 'DOUBLE_SEPARATOR'],
      [String.raw`printf "ESCAPED_SEMICOLON:%s:END\n" foo\;`, 'ESCAPED_SEMICOLON:foo;:END'],
      [String.raw`printf "ESCAPED_SPACE:<%s>:END\n" foo\ `, 'ESCAPED_SPACE:<foo >:END']
    ] as const) {
      const output = runInteractiveBashRcfile(
        [
          `PROMPT_COMMAND='${promptCommand}'`,
          getDaemonBashShellReadyRcfileContent(),
          String.raw`__orca_osc133_epilogue() { printf "EPILOGUE_RAN\n"; }`
        ].join('\n')
      )

      expect([hookOutput, 'EPILOGUE_RAN'].every((value) => output.includes(value))).toBe(true)
    }
  })

  itWithBash('collapses an array PROMPT_COMMAND and preserves member execution order', () => {
    const output = runInteractiveBashRcfile(
      [
        `PROMPT_COMMAND=('printf "ARRAY_FIRST\\n"' 'printf "ARRAY_SECOND\\n"')`,
        getDaemonBashShellReadyRcfileContent(),
        `[[ "$(declare -p PROMPT_COMMAND)" == "declare --"* ]] && printf "PROMPT_COMMAND_SCALAR\\n"`
      ].join('\n'),
      'exit 0\n'
    )

    expect(output.match(/ARRAY_FIRST/g)).toHaveLength(1)
    expect(output.match(/ARRAY_SECOND/g)).toHaveLength(1)
    expect(output.indexOf('ARRAY_FIRST')).toBeLessThan(output.indexOf('ARRAY_SECOND'))
    expect(output).toContain('PROMPT_COMMAND_SCALAR')
  })
})
