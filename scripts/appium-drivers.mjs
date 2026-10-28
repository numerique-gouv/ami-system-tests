// Installe (ou met à jour) les drivers Appium du projet : `npm run appium:install` / `npm run appium:update`.
//
// Mode « APPIUM_HOME projet » d'Appium (APPIUM_HOME non défini) : les drivers vont dans node_modules/ du dépôt, le manifeste dans
// node_modules/.cache/appium. Pour chaque driver : `uninstall` puis `install` (contournement des liens `appium` cassés d'un APPIUM_HOME
// externe, et réparation après un déplacement du dépôt). Tolérance limitée à l'`uninstall` d'un driver absent (runner neuf) ; un échec
// d'`install` fait échouer le script. `appium driver install` écrit les drivers dans package.json / package-lock.json (devDependencies
// en `^x.y.z`) : ces deux fichiers sont restaurés à la fin, les drivers restent dans node_modules. Un `npm ci`/`npm install` ultérieur
// les efface (ils ne sont pas dans package.json) : relancer `npm run appium:install`.
import {spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'

// Source unique des versions figées.
const DRIVERS = [
  {name: 'uiautomator2', version: '8.7.2'},
  {name: 'xcuitest', version: '12.21.0'},
]
const FILES = ['package.json', 'package-lock.json']
const mode = process.argv[2]
if (mode !== 'install' && mode !== 'update') {
  console.error('usage : node scripts/appium-drivers.mjs <install|update>')
  process.exit(2)
}

const appium = (...args) => spawnSync('npx', ['appium', 'driver', ...args], {encoding: 'utf8', env: {...process.env, FORCE_COLOR: '0'}})
const snapshot = Object.fromEntries(FILES.map(f => [f, readFileSync(f, 'utf8')]))
let failure = null
try {
  for (const {name, version} of DRIVERS) {
    const un = appium('uninstall', name)
    if (un.status !== 0) {
      if (!/not installed/i.test(`${un.stdout}${un.stderr}`)) throw new Error(`uninstall ${name} : échec\n${un.stdout}${un.stderr}`)
      console.log(`${name} : absent, rien à désinstaller`)
    }
    const spec = mode === 'install' ? `${name}@${version}` : name
    const inst = spawnSync('npx', ['appium', 'driver', 'install', spec], {stdio: 'inherit'})
    if (inst.status !== 0) throw new Error(`install ${spec} : échec (code ${inst.status})`)
  }
} catch (e) {
  failure = e
} finally {
  for (const f of FILES) writeFileSync(f, snapshot[f])
}
if (failure) {
  console.error(failure.message)
  process.exit(1)
}
spawnSync('npx', ['appium', 'driver', 'list', '--installed'], {stdio: 'inherit'})
if (mode === 'update') console.log('Mise à jour faite : reporter les nouvelles versions figées dans scripts/appium-drivers.mjs.')
