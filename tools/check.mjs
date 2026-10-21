// Runs the checks side by side and says how each went, with its output when it
// failed. `node tools/check.mjs <npm script>...`; exits 1 when any fails.
import { spawn } from 'node:child_process'

const steps = process.argv.slice(2)
const started = Date.now()

const run = step =>
  new Promise(resolve => {
    const at = Date.now()
    const child = spawn(`npm run -s ${step}`, { shell: true })
    let output = ''
    child.stdout.on('data', chunk => (output += chunk))
    child.stderr.on('data', chunk => (output += chunk))
    child.on('close', code => resolve({ step, code, output, seconds: (Date.now() - at) / 1000 }))
  })

const results = await Promise.all(steps.map(run))
const width = Math.max(...steps.map(step => step.length))
for (const { step, code, output, seconds } of results) {
  console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${step.padEnd(width)} ${seconds.toFixed(1)}s`)
  if (code !== 0) {
    console.log(output.trimEnd().replace(/^/gm, '     '))
  }
}
console.log(`     ${((Date.now() - started) / 1000).toFixed(1)}s in all`)
process.exitCode = results.some(result => result.code !== 0) ? 1 : 0
