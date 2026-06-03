// Présentation E2E — Équipe AMI (audience non-dev)
// Format : 16:9, PDF statique → PPTX via make-pptx.py
// Pas de Touying : on évite le système de steps/animation et on maîtrise
// le layout directement.

#import "@preview/cetz:0.5.2": canvas, draw as cetz-draw

// ── Mise en page 16:9 ────────────────────────────────────────────────────────
#set page(
  width:  254mm,        // 10 pouces
  height: 142.875mm,    // 5.625 pouces (= 10 × 9/16)
  margin: (x: 1.4cm, y: 1.1cm),
  footer: context [
    #set text(size: 7pt, fill: luma(180))
    #align(right)[#counter(page).display() / #counter(page).final().first()]
  ],
)

#set text(size: 11pt)

// ── Charte visuelle (DSFR) ────────────────────────────────────────────────────
#let bleu-republique = rgb("#000091")
#let vert-verifie    = rgb("#18753C")
#let gris-neutre     = luma(240)

// ── Helpers ───────────────────────────────────────────────────────────────────

// Placeholder visuel à remplacer par une vraie image (presentation/assets/).
#let visual-placeholder(label, height: 8em) = rect(
  fill:   luma(230),
  stroke: 1pt + luma(180),
  width:  100%,
  height: height,
  radius: 4pt,
)[#align(center + horizon)[#text(fill: luma(120), style: "italic")[[ #label ]]]]

// Vignette pour la grille des capacités débloquées.
#let capability-card(icon-label, title, body) = rect(
  fill:   gris-neutre,
  inset:  0.9em,
  radius: 5pt,
  width:  100%,
)[
  #text(size: 1.2em, fill: bleu-republique, weight: "bold")[#icon-label]
  #v(0.2em)
  #text(size: 0.95em, weight: "bold")[#title]
  #v(0.15em)
  #text(size: 0.82em)[#body]
]

// Layout 2 colonnes.
#let two-column(left, right, ratio: (1fr, 1fr)) = grid(
  columns: ratio,
  gutter:  1.8em,
  left, right,
)

// Diagramme quadrant : portée du code (X) × niveau fonctionnel (Y).
// Trois ellipses sur la diagonale : règles de gestion → transactions → workflows.
// Triangles de coin : inutilité (haut-gauche), fragilité (bas-droite).
#let test-quadrant() = {
  let c-inu  = rgb("#FFFBEA")
  let c-frag = rgb("#FFEDEC")
  let c-diag = bleu-republique.lighten(72%)
  let c-brd  = luma(195)

  // Dimensions du canvas (1 unité ≈ 1 cm).
  let ox = 1.4   // origine X (marge pour label axe Y)
  let oy = 0.6   // origine Y (marge pour label axe X)
  let W  = 8.8   // bord droit
  let H  = 6.1   // bord haut

  // Curseur diagonal : 48 % de la diagonale → frontière inutilité / fragilité.
  let sx = ox + (W - ox) * 0.48
  let sy = oy + (H - oy) * 0.48

  // Centres des trois ellipses sur la diagonale.
  let e1 = (ox + 1.25, oy + 0.95)
  let e2 = ((ox + W) / 2.0, (oy + H) / 2.0)
  let e3 = (W - 1.25, H - 0.95)
  let e-rx = 1.45
  let e-ry = 0.64

  canvas({
    import cetz-draw: *

    // Fond de la zone de tracé.
    rect((ox, oy), (W, H), fill: luma(250), stroke: 0.5pt + c-brd)

    // Triangle haut-gauche : zone d'inutilité.
    line((ox, sy), (ox, H), (sx, H), close: true, fill: c-inu, stroke: none)

    // Triangle bas-droite : zone de fragilité.
    line((sx, oy), (W, oy), (W, sy), close: true, fill: c-frag, stroke: none)

    // Ellipses des trois couches de tests.
    let e-stroke = 0.65pt + bleu-republique.lighten(38%)
    circle(e1, radius: (e-rx, e-ry), fill: c-diag, stroke: e-stroke)
    circle(e2, radius: (e-rx, e-ry), fill: c-diag, stroke: e-stroke)
    circle(e3, radius: (e-rx, e-ry), fill: c-diag, stroke: e-stroke)

    // Labels dans les ellipses.
    content(e1, [#align(center)[
      #text(size: 7pt, weight: "bold")[Règles de gestion]\
      #text(size: 6.5pt)[tests unitaires]
    ]])
    content(e2, [#align(center)[
      #text(size: 7pt, weight: "bold")[Transactions]\
      #text(size: 6.5pt)[tests d'intégration]
    ]])
    content(e3, [#align(center)[
      #text(size: 7pt, weight: "bold")[Workflows]\
      #text(size: 6.5pt)[tests E2E]
    ]])

    // Étiquettes des coins.
    content((ox + 0.18, H - 0.2),
      text(size: 6pt, style: "italic", fill: luma(155))[Zone d'inutilité],
      anchor: "north-west")
    content((W - 0.18, oy + 0.22),
      text(size: 6pt, style: "italic", fill: luma(155))[Zone de fragilité],
      anchor: "south-east")

    // Axes fléchés.
    line((ox, oy), (W + 0.5, oy), mark: (end: ">", fill: black), stroke: 1pt)
    line((ox, oy), (ox, H + 0.5), mark: (end: ">", fill: black), stroke: 1pt)

    // Labels des axes.
    content((W + 0.62, oy), text(size: 6.5pt)[portée du code], anchor: "west")
    content((ox, H + 0.62), text(size: 6.5pt)[parcours nominal], anchor: "south")
  })
}

