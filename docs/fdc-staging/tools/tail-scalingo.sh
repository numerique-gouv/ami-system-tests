#!/usr/bin/env bash
# tail-scalingo.sh — Collecte les logs Scalingo en parallèle de la capture Playwright
#
# Usage (dans un second terminal) :
#   cd docs/fdc-staging/tools && ./tail-scalingo.sh
#
# Sortie :
#   ../scalingo-logs.txt

set -euo pipefail

OUT="$(dirname "$0")/../scalingo-logs.txt"
APP="ami-back-staging"

echo "📡 Collecting logs for ${APP} → ${OUT}"
echo "   Arrêtez avec Ctrl+C après la capture Playwright."

# --lines 0 démarre depuis le moment présent ; on enrichira avec les lignes
# générées pendant le parcours utilisateur.
scalingo --app "${APP}" logs --follow 2>&1 | tee "${OUT}"
