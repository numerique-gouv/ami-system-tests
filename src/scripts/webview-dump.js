// Liste les éléments interactifs du DOM de la WebView d'une session `wdio session` ouverte (just explore-android|ios|webapp).
// Lancé par `just webview <cible>` : le code est lu sur l'entrée standard par `wdio session exec`
// (npx wdio session -s <cible> exec < src/scripts/webview-dump.js).
// Sur mobile, bascule seule sur la WebView puis revient en natif. Sans WebView (écran natif), utiliser `just s <cible> snapshot -i`.
(async () => {
  if (browser.isMobile) {
    const web = (await browser.getContexts()).map(c => typeof c === 'string' ? c : c.id).find(c => c.startsWith('WEBVIEW'))
    if (!web) { console.log('Aucune WebView : écran natif (just s <cible> snapshot -i).'); return }
    await browser.switchContext(web)
  }
  const rows = await browser.execute(() => {
    const sel = 'button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], h1, h2, h3'
    const seen = new Set()
    return Array.from(document.querySelectorAll(sel)).filter(el => el.getClientRects().length > 0).map(el => {
      const labelled = el.getAttribute('aria-labelledby')
      const name = el.getAttribute('aria-label') || (labelled ? labelled.split(' ').map(i => document.getElementById(i)?.textContent || '').join(' ') : '') || (el.textContent || '').trim() || el.value || el.title || ''
      const role = el.getAttribute('role') || el.tagName.toLowerCase()
      return role + '  «' + name.replace(/\s+/g, ' ').trim().slice(0, 70) + '»' + (el.id ? '  #' + el.id : '')
    }).filter(r => !seen.has(r) && seen.add(r))
  })
  console.log(rows.length + ' éléments interactifs ou titres dans la WebView :')
  for (const r of rows) console.log('  ' + r)
  if (browser.isMobile) await browser.switchContext('NATIVE_APP')
})()
