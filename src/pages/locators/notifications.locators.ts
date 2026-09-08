/**
 * Sélecteurs natifs de l'inbox notifications.
 *
 * Les sélecteurs WebView (cloche, items, heading) vivent directement dans
 * notifications.page.ts, pas ici :
 *   tl().getByRole('button', { name: /notifications/i })  — cloche (openFromHome)
 *   driver.execute(...)                                    — items et heading
 *     (pas tl()/findByText : la page reçoit des mises à jour WebSocket en continu et
 *     l'inbox est reload()-ée pour rafraîchir, ce qui invaliderait une requête Testing
 *     Library en cours — voir les commentaires de notifications.page.ts pour le détail)
 *
 * Ce fichier ne conserve que les sélecteurs natifs spécifiques à la plateforme,
 * si l'app expose un jour des éléments natifs pour ces vues.
 */

// Pas de sélecteurs natifs pour l'instant — la vue notifications est 100% WebView SPA.
// Les requêtes dans notifications.page.ts suffisent.
