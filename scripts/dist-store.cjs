#!/usr/bin/env node
/* Build the Mac App Store edition and prove it carries no self-update
 * machinery — App Review rejects apps that add update checks to the
 * Store's own. The direct edition (tag push → CI) is untouched.
 *
 *   pnpm dist:store                       first submission of this version
 *   FOOLSCAP_STORE_SUBMISSION=2 pnpm dist:store   resubmission (build number rises)
 *
 * Steps: electron-vite build with FOOLSCAP_EDITION=store (the '#updater'
 * alias points at the no-op channel, so electron-updater is never
 * imported) → assert the main bundle → electron-builder --mac mas
 * --universal with a rising CFBundleVersion → assert the packaged app:
 * no app-update.yml, no node_modules in the asar, no updater strings in
 * the bundle → rebuild out/ as the direct edition so dev and CI start
 * from the default. Any failed assertion exits non-zero before a pkg
 * exists. */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)
const submission = Number(process.env.FOOLSCAP_STORE_SUBMISSION ?? 1)
if (![major, minor, patch].every(Number.isInteger) || !Number.isInteger(submission) || submission < 1 || submission > 99) {
  console.error(`dist-store: cannot derive a build number from ${pkg.version} / submission ${submission}`)
  process.exit(2)
}
/* CFBundleVersion must rise with every upload, including resubmissions of
 * one marketing version: M.YY.ZZ.SS packed into one integer, so 0.16.0 #1
 * is 160001, its resubmission 160002, and 0.16.1 #1 is 160101. */
const buildNumber = String(major * 1_000_000 + minor * 10_000 + patch * 100 + submission)

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
const fail = (msg) => {
  console.error(`\ndist-store: ${msg}`)
  process.exit(1)
}

console.log(`\ndist-store: Foolscap ${pkg.version}, build ${buildNumber} (submission ${submission})\n`)
run('pnpm', ['exec', 'electron-vite', 'build'], { FOOLSCAP_EDITION: 'store' })

const main = fs.readFileSync(path.join(root, 'out/main/index.js'), 'utf8')
if (main.includes('electron-updater')) fail('out/main/index.js still references electron-updater')
if (!main.includes('"store"')) fail('out/main/index.js was not built with FOOLSCAP_EDITION=store')

run('pnpm', [
  'exec', 'electron-builder', '--mac', 'mas', '--universal', '--publish', 'never',
  `--config.buildVersion=${buildNumber}`
])

const app = path.join(root, 'dist/mas-universal/Foolscap.app')
if (fs.existsSync(path.join(app, 'Contents/Resources/app-update.yml'))) fail('app-update.yml is in the bundle')
const asar = fs.readFileSync(path.join(app, 'Contents/Resources/app.asar'))
const headerLen = asar.readUInt32LE(12)
const header = JSON.parse(asar.subarray(16, 16 + headerLen).toString('utf8'))
if ('node_modules' in header.files) fail(`asar carries node_modules: ${Object.keys(header.files.node_modules.files).join(', ')}`)
const packedMain = header.files.out?.files?.main?.files?.['index.js']
if (!packedMain) fail('asar has no out/main/index.js')
if (asar.subarray(16 + headerLen).includes('electron-updater')) fail('asar contents mention electron-updater')
const bundleVersion = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', path.join(app, 'Contents/Info.plist')]).toString().trim()
if (bundleVersion !== buildNumber) fail(`CFBundleVersion is ${bundleVersion}, expected ${buildNumber}`)
const marketing = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(app, 'Contents/Info.plist')]).toString().trim()
if (marketing !== pkg.version) fail(`CFBundleShortVersionString is ${marketing}, expected ${pkg.version}`)

const pkgs = fs.readdirSync(path.join(root, 'dist/mas-universal')).filter((f) => f.endsWith('.pkg'))
console.log(`\ndist-store: clean — no updater, no feed file, no node_modules; ${pkg.version} (${bundleVersion})`)
for (const f of pkgs) console.log(`dist-store: ${path.join('dist/mas-universal', f)}`)

// Leave out/ as the direct edition, the default everything else expects.
run('pnpm', ['exec', 'electron-vite', 'build'])
