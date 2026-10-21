// Has Claude Code write the plugin API's type declarations into
// .claude-plugin/types/, which the type check reads (tsconfig.json). Claude Code
// writes them only when a session loads the mod from a folder it watches, so
// this starts one that watches this folder and ends at once: with a
// configuration folder of its own and no account, it fails to sign in, after
// the declarations are written. For CI, which has no session; locally, any
// session that loaded the mod wrote them.
//
//   node tools/types.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DECLARATIONS = '.claude-plugin/types/claude-code/index.d.ts'

const config = mkdtempSync(join(tmpdir(), 'account-switcher-types-'))
// A headless session writes into a --plugin-dir folder only while it watches it.
const env = { ...process.env, CLAUDE_CONFIG_DIR: config, ANTHROPIC_API_KEY: 'not-a-key', CLAUDE_CODE_PLUGIN_DIR_WATCH: '1' }
// The mod is loaded from this folder alone, not from a development setup's list.
delete env.CLAUDE_CODE_PLUGIN_DIRS

// One command line through the shell, which finds npm's claude shim on Windows.
let run
try {
  run = spawnSync('claude --plugin-dir . -p ping', { env, shell: true, encoding: 'utf8', timeout: 120_000 })
} finally {
  rmSync(config, { recursive: true, force: true })
}

if (!existsSync(DECLARATIONS)) {
  // What Claude Code said, so a failure says why.
  const said = [run.error?.message, run.stdout, run.stderr].filter(Boolean).join('\n').trim()
  console.error(`Claude Code did not write ${DECLARATIONS} (exit ${run.status}); is it installed and on PATH?`)
  if (said) {
    console.error(said)
  }
  process.exitCode = 1
}
