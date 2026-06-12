---
title: Présentation
layout: layouts/page.njk
eleventyNavigation:
  key: Présentation
  parent: Documentation
  order: 1
---

## Tests E2E mobiles

Ce dépôt contient les tests end-to-end de l'application AMI, ciblant iOS et Android via WebdriverIO v9 + Appium 3.

La suite de tests vérifie les parcours utilisateur critiques : authentification FranceConnect, consultation des démarches, réception des notifications push.

## Exemple : helper WebView

Le helper `withWebView()` encapsule tous les changements de contexte Appium.
Il garantit qu'on ne sort jamais du contexte WebView en cours de flow, ce qui évite
le blocage de ~25 s observé lors des redirections FranceConnect sur iOS.

{% codefile "../src/helpers/webview.ts", "ts" %}
