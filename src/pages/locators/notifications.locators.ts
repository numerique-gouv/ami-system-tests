/**
 * Sélecteurs natifs de l'inbox notifications.
 *
 * Les sélecteurs WebView (cloche, items, heading) ont été migrés vers
 * @testing-library/webdriverio dans notifications.page.ts :
 *   tl().getByRole('link', { name: /notifications/i })  — cloche
 *   tl().findByText(title)                               — item par titre
 *
 * Ce fichier ne conserve que les sélecteurs natifs spécifiques à la plateforme,
 * si l'app expose un jour des éléments natifs pour ces vues.
 */

// Pas de sélecteurs natifs pour l'instant — la vue notifications est 100% WebView SPA.
// Les requêtes Testing Library dans notifications.page.ts suffisent.
