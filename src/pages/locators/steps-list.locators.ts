/**
 * Sélecteurs des listes d'étapes (`/#/checklist/<id>/`, sections `…/checks/<section>/`, page d'un item `…/item/<id>/`).
 * WebView/webapp, DOM identique — relevé en live le 2026-10-15 sur 5 listes (préprod).
 *
 * Deux types d'items à lien (réunion du 2026-10-06, 20:40–21:25) : un item à UN lien mène directement à une page externe
 * (`item-button-direct-link-<id>`), un item à PLUSIEURS liens ouvre d'abord une page intermédiaire (`item-button-page-link-<id>`,
 * nom accessible « Voir le détail de ce point »). Le type n'est lisible que dans le `data-testid` (le nom accessible du bouton
 * direct est le texte du lien) : exception documentée à CONTRIBUTING §2.
 *
 * Ces boutons mesurent 0×0 px : c'est le motif DSFR du « lien étiré » (la zone cliquable est un pseudo-élément qui couvre l'item).
 * WDIO les refuse (« did not become interactable ») : le clic passe par `HTMLElement.click()`.
 */
export const stepsListLocators = {
  /** Entrées de l'onglet « Trouver de l’aide » de Services qui ouvrent une liste d'étapes. */
  listEntry: 'button[data-testid^="service-steps-"]',
  title: 'h1',
  /** Boutons de section (« Cas général 0/7 »), dans la navigation de la liste. */
  sectionButton: 'nav li button',
  /** Boutons-liens d'items (directs et pages intermédiaires), de taille nulle. */
  itemLinkButton: 'button[data-testid^="item-button-"]',
  directLinkPrefix: 'item-button-direct-link-',
  pageLinkPrefix: 'item-button-page-link-',
  /** Dans la page intermédiaire d'un item : fragment de route et bouton de retour (exclu des liens). */
  itemRouteFragment: '/item/',
  backButtonName: 'Retour à la page précédente',
  /** Boutons-liens de la page intermédiaire (hors retour), dans `main`. */
  itemPageLink: 'main button',
}
