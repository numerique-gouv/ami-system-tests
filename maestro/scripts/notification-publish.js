// Publie une notification push via l'API partenaire AMI.
// Toutes les variables sont injectées comme globales JS via runScript.env (GraalVM — pas de process.env).
//   NOTIF_TITLE, NOTIF_BODY         — passées par le flow appelant (runFlow: env:)
//   NOTIF_API_URL, NOTIF_PARTNER_ID — passées par le justfile (--env)
//   NOTIF_PARTNER_SECRET            — passée par le justfile (--env, depuis .env)
//   NOTIF_RECIPIENT_FC_HASH         — passée par le justfile (--env, depuis .env)
// Résultat : output.last_notif_title = NOTIF_TITLE (disponible dans les étapes suivantes)

var secret    = NOTIF_PARTNER_SECRET;
var apiUrl    = NOTIF_API_URL;
var fcHash    = NOTIF_RECIPIENT_FC_HASH;
var partnerId = NOTIF_PARTNER_ID;

if (!secret || !apiUrl || !fcHash) {
  throw new Error('Env vars manquantes : copier maestro/.env.example en maestro/.env et remplir les valeurs');
}

var credentials = btoa(partnerId + ':' + secret);

var response = http.post(apiUrl + '/api/v1/notifications', {
  headers: {
    'Authorization': 'Basic ' + credentials,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    recipient_fc_hash: fcHash,
    content_title: NOTIF_TITLE,
    content_body: NOTIF_BODY,
    // send_date unique à chaque appel pour contourner l'idempotence du backend
    // (get_or_create sur le payload entier — même payload → 200 OK sans push)
    send_date: new Date().toISOString(),
    try_push: true,
  }),
});

if (response.status !== 201 && response.status !== 200) {
  throw new Error('POST /api/v1/notifications HTTP ' + response.status + ': ' + response.body);
}

output.last_notif_title = NOTIF_TITLE;