// Étiquette colorée utilisée à la place des icônes SVG externes.
#let icon-tag(label) = box(
  fill: bleu-republique, inset: (x: 0.4em, y: 0.18em), radius: 3pt,
)[#text(fill: white, weight: "bold", size: 0.85em)[#label]]

// Cadre démo : grand espace central pour la vidéo de backup ou une image fixe.
#let demo-frame(label) = rect(
  fill:   luma(220),
  stroke: 2pt + bleu-republique,
  width:  100%,
  height: 21em,
  radius: 6pt,
)[#align(center + horizon)[
  #text(size: 1em, fill: luma(100), style: "italic")[[ #label ]]
]]

// Titre de slide — barre de titre alignée à gauche.
#let slide-title(t) = {
  text(size: 1.3em, weight: "bold")[#t]
  v(0.5em)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 1 — Le filet sous le trapèze
//
// Accroche orale (~30 s) :
// « On a 1 scénario automatisé qui rejoue l'app comme un vrai utilisateur,
//   sur iOS ET Android. Aujourd'hui, je veux vous montrer ce que ça nous
//   permet — pas comment c'est fait. »
// ═══════════════════════════════════════════════════════════════════════════════
#align(center + horizon)[
  #text(size: 2.3em, weight: "bold", fill: bleu-republique)[
    Tests E2E :\
    stabiliser le passé pour un futur plus serein.
  ]
  #v(0.5em)
  #text(size: 1.25em)[
    Ce que nous pouvons tester, ce que ça change, ce que nous pouvons faire maintenant.
  ]
]

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 2 — Ce que ça change
// ═══════════════════════════════════════════════════════════════════════════════
#pagebreak()
#slide-title[Ce que l'on teste]
#two-column(
  [
    #text(size: 1.1em)[
      *Un test ne garantit pas l'absence de bug, mais la présence d'une fonctionnalité attendue*\
      1. Les tests unitaires vérifient le détail des règles de gestions, ils simulent peu de code, ont besoin de peu de données, bref, ils sont pas chers et rapides.
      2. Les tests juste au-dessus vérifient que les règles de gestions se combinent correctement, ils simulent plus de code, ont besoin de plus de données, ils sont un peu plus chers, moins nombreux, toujours rapides.
      42. Les tests End-to-End (E2E) vérifient que le câblage est correct entre tous les composants du système, avec beaucoup de code, de données et de raisons de planter.

      Pour stabiliser les tests E2E, on ne teste que le fait de parcourir le workflow de l'usager dans son cas nominal avec des données bien rangées sans vérifier les cas aux bornes.
     ]
  ],
     [
       #test-quadrant()
     ],
)

