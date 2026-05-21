// Diagnostique l'accessibilité d'un item de menu WebView via Chrome DevTools Protocol (CDP).
//
// CONTEXTE : runScript s'exécute dans GraalVM côté Maestro — il n'y a PAS de `document`.
// Ce script ne peut PAS injecter du JS dans la WebView (Runtime.evaluate nécessite WebSocket,
// pas HTTP). Ce qu'il peut faire : interroger l'endpoint REST CDP pour vérifier que la WebView
// est bien connectée et visible par Maestro.
//
// Variables injectées par runScript.env (GraalVM — pas de process.env) :
//   MENU_ITEM_TEXT  — texte de l'entrée de menu à trouver (ex: "Préférences")
//   CDP_PORT        — port TCP forwarded par Maestro (défaut: 9222)
//
// Output :
//   output.menu_item_found  — "true" si l'élément a été trouvé dans la hiérarchie CDP
//   output.menu_item_text   — valeur de MENU_ITEM_TEXT (pour usage dans le flow appelant)

/* global MENU_ITEM_TEXT, CDP_PORT, http, output */  // globales injectées par Maestro GraalVM
try {
  var menuText = MENU_ITEM_TEXT;
  var cdpPort  = CDP_PORT || '9222';

  if (!menuText) {
    throw new Error('MENU_ITEM_TEXT est obligatoire (ex: "Préférences")');
  }

  // ── Étape 1 : Lister les cibles CDP disponibles ──────────────────────────
  // GET /json est l'unique endpoint REST CDP (pas de WebSocket nécessaire).
  // Il retourne la liste des onglets/frames de la WebView.
  var listUrl = 'http://localhost:' + cdpPort + '/json';
  var listResp;
  try {
    listResp = http.get(listUrl);
  } catch (e) {
    // CDP non accessible → androidWebViewHierarchy: devtools absent ou port différent
    console.log('[webview-menu-click] CDP non accessible à ' + listUrl
      + ' — vérifier que androidWebViewHierarchy: devtools est dans le flow appelant.');
    console.log('[webview-menu-click] Erreur : ' + e.message);
    output.menu_item_found = 'cdp_unavailable';
    output.menu_item_text  = menuText;
    throw new Error(
      'CDP inaccessible (port ' + cdpPort + '). '
      + 'Solutions : (1) ajouter androidWebViewHierarchy: devtools au flow appelant, '
      + '(2) corriger les attributs ARIA du menu dans la WebApp pour que Maestro '
      + 'trouve "' + menuText + '" via tapOn text: directement.'
    );
  }

  if (listResp.status !== 200) {
    throw new Error('CDP /json a retourné HTTP ' + listResp.status);
  }

  var targets = JSON.parse(listResp.body);
  console.log('[webview-menu-click] CDP cibles disponibles : ' + targets.length);

  // ── Étape 2 : Chercher le texte dans les titres/URLs visibles ────────────
  // NOTE : Runtime.evaluate (injection JS → document.querySelector) nécessite
  // WebSocket — impossible depuis le client http Maestro. On ne peut inspecter
  // ici que les métadonnées des cibles (title, url), pas le DOM complet.
  var found = false;
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    console.log('[webview-menu-click] cible[' + i + '] type=' + t.type
      + ' title=' + t.title + ' url=' + t.url);
    if (t.title && t.title.indexOf(menuText) !== -1) {
      found = true;
    }
  }

  output.menu_item_found = found ? 'true' : 'false';
  output.menu_item_text  = menuText;

  // ── Étape 3 : Message d'orientation si l'item n'est pas trouvé ───────────
  // L'injection JS dans la WebView (Runtime.evaluate via CDP WebSocket) permettrait
  // de faire : document.querySelectorAll('[role="menuitem"]')
  //               .find(el => el.textContent.trim() === menuText)?.click()
  // Mais Maestro runScript ne supporte pas WebSocket.
  //
  // Vraie solution : corriger la WebApp pour exposer les items du menu dans
  // l'arbre d'accessibilité (attributs role="menuitem" + aria-label, ou
  // tabIndex={0} sur chaque item pour qu'ils remontent dans le CDP hierarchy).
  // Maestro avec androidWebViewHierarchy: devtools pourra alors les trouver
  // via tapOn text: normalement.
  if (!found) {
    console.log('[webview-menu-click] "' + menuText + '" non trouvé dans les métadonnées CDP. '
      + 'Pour déboguer : ouvrir chrome://inspect sur le bureau pendant le test '
      + 'et vérifier si les items du dropdown menu sont dans le DOM inspectable. '
      + 'Si oui, ajouter role="menuitem" ou tabIndex sur chaque item.'
    );
  }

} catch (e) {
  if (e.message && e.message.indexOf('CDP inaccessible') === 0) throw e;
  console.log('[webview-menu-click] ERREUR : ' + e.message);
  output.menu_item_found = 'error';
  output.menu_item_text  = (typeof MENU_ITEM_TEXT !== 'undefined') ? MENU_ITEM_TEXT : '';
  throw e;
}