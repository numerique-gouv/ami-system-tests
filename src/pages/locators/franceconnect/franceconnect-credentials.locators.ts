// Formulaire du mock FCP-LOW, même DOM sur Android et iOS. Champs par leur attribut `name` : `aria/<libellé>` renvoie sur mobile un élément non éditable.
export const fcCredentialsLocators = {
  identifierField: 'input[name="login"]',
  passwordField: 'input[name="password"]',
  submitButton: 'button.*=valider',
}

/** iOS : les champs du formulaire lus dans l'arbre natif (cf. `iosEidasLinkNativeAx`). */
export const iosCredentialsFieldsNativeAx =
  '-ios predicate string:type == "XCUIElementTypeTextField" OR type == "XCUIElementTypeSecureTextField"'
