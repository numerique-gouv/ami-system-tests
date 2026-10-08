import fs from 'fs'
import path from 'path'

/**
 * Retire du JUnit XML les lignes brutes `COMMAND: …` / `RESULT: …` (et le séparateur `...command output...`) que le reporter
 * JUnit de WebdriverIO ajoute dans le `<system-out>` de chaque test. Il n'a pas d'option pour les désactiver, et elles noient la
 * console du scénario (`addWorkerLogs`) qui, elle, raconte ce qui s'est passé. Les commandes WebDriver restent dans les logs
 * Appium (`.wdio-logs/`). Appelé une fois tous les fichiers écrits (hook `onComplete` du lanceur).
 */
const RAW_LINE = /^(COMMAND|RESULT): /
const SEPARATOR = '...command output...'

export function stripRawCommandLogs(junitDir: string): number {
  if (!fs.existsSync(junitDir)) return 0
  let cleaned = 0
  for (const file of fs.readdirSync(junitDir).filter(f => f.endsWith('.xml'))) {
    const full = path.join(junitDir, file)
    const xml = fs.readFileSync(full, 'utf8')
    const out = xml.replace(/(<system-out><!\[CDATA\[)([\s\S]*?)(\]\]><\/system-out>)/g, (_match, open: string, body: string, close: string) =>
      open + body.split('\n').filter(line => !RAW_LINE.test(line) && line.trim() !== SEPARATOR).join('\n').replace(/\n{3,}/g, '\n\n') + close)
    if (out !== xml) {
      fs.writeFileSync(full, out)
      cleaned++
    }
  }
  return cleaned
}
