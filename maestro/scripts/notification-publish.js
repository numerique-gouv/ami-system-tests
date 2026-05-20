// Publie une notification push via l'API partenaire AMI.
// Toutes les variables sont injectées comme globales JS via runScript.env (GraalVM — pas de process.env).
//   NOTIF_TITLE, NOTIF_BODY         — passées par le flow appelant (runFlow: env:)
//   NOTIF_API_URL, NOTIF_PARTNER_ID — passées par le justfile (--env)
//   NOTIF_PARTNER_SECRET            — passée par le justfile (--env, depuis .env)
//   NOTIF_RECIPIENT_FC_HASH         — passée par le justfile (--env, depuis .env)
// Résultat : output.last_notif_title = NOTIF_TITLE (disponible dans les étapes suivantes)
try {

  var secret    = NOTIF_PARTNER_SECRET;
  var apiUrl    = NOTIF_API_URL;
  var fcHash    = NOTIF_RECIPIENT_FC_HASH;
  var partnerId = NOTIF_PARTNER_ID;

  if (!secret || !apiUrl || !fcHash) {
    throw new Error('Env vars manquantes : copier maestro/.env.example en maestro/.env et remplir les valeurs');
  }

  var _b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function base64Encode(str) {
    var result = '';
    for (var i = 0; i < str.length; i += 3) {
      var b0 = str.charCodeAt(i) & 0xff;
      var b1 = i + 1 < str.length ? str.charCodeAt(i + 1) & 0xff : 0;
      var b2 = i + 2 < str.length ? str.charCodeAt(i + 2) & 0xff : 0;
      result += _b64chars[b0 >> 2];
      result += _b64chars[((b0 & 3) << 4) | (b1 >> 4)];
      result += i + 1 < str.length ? _b64chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      result += i + 2 < str.length ? _b64chars[b2 & 63] : '=';
    }
    return result;
  }
  var credentials = base64Encode(partnerId + ':' + secret);

  let headers = {
    'Authorization': 'Basic ' + credentials,
    'Content-Type': 'application/json',
  };
  let body = JSON.stringify({
    recipient_fc_hash: fcHash,
    content_title: NOTIF_TITLE,
    content_body: NOTIF_BODY,
    // send_date unique à chaque appel pour contourner l'idempotence du backend
    // (get_or_create sur le payload entier — même payload → 200 OK sans push)
    send_date: new Date().toISOString(),
    try_push: true,
  });
  var response = http.post(apiUrl + '/api/v1/notifications', {
    headers: headers,
    body: body,
  });
  console.log('POST /api/v1/notifications headers=' + JSON.stringify(headers) + ' body=' + body + ' → HTTP response=' + response.status + ' ' + response.statusText + ': ' + response.body);

  if (response.status !== 201 && response.status !== 200) {
    throw new Error('POST /api/v1/notifications HTTP ' + response.status + ': ' + response.body);
  }

  output.last_notif_title = NOTIF_TITLE;
} catch (e) {
  console.log('notification-publish.js ERREUR'
    + ' type='    + (e.constructor && e.constructor.name ? e.constructor.name : typeof e)
    + ' class='   + (e.class   || '(none)')
    + ' message=' + e.message
    + ' cause='   + (e.cause   || '(none)')
    + ' stack='   + (e.stack   || '(none)')
  );
  throw e;
}
