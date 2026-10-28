/**
 * Point de départ d'un nouveau scénario webapp : à COPIER, jamais à modifier ici (tutoriel complet :
 * automatiser-un-scenario-a-la-main.md, dans ce dossier). Ce fichier suffit pour repartir sans relire le tutoriel.
 *
 * DÉMARRER
 *   cp src/tests/tutorial/tutorial.test.ts src/tests/webapp/mon-scenario.test.ts
 *     (tout dossier src/tests/<dossier>/ convient : les imports relatifs ont la même profondeur)
 *   Dans la copie : retirer `.skip` du describe et renommer le describe.
 *   just debug-webapp src/tests/webapp/mon-scenario.test.ts
 *     → connexion automatique (getAppToStartingState), puis le test s'arrête sur le `browser.debug()` de la méthode
 *       « à compléter » : « Paused in … », la session s'appelle debug-0-0. Explorer l'app depuis cette session :
 *       les commandes sont listées dans cette méthode.
 *
 * ÉCRIRE
 *   Locators : rôle ARIA + nom accessible avant toute structure (CONTRIBUTING.md §2) ; ranger le code en locators → Page Objects
 *   → test, le test n'important que des Page Objects et des helpers d'API.
 *   Supprimer `browser.debug()` avant de commiter (le lint wdio/no-debug le refuse : une pause oubliée bloquerait la CI).
 *   Lancer : just test-webapp src/tests/webapp/mon-scenario.test.ts ; en cas d'échec : just failures-text.
 *
 * API PARTENAIRE (consentement, notification, démarche, démarche enfant) : les `it.skip` en fin de fichier donnent, pour chacun,
 * le `curl` et l'appel de helper équivalent. Préparer le shell (sans afficher les secrets) :
 *   set -a; . ./.env; set +a
 *   API=https://ami-back-staging.osc-fr1.scalingo.io     # backend de l'environnement testé
 *   AUTH="$NOTIF_PARTNER_ID:$NOTIF_PARTNER_SECRET"
 *   FC=<fc_hash de l'utilisateur de test, dans src/helpers/common/test-users.ts>
 * getAppToStartingState ne touche pas au consentement : un scénario qui publie commence par grantDemarchesConsent, et le restaure à la fin.
 * Les publish* refusent d'envoyer sans consentement (consigne juridique) ; `verifyPartnerConsent: false` publie volontairement sans.
 * Un identifiant unique par exécution (`TUTO-${Date.now()}`) retrouve ses données parmi celles des autres runs.
 */
import {getAppToStartingState} from '../../pages/authenticate.process'
import {getUser} from '../../helpers/common/test-users'
import {
  PARTNER_AMI, checkDemarchesConsent, grantDemarchesConsent, revokeDemarchesConsent, publishDemarche, publishDemarcheEnfant, publishNotification,
} from '../../helpers/partner-api'

