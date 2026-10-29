// Chaque IDP est un `<button type="submit" role="link">` dont Chrome calcule le nom accessible avec une espace finale : `role/link[name="…"]` ne le trouve pas, d'où le texte « contient ».
export const fcEidasLocators = {
  eidasFaibleLink: 'button*=eIDAS faible',
}

/** iOS : le même bouton lu dans l'arbre natif, sans passer par le débogueur WebKit : constate l'apparition de la page eIDAS et sa disparition après le clic. */
export const iosEidasLinkNativeAx = '-ios predicate string:label CONTAINS[c] "eidas faible"'

/** iOS : la page eIDAS OU la feuille native « Activez les notifications » (session FranceConnect déjà ouverte : aucune page eIDAS à attendre). */
export const iosEidasOrNotificationSheetNativeAx =
  '-ios predicate string:label CONTAINS[c] "eidas faible" OR label CONTAINS[c] "notifications pour suivre"'
