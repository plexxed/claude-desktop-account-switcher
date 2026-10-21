import { expect, test } from 'claude-code/testing'

import { COMMANDS } from '../hooks/commands/registry'
import { dataDirOf } from '../hooks/platform/paths'
import { INDEX_FILE, asIndex } from '../hooks/services/readModel'
import { SWITCH_RUN_FILE, asSwitchRun } from '../hooks/services/switchRun'
import { SCRIPT_COMMANDS, ScriptExit } from '../hooks/services/switcher'
import { DATA_DIR_CASES } from './fixtures/data-dirs'
import { DATA_FILE_CASES } from './fixtures/data-files'
import { EXIT_CODE_CASES } from './fixtures/exit-codes'
import { INDEX_SAMPLES } from './fixtures/index-sample'
import { SCRIPT_COMMANDS as SCRIPT_COMMAND_NAMES } from './fixtures/script-commands'
import { SWITCH_RUN_SAMPLES } from './fixtures/switch-run-sample'

// What the mod and the switcher script must agree on, each side tested against
// the same fixtures: AccountSwitcher.Tests.ps1 holds the script to them.

test('the mod reads every exit code of the script as the script means it', () => {
  const { NotRun: _notRun, ...codes } = ScriptExit

  expect(codes).toEqual(Object.fromEntries(EXIT_CODE_CASES.map(({ exit, code }) => [exit, code])))
})

test('the mod knows the commands the script takes, and hands it no other', () => {
  expect([...SCRIPT_COMMANDS]).toEqual(SCRIPT_COMMAND_NAMES)
  expect(SCRIPT_COMMAND_NAMES).toEqual(expect.arrayContaining(Object.keys(COMMANDS)))
})

for (const { case: name, env, dataDir } of DATA_DIR_CASES) {
  test(`the data folder is where the script keeps it: ${name}`, () => {
    expect(dataDirOf(env)).toBe(dataDir)
  })
}

test('the files the mod reads are named as the script names them', () => {
  const names = { index: INDEX_FILE, switchRun: SWITCH_RUN_FILE }

  for (const { file, name } of DATA_FILE_CASES) {
    expect(names[file]).toBe(name)
  }
})

test('switch.json as the script writes it reads as the run it describes; another version as none', () => {
  for (const { version, ...run } of SWITCH_RUN_SAMPLES) {
    expect(asSwitchRun({ version, ...run })).toEqual(run)
    expect(asSwitchRun({ version: version + 1, ...run })).toBeNull()
  }
})

test('index.json as the script writes it reads as its profiles', () => {
  for (const sample of INDEX_SAMPLES) {
    expect(asIndex(sample)).toEqual({
      lastSwitchedTo: sample.lastSwitchedTo,
      list: sample.profiles,
      accounts: Object.fromEntries(
        Object.entries(sample.accounts).map(([id, seen]) => [id, { org: seen.org ?? null, email: seen.email ?? null }]),
      ),
    })
  }
})