#pagebreak()
#slide-title[Ce que ça change]
#two-column(
  [
    #text(size: 1.1em)[
      *Désormais, nous saurons pour chaque parcours s'il fonctionne :*
    + sur quels appareils,
    + sur quelles branches,
    + et dans quelles versions.
    ]
    #v(0.8em)
    #text(size: 1.1em)[
      *À chaque release, nous avons une preuve de bon fonctionnement de chaque
      parcours existant.*\
      Quand les tests sont passés à chaque merge, le premier test non passant est dû au merge en cours (ou à un problème externe — e.g. infra).
    ]
    #v(0.8em)
    #text(size: 1.1em)[
      *Ces tests sont des mini-démo, des mini-tutoriels toujours à jour.*\
      Ils montrent un parcours attendu à l'exécution.\
      Ils montrent comment le faire dans le code de tests,\
      Ils bloquent les livraisons si ils ne sont pas à jours.\
    ]
  ],
  [
    #image("assets/allure_report.png", width: 100%)
    #text(size: 1.1em)[
      NDLR.: Image de la documentation officielle, pas notre projet.
     ]
  ],
)

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 3 — Démo live + vidéo de secours
//
// Format retenu : démo live sur simulateur.
// Vidéo MP4 en backup si problème (wifi, simulateur, mauvais build).
// À préparer AVANT la présentation, pas le matin même.
//
// Ce que la démo montre (notifications.test.ts) :
//   1. L'app s'ouvre toute seule sur le simulateur.
//   2. FranceConnect s'authentifie automatiquement.
//   3. Une notification est émise depuis le terminal.
//   4. L'inbox la reçoit après pull-to-refresh.
// ═══════════════════════════════════════════════════════════════════════════════
#pagebreak()
#slide-title[Démo live — ou vidéo de secours]
// PDF : placeholder. PPTX : vidéo embarquée via just pptx-equipe.
#demo-frame("▶ vidéo intégrée dans le PPTX — cliquer pour lancer")
#v(0.4em)
#text(size: 0.9em)[
  L'app s'ouvre. · FranceConnect s'authentifie. · Une notification arrive. · L'inbox la reçoit.
]

// ═══════════════════════════════════════════════════════════════════════════════
// Slide 5 — Les nouvelles capacités débloquées
// ═══════════════════════════════════════════════════════════════════════════════
#pagebreak()
#slide-title[Ce qu'on peut faire maintenant — qu'on ne pouvait pas faire avant.]
#grid(
  columns: (1fr, 1fr),
  rows:    (auto, auto),
  gutter:  0.7em,
  capability-card(
    icon-tag("◉"), "Tester sur les vrais téléphones",
    [La même suite tourne sur des « device farms » (BrowserStack, SauceLabs, TestingBot) : un parc d'iPhone / Android réels, pas seulement des simulateurs.],
  ),
  capability-card(
    icon-tag("⊕"), "Tester deux utilisateurs en même temps (usager et partenaire)",
    [Un partenaire envoie une notif, un usager la reçoit — tout dans le même scénario.],
  ),
  capability-card(
    icon-tag("◐"), "Tester un parcours natif + web",
    [L'app a des écrans natifs et des écrans web embarqués. La suite passe de l'un à l'autre — invisible pour l'usager, vérifié pour nous.],
  ),
  capability-card(
    icon-tag("↩"), "Compatibilité descendante",
    [Quand l'app native évolue, on peut rejouer les parcours pour vérifier que l'ancienne version installée ne casse pas.],
  ),
)
#v(0.3em)
#text(size: 0.9em, style: "italic")[
  — et rejouer tout ça sans dépenser de temps humain à chaque release.\
  — et commencer l'implémentation de scenario plus complet ou complexes.
]