describe.skip('Mon scénario', () => {
  const user = getUser('avec_nom_dusage')

  // `before` standard des tests webapp (cf. src/tests/webapp/aide-contact.parcours.test.ts) : connecte l'app si besoin.
  before(async function () {
    this.timeout(180000)
    await getAppToStartingState()
  })

  // Remet l'app dans l'état de départ avant chaque test : le test précédent a pu s'arrêter n'importe où (page hors SPA,
  // déconnexion, onboarding). Repart de l'état courant : la vraie connexion n'a lieu qu'au premier appel, ensuite la session
  // est reprise (rechargement de la racine).
  beforeEach(async function () {
    this.timeout(180000)   // un hook peut devoir se reconnecter : le délai par défaut (120 s) serait juste
    await getAppToStartingState()
  })

  it('à compléter', async () => {
    // eslint-disable-next-line wdio/no-debug -- squelette : la pause est son objet, retirée dans la copie
    await browser.debug()   // PAUSE : le test s'arrête ici ; à remplacer par les étapes du scénario

    // EXPLORER la session « debug-0-0 » depuis un autre terminal (le premier reste occupé par le test).
    // Les refs eN repartent de e1 à chaque session : relire le snapshot avant d'agir.
    //   just s debug-0-0 snapshot -i                éléments interactifs et leurs refs
    //   just s debug-0-0 find "texte"                une partie de la page seulement
    //   just s debug-0-0 click eN | fill eN "valeur"
    //   just s debug-0-0 wait --text "…" | wait --url …    après toute action qui change de page, avant de relire (jamais un délai fixe)
    //   Chaque commande affiche le code qu'elle a exécuté (`→ await …`) ; just s debug-0-0 history les liste.
    //   mkdir -p exports && just s debug-0-0 history > exports/mon-scenario.txt    brouillon à relire (dossier ignoré par git)
    //   just s debug-0-0 resume termine le test ; just s debug-0-0 close le fait échouer à la place.
  })

  it.skip('aide-mémoire : lire, donner, retirer le consentement', async () => {
    // curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" "$API/api/v1/consent/$FC"                                                        # 200 actif, 404 absent ou retiré
    // curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -H 'Content-Type: application/json' -d '{"consent": true}'  "$API/api/v1/consent/$FC"   # donner
    // curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -H 'Content-Type: application/json' -d '{"consent": false}' "$API/api/v1/consent/$FC"   # retirer
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    expect(await checkDemarchesConsent(PARTNER_AMI, user.fcHash)).toBe(true)
    await revokeDemarchesConsent(PARTNER_AMI, user.fcHash)
  })

  it.skip('aide-mémoire : publier une notification simple', async () => {
    // curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -X PUT -H 'Content-Type: application/json' "$API/api/v2/event" -d '{
    //   "recipient_fc_hash": "'"$FC"'",
    //   "content_title": "Notification TUTO", "content_body": "corps",
    //   "event_date": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
    // }'
    await publishNotification({recipientFcHash: user.fcHash, title: 'Notification TUTO', body: 'corps'})
  })

  it.skip('aide-mémoire : publier une démarche (new, wip ou closed)', async () => {
    // Une mise à jour est le même appel avec le même item_id et un autre statut.
    // curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -X PUT -H 'Content-Type: application/json' "$API/api/v2/event" -d '{
    //   "recipient_fc_hash": "'"$FC"'",
    //   "content_title": "Démarche TUTO", "content_body": "corps",
    //   "item_type": "OTV", "item_id": "TUTO-1",
    //   "item_status_label": "Brouillon", "item_generic_status": "new", "item_canal": "AMI",
    //   "event_date": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
    // }'
    await publishDemarche({recipientFcHash: user.fcHash, title: 'Démarche TUTO', body: 'corps', itemType: 'OTV', itemId: 'TUTO-1', status: 'new'})
  })

  it.skip('aide-mémoire : publier une démarche enfant', async () => {
    // Le parent est identifié par item_parent_type et item_parent_id (obligatoires ensemble) ; le sous-titre sert de titre à l'enfant.
    // curl -s -o /dev/null -w '%{http_code}\n' -u "$AUTH" -X PUT -H 'Content-Type: application/json' "$API/api/v2/event" -d '{
    //   "recipient_fc_hash": "'"$FC"'",
    //   "content_title": "Démarche TUTO", "content_body": "corps", "content_subheading": "Enfant 1",
    //   "item_type": "OTV", "item_id": "TUTO-1-E1",
    //   "item_parent_type": "OTV", "item_parent_id": "TUTO-1",
    //   "item_status_label": "Brouillon", "item_generic_status": "new", "item_canal": "AMI",
    //   "event_date": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
    // }'
    await publishDemarcheEnfant({
      recipientFcHash: user.fcHash, title: 'Démarche TUTO', body: 'corps', subheading: 'Enfant 1',
      itemType: 'OTV', itemId: 'TUTO-1-E1', status: 'new', parent: {type: 'OTV', id: 'TUTO-1'},
    })
  })
})
