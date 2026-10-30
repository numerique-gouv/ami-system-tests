// Deux types d'items à lien : à UN lien (`item-button-direct-link-<id>`, mène à une page externe) ou à PLUSIEURS (page intermédiaire, nom accessible
// « Voir le détail de ce point »). Le type n'est lisible que dans le `data-testid` : exception documentée à CONTRIBUTING §2.
// Ces boutons mesurent 0×0 px (« lien étiré » DSFR) et WDIO les refuse (« did not become interactable ») : le clic passe par `HTMLElement.click()`.
export const stepsListLocators = {
  /** Entrées de l'onglet « Trouver de l’aide » de Services qui ouvrent une liste d'étapes. */
  listEntry: 'button[data-testid^="service-steps-"]',
  title: 'h1',
  /** Boutons de section (« Cas général 0/7 »), dans la navigation de la liste. */
  sectionButton: 'nav li button',
  /** Boutons-liens d'items (directs et pages intermédiaires), de taille nulle. */
  itemLinkButton: 'button[data-testid^="item-button-"]',
  /** Case à cocher d'un item, transparente : l'item est rendu quand elle existe. */
  itemCheckbox: 'li input[type="checkbox"]',
  directLinkPrefix: 'item-button-direct-link-',
  /** Page intermédiaire d'un item : fragment de route et bouton de retour (exclu des liens). */
  itemRouteFragment: '/item/',
  backButtonName: 'Retour à la page précédente',
  /** Boutons-liens de la page intermédiaire (hors retour), dans `main`. */
  itemPageLink: 'main button',
}
