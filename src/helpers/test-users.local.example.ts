// Copier ce fichier en test-users.local.ts et renseigner les valeurs.
// test-users.local.ts est gitignored — ne jamais committer de credentials.
//
// Le fc_hash est le SHA-256 des données pivot FranceConnect (sans sel) :
//   SHA256(given_name + family_name + birthdate + gender + birthplace + birthcountry)
// Endpoint de calcul sur le staging : GET /dev-utils/recipient-fc-hash?given_name=...

export const credentials = {
  avec_nom_dusage: {
    password: '123',
    fcHash: '<SHA-256 des données pivot FC — voir ami-notifications-api/ami/user/utils.py>',
  },
  test: {
    password: '123',
    fcHash: '<SHA-256 des données pivot FC — voir dans l app mobile connectée dans paramètres, nous contacter, choisir un moyen et y trouver l identifiant de l usager>',
  },
}
