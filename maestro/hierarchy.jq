# hierarchy.jq — filtre la hiérarchie Maestro aux nœuds utiles pour l'écriture de tests
#
# Champs conservés (correspondent aux sélecteurs Maestro) :
#   label   → tapOn: label: "…"        (accessibilityText iOS / contentDescription Android)
#   text    → tapOn: text:  "…"        (texte visible)
#   id      → tapOn: id:    "…"        (resource-id Android)
#   hint    → assertVisible: hint: "…" (placeholder / hintText)
#   enabled → indique si l'élément est interactif
#
# Les nœuds sans aucun de ces champs (enveloppes SwiftUI/React Native) sont ignorés.

def useful_node:
  .attributes |
  ((.accessibilityText // "" | length) > 0) or
  ((.text            // "" | length) > 0) or
  ((.["resource-id"] // "" | length) > 0) or
  ((.hintText        // "" | length) > 0);

def extract:
  # Émettre ce nœud s'il contient quelque chose d'utile
  (if useful_node then
    .attributes | {
      label:   (if (.accessibilityText | length) > 0 then .accessibilityText else null end),
      text:    (if (.text            | length) > 0 then .text            else null end),
      id:      (if (.["resource-id"] | length) > 0 then .["resource-id"] else null end),
      hint:    (if (.hintText        | length) > 0 then .hintText        else null end),
      enabled: .enabled
    }
    # Supprimer les champs null et les doublons text == label
    | with_entries(select(.value != null))
    | if .text == .label then del(.text) else . end
  else
    empty
  end),
  # Toujours descendre dans les enfants, même si ce nœud n'est pas utile
  (.children[]? | extract);

[extract]