# Notifications en temps réel : différence de comportement Android/iOS

## Constat de départ

Observation utilisateur (2026-09-08) : Android reçoit les nouvelles notifications sans recharger la page de notifications (mise à jour visible en direct), ce qui n'est pas le cas d'iOS.

## Méthode

Recherche de preuve dans les trois dépôts concernés, dans cet ordre :
1. `ami-app-android` (natif Kotlin)
2. `ami-app-ios` (natif Swift)
3. `ami-notifications-api/public/mobile-app` (SPA SvelteKit, chargée dans la WebView des deux plateformes)

## Preuves côté natif

**Android** (`FirebaseService.kt:30-120`) : FCM affiche une notification système via `NotificationCompat.Builder` / `NotificationManagerCompat.notify()`. Aucun code ne pousse l'événement dans la WebView ni ne déclenche de `evaluateJavaScript`. Aucun WebSocket ni polling natif trouvé.

**iOS** (`NotificationManager.swift:85-101`) : APNs en foreground (`willPresent`) affiche uniquement un banner système. Le seul refresh de webview existant est déclenché par un **tap explicite** de l'utilisateur sur la notification (`AMIAppState.swift:80-84`, recréation de la WKWebView via un nouvel `UUID` SwiftUI). Aucun WebSocket ni polling natif trouvé.

**Conclusion intermédiaire** : aucun mécanisme natif, sur aucune des deux plateformes, ne pousse automatiquement une nouvelle notification dans la WebView. Le mécanisme de mise à jour live, s'il existe, est donc forcément côté SPA.

## Preuve côté SPA (`ami-notifications-api/public/mobile-app`)

- `src/lib/notifications.ts:12-15,93-105` — `WebSocket` natif brut (pas de socket.io, pas d'EventSource), connecté à `wss://.../api/v1/users/notification/events/stream`.
- `src/routes/notifications/+page.svelte:18-29` — à `onMount` : fetch initial (`retrieveNotifications()`) puis **un seul** abonnement WebSocket. Chaque message reçu relance un refetch complet. Aucun listener `visibilitychange`, aucune logique de retry.
- `src/lib/ConnectedHomepage.svelte:58-68` — sur la page d'accueil (badge de compteur uniquement, pas la liste), un handler `visibilitychange` reconnecte le WebSocket si `document.visibilityState === 'visible' && ws.readyState !== WebSocket.OPEN`.

## Hypothèse retenue

La route `/notifications` n'a pas de logique de reconnexion. Si le WebSocket meurt pendant que l'app est en arrière-plan sur iOS (comportement documenté de WKWebView, voir sources ci-dessous), rien ne le rouvre : d'où l'absence de mise à jour live observée. Ce n'est **ni une régression d'infra ni un raté de test** — c'est un comportement plateforme connu de WKWebView combiné à une absence de reconnexion applicative dans la SPA.

### Sources externes

- [iOS 15 WKWebView websocket behaviour](https://developer.apple.com/forums/thread/685403) (forum Apple) — depuis iOS 15, WKWebView utilise l'implémentation `NSURLSession WebSocket`, avec un bug connu de traitement des frames fragmentées (`Fin=0`) provoquant des déconnexions silencieuses (`Connection reset by peer`) pour les messages ≥126 octets ou avec compression `permessage-deflate`.
- [How to keep a WebSocket connection created on a WKWebView open... in background](https://developer.apple.com/forums/thread/681892) (forum Apple, non résolu) — iOS ferme les WebSockets WKWebView dès le passage en arrière-plan ; les background tasks classiques (`Extending Your App's Background Execution Time`) ne suffisent pas à maintenir la connexion.
- [react-native-webview issue #2281 — iOS 15 websocket changes break webview's websocket functionality](https://github.com/react-native-webview/react-native-webview/issues/2281) — même bug rapporté indépendamment de la stack.
- [socket.io issue #2924 — Safari dropping web socket connection due to inactivity when page not in focus](https://github.com/socketio/socket.io/issues/2924) — après une inactivité prolongée, `onerror`/`onclose` peuvent ne **jamais** être émis : le socket reste « zombie » côté JS sans notifier l'application.
- [WebKit bug 247943 — WebSocket in latest Safari does not emit onclose event when internet is turned off](https://bugs.webkit.org/show_bug.cgi?id=247943) (Safari 15.6.1–16.6, confirmé par l'équipe WebKit) — confirme l'absence d'événement `close` en cas de coupure réseau.

**Statut** : hypothèse cohérente avec le code lu et des sources externes concordantes, **non vérifiée en conditions réelles sur ce projet** (pas de capture réseau live effectuée sur les deux plateformes à ce stade).

## Le pattern `ConnectedHomepage.svelte` est-il suffisant contre les WebSockets zombies iOS ?

Non — la condition `ws.readyState !== WebSocket.OPEN` ne détecte **pas** le cas zombie qui est justement le bug documenté ci-dessus.

`readyState` n'est mis à jour que lorsque le navigateur traite effectivement un événement de fermeture (`close`/`error`) sur l'objet `WebSocket`. Or c'est précisément ce que rapportent les sources WebKit/Safari citées plus haut : après une coupure en arrière-plan ou une inactivité prolongée, ces événements peuvent ne **jamais** être délivrés. Dans ce cas, `ws.readyState` reste bloqué à `1` (`OPEN`) alors que la connexion sous-jacente est morte — la condition `!== OPEN` est donc `false`, et `handleVisibility` ne reconnecte rien.

Ce pattern fonctionne uniquement pour le sous-cas où le navigateur *sait* que le socket est fermé (`CLOSED`/`CLOSING`, ex. fermeture propre côté serveur). Il ne couvre pas le cas « socket zombie » qui est le scénario iOS le plus fréquemment rapporté dans les sources externes. Une détection fiable nécessiterait un mécanisme actif (heartbeat applicatif avec timeout côté client) plutôt qu'une lecture passive de `readyState`.

## Détection côté serveur vs réouverture côté client

Le protocole WebSocket est **client-initiated** : seul le client peut faire `new WebSocket(url)`. Cette contrainte structurelle détermine où chaque responsabilité doit vivre :

- **Détection côté serveur (Python/Django Channels, `ami/notification/channel_consumer.py`)** — faisable et utile en soi : un ping/pong applicatif côté back permet de repérer une connexion morte, de fermer proprement (`group_discard`, compteur Sentry) et de libérer les ressources associées. Sans ça, des connexions zombies peuvent s'accumuler côté serveur pendant des heures.
- **Réouverture côté client (Svelte)** — obligatoire et exclusive : le serveur ne peut jamais forcer un navigateur à ouvrir une nouvelle connexion. Il peut au mieux fermer sa moitié de la socket ou attendre que le client revienne se reconnecter de lui-même — ce qui suppose que le client sache qu'il doit le faire, d'où la nécessité du heartbeat côté SPA du paragraphe précédent.

Un heartbeat serveur seul (sans pendant côté client) améliore l'hygiène des ressources back, mais **ne répare pas** le bug observé : la page `/notifications` resterait affichée sans mise à jour tant que le JS du navigateur n'a pas lui-même détecté et remplacé la socket morte.

## Proposition d'implémentation (non implémentée à ce stade)

Objectif : un heartbeat piloté par la SPA, actif seulement dans le contexte où le bug est documenté (WKWebView iOS), avec un back qui répond simplement au ping pour fermer la boucle.

### Détection de plateforme (déjà disponible)

`app.d.ts:21` expose déjà `NativeInfosData.platform: 'android' | 'ios'` via `window.NativeInfos.getInfos()`, consommé dans `src/lib/nativeInfos.ts`. Ajouter un accesseur dédié évite toute détection par user-agent :

```ts
// src/lib/nativeInfos.ts
export const getPlatform = (): 'android' | 'ios' | undefined => {
  return getNativeInfos()?.platform;
};
```

### Heartbeat côté SPA (`src/lib/notifications.ts`)

Deux déclencheurs pour le ping, plutôt qu'un seul timer :
- un **ping lent en fond** (backstop pendant que la page reste au premier plan sans interaction — coût réseau/batterie minimal) ;
- un **ping immédiat à chaque `visibilitychange` vers `visible`** — c'est le moment où le risque de zombie est le plus élevé (retour d'arrière-plan prolongé), donc autant vérifier tout de suite plutôt que d'attendre le prochain tick du timer lent.

```ts
const HEARTBEAT_INTERVAL_MS = 60_000; // ping lent, backstop en fond
const HEARTBEAT_TIMEOUT_MS = 10_000;

export const notificationEventsSocketWithHeartbeat = (
  onmessage: (event: MessageEvent) => void
): { close: () => void } => {
  let ws: WebSocket;
  let heartbeatTimer: ReturnType<typeof setInterval>;
  let pongTimeoutTimer: ReturnType<typeof setTimeout>;
  let closedByUs = false;

  const ping = () => {
    ws.send(JSON.stringify({ event: 'ping' }));
    clearTimeout(pongTimeoutTimer); // un ping en vol suffit, pas d'empilement
    pongTimeoutTimer = setTimeout(() => {
      console.log('Heartbeat timeout: socket presumed zombie, reconnecting');
      ws.close();
      open(); // ne dépend pas de readyState, ni de close()/error() du navigateur
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') ping();
  };

  const open = () => {
    ws = notificationEventsSocket((event) => {
      const data = JSON.parse(event.data);
      if (data.event === 'pong') {
        clearTimeout(pongTimeoutTimer);
        return;
      }
      onmessage(event);
    });

    heartbeatTimer = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);

    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      clearTimeout(pongTimeoutTimer);
      document.removeEventListener('visibilitychange', onVisible);
      if (!closedByUs) open();
    };
  };

  open();

  return {
    close: () => {
      closedByUs = true;
      clearInterval(heartbeatTimer);
      clearTimeout(pongTimeoutTimer);
      document.removeEventListener('visibilitychange', onVisible);
      ws.close();
    },
  };
};
```

Le ping déclenché par `visibilitychange` réutilise le **même chemin de détection** (timeout → `ws.close()` → `open()`) que le ping périodique — pas de logique de reconnexion dupliquée entre les deux déclencheurs.

### Activation conditionnelle (`src/routes/notifications/+page.svelte`)

```ts
import { getPlatform } from '$lib/nativeInfos';
import { notificationEventsSocket, notificationEventsSocketWithHeartbeat } from '$lib/notifications';

onMount(async () => {
  // ...
  notifications = await retrieveNotifications();

  const refresh = async () => {
    notifications = await retrieveNotifications();
  };

  if (getPlatform() === 'ios') {
    notificationEventsSocketWithHeartbeat(refresh);
  } else {
    notificationEventsSocket(refresh); // Android : pas de heartbeat, bug non observé
  }
});
```

### Réponse côté back (`ami/notification/channel_consumer.py`)

Le consumer n'a actuellement aucun `receive()` — il ne fait qu'émettre. Ajouter la réponse au ping :

```python
async def receive(self, text_data=None, bytes_data=None):
    if text_data is None:
        return
    payload = json.loads(text_data)
    if payload.get("event") == "ping":
        await self.send(text_data=json.dumps({"event": "pong"}))
```

### Pourquoi restreindre au contexte iOS

Les sources externes ne rapportent pas ce bug côté WebView Android/Chromium ; activer le heartbeat uniquement sur iOS (`getPlatform() === 'ios'`) évite du trafic superflu sur Android, où le mécanisme `onmessage` existant fonctionne déjà (observation initiale de l'utilisateur). Un `HEARTBEAT_TIMEOUT_MS` de 10s pour détecter l'absence de pong, et un intervalle de fond `HEARTBEAT_INTERVAL_MS` de 60s (délibérément lent, puisque le cas le plus probable — retour d'arrière-plan — est déjà couvert instantanément par le ping sur `visibilitychange`), sont des valeurs de départ raisonnables à ajuster selon la fréquence réelle de publication de notifications — ce sont les paramètres les plus discutables de cette proposition.

## Recommandations (non implémentées à ce stade)

1. Implémenter la proposition ci-dessus (heartbeat SPA à deux déclencheurs — ping lent en fond + ping immédiat sur `visibilitychange` vers `visible` — plus réponse `pong` côté back), gatée sur `platform === 'ios'`.
2. Refetch de rattrapage systématique au retour en foreground, indépendant de l'état perçu du WebSocket — filet de sécurité si la reconnexion via heartbeat échoue silencieusement.
3. Ces changements sont côté SPA et back (`ami-notifications-api`), hors périmètre de ce dépôt de tests — à faire remonter aux équipes propriétaires de ces dépôts.
