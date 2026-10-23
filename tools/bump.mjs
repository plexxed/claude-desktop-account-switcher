// Sets the version for a release, in every place that carries it: the plugin's
// manifest (.claude-plugin/plugin.json), the PowerShell module's manifest, whose
// ModuleVersion must be written out (a .psd1 is data and reads nothing else),
// and the changelog, whose Unreleased section becomes the version's, dated
// today in UTC, with its compare link. Nothing is written unless every file
// can be; committing and tagging stay the person's.
//
//   npm run bump -- 0.2.0
import { readFileSync, writeFileSync } from 'node:fs'

const PLUGIN = '.claude-plugin/plugin.json'
const MODULE = 'scripts/AccountSwitcher.psd1'
const CHANGELOG = 'CHANGELOG.md'

// MAJOR.MINOR.PATCH only: ModuleVersion is a System.Version, which takes no
// pre-release, and the release workflow runs for tags like v0.2.0.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function fail(message) {
  console.error(message)
  process.exit(1)
}

const parts = version => version.split('.').map(Number)
const isNewer = (next, current) => {
  const [a, b] = [parts(next), parts(current)]
  const at = a.findIndex((n, i) => n !== b[i])

  return at !== -1 && a[at] > b[at]
}

/** `text` with the one match of `pattern` replaced; fails naming `file` when there is not exactly one. */
function replaceOnce(file, text, pattern, replacement) {
  const matches = text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)) ?? []
  if (matches.length !== 1) {
    fail(`${file}: expected one match of ${pattern}, found ${matches.length}.`)
  }

  return text.replace(pattern, replacement)
}

const next = process.argv[2]
if (!next || !VERSION.test(next)) {
  fail('Usage: npm run bump -- <MAJOR.MINOR.PATCH>')
}

const plugin = readFileSync(PLUGIN, 'utf8')
const current = JSON.parse(plugin).version
if (!isNewer(next, current)) {
  fail(`${next} is not newer than ${current}, the version ${PLUGIN} carries.`)
}

const module = readFileSync(MODULE, 'utf8')
const moduleVersion = /^\s*ModuleVersion\s*=\s*'([^']*)'/m.exec(module)?.[1]
if (moduleVersion !== current) {
  fail(`${MODULE} says ${moduleVersion ?? 'no ModuleVersion'}, ${PLUGIN} says ${current}: make them agree first.`)
}

const changelog = readFileSync(CHANGELOG, 'utf8')
const unreleased = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[|^\[Unreleased\]:)/m.exec(changelog)
if (!unreleased) {
  fail(`${CHANGELOG} has no Unreleased section.`)
}
if (!unreleased[1].trim()) {
  fail(`${CHANGELOG} has nothing under Unreleased: say what the release changes first.`)
}

const today = new Date().toISOString().slice(0, 10)
const updated = {
  [PLUGIN]: replaceOnce(PLUGIN, plugin, /("version"\s*:\s*)"[^"]*"/, `$1"${next}"`),
  [MODULE]: replaceOnce(MODULE, module, /^(\s*ModuleVersion\s*=\s*)'[^']*'/m, `$1'${next}'`),
  [CHANGELOG]: replaceOnce(
    CHANGELOG,
    replaceOnce(CHANGELOG, changelog, /^## \[Unreleased\][^\n]*\n/m, `$&\n## [${next}] - ${today}\n`),
    /^\[Unreleased\]: (\S+)\/compare\/v\S+\.\.\.HEAD$/m,
    `[Unreleased]: $1/compare/v${next}...HEAD\n[${next}]: $1/compare/v${current}...v${next}`,
  ),
}

for (const [file, text] of Object.entries(updated)) {
  writeFileSync(file, text)
}
console.log(`${current} -> ${next} in ${Object.keys(updated).join(', ')}. Commit, then tag v${next} once it is on main.`)
