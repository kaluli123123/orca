// Why: OMP 15.x discovers built-in user extensions from ~/.omp/agent, but a
// typed `omp` in an existing terminal still needs Orca's status extension
// passed explicitly. Do not redirect PI_CODING_AGENT_DIR here: that variable
// is OMP's mutable home, so config/auth/session commands must keep the user's
// normal source of truth.

const OMP_SUBCOMMANDS = [
  '__complete',
  'acp',
  'agents',
  'auth-broker',
  'auth-gateway',
  'bench',
  'commit',
  'completions',
  'config',
  'dry-balance',
  'gallery',
  'grep',
  'grievances',
  'install',
  'join',
  'models',
  'plugin',
  'read',
  'say',
  'search',
  'setup',
  'shell',
  'ssh',
  'stats',
  'tiny-models',
  'token',
  'ttsr',
  'update',
  'usage',
  'worktree',
  'q',
  'wt'
] as const

export function getPosixOmpShellWrapper(): string {
  const subcommands = OMP_SUBCOMMANDS.join('|')
  return `# Why: OMP does not auto-load Orca's managed status extension; wrap only
# interactive launch invocations so subcommands such as \`omp config\` keep
# their normal argv shape.
__orca_omp_should_skip_extension() {
  case "\${1:-}" in
    help|--help|-h|--version|-v) return 0 ;;
    ${subcommands}) return 0 ;;
  esac
  return 1
}
__orca_omp() {
  local __orca_use_extension=1
  __orca_omp_should_skip_extension "\${1:-}" && __orca_use_extension=0
  if [[ $__orca_use_extension -eq 1 && -n "\${ORCA_OMP_STATUS_EXTENSION:-}" && -f "\${ORCA_OMP_STATUS_EXTENSION}" ]]; then
    if [[ "\${1:-}" == "launch" ]]; then
      shift
      command omp launch --extension "\${ORCA_OMP_STATUS_EXTENSION}" "$@"
    else
      command omp --extension "\${ORCA_OMP_STATUS_EXTENSION}" "$@"
    fi
  else
    command omp "$@"
  fi
}
if [[ -n "\${ORCA_OMP_STATUS_EXTENSION:-}" ]]; then
  # Why: an \`alias omp=...\` from the user's rc file expands the word "omp"
  # at parse time, turning \`omp() {\` into a syntax error before this line
  # ever runs. The \`function\` keyword form is not alias-expanded, so it
  # defines cleanly either way. Do not \`unalias omp\` here: bash resolves a
  # surviving alias once, then falls through to this function for the
  # expanded command, so a later \`omp userarg\` still reaches \`__orca_omp\`
  # with the user's alias flags intact (e.g. \`alias omp="omp --flag"\` yields
  # args \`--flag userarg\`). Unaliasing would silently drop those flags.
  function omp { __orca_omp "$@"; }
fi
`
}

export function getPowerShellOmpShellWrapper(): string {
  const subcommands = OMP_SUBCOMMANDS.map((value) => `'${value}'`).join(', ')
  return `# Why: OMP does not auto-load Orca's managed status extension; wrap only
# interactive launch invocations so subcommands such as \`omp config\` keep
# their normal argv shape.
function Global:__OrcaOmpShouldSkipExtension {
    param([string]$Name)
    $skip = @("help", "--help", "-h", "--version", "-v") + @(${subcommands})
    return $skip -contains $Name
}
if ($env:ORCA_OMP_STATUS_EXTENSION) {
    function Global:omp {
        $orcaUseExtension = -not (__OrcaOmpShouldSkipExtension -Name ([string]($args[0])))
        $orcaStatus = 0
        $orcaCommand = Get-Command omp -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $orcaCommand) {
            Write-Error "omp executable not found"
            $orcaStatus = 127
        } elseif ($orcaUseExtension -and $env:ORCA_OMP_STATUS_EXTENSION -and
            (Test-Path -LiteralPath $env:ORCA_OMP_STATUS_EXTENSION)) {
            if ($args.Count -gt 0 -and $args[0] -eq "launch") {
                $orcaLaunchArgs = @($args | Select-Object -Skip 1)
                & $orcaCommand.Source launch --extension $env:ORCA_OMP_STATUS_EXTENSION @orcaLaunchArgs
            } else {
                & $orcaCommand.Source --extension $env:ORCA_OMP_STATUS_EXTENSION @args
            }
            $orcaStatus = $LASTEXITCODE
        } else {
            & $orcaCommand.Source @args
            $orcaStatus = $LASTEXITCODE
        }

        $global:LASTEXITCODE = $orcaStatus
    }
}
`
}
