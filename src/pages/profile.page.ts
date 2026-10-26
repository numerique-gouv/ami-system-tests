import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {getProfileLocators} from './locators/profile.locators'
import logger from "@wdio/logger";
import {clickDisplayed, clickRole, firstDisplayed, isShown, waitForHeading} from '../helpers/spa'
import NavigationPage from './navigation.page'

const log = logger('page-object')

class ProfilePage {
    /**
     * S'assure d'être sur une sous-page du profil (« Mon identité » ou « Mes coordonnées »), reconnue à son bloc : depuis le
     * hub (`/#/profile`) on clique l'entrée du menu latéral ; hors du profil (formulaire d'édition ouvert, autre page), on
     * rejoint d'abord le hub par son hash. Les méthodes de lecture et d'édition l'appellent : le profil n'est plus une page
     * unique depuis le déploiement staging observé le 2026-10-26.
     */
    private async openSection(section: 'identity' | 'contact'): Promise<void> {
        const loc = getProfileLocators()
        const marker = section === 'identity' ? loc.identitySection : loc.emailSection
        const menuButton = section === 'identity' ? loc.identityMenuButton : loc.contactMenuButton
        if (await isShown(marker)) return
        if (!await isShown(loc.hubHeading)) await this.navigateToProfileDirect()
        await clickDisplayed(menuButton, {timeout: 5000})
        await firstDisplayed(marker, {timeout: 5000})
    }

    /**
     * Attend d'avoir quitté un formulaire d'édition (Enregistrer ou Annuler = retour arrière de l'historique) : on arrive
     * sur la sous-page d'où l'on venait, ou sur le hub si l'historique n'avait rien d'autre. Le signal est l'un des trois.
     */
    private async waitForProfileAfterEdit(): Promise<void> {
        const loc = getProfileLocators()
        await browser.waitUntil(
            async () => await isShown(loc.hubHeading) || await isShown(loc.identitySection) || await isShown(loc.emailSection),
            {timeout: 5000, interval: 250, timeoutMsg: "Ni le hub « Mon profil » ni une sous-page du profil affichés après la sortie du formulaire d'édition"}
        )
    }

    /** Vérifie l'arrivée sur le hub « Mon profil » (titre). */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(getProfileLocators().pageTitle)
    }

    /** Vérifie l'arrivée sur le formulaire d'adresse (titre « Où habitez-vous ? »). */
    async assertAddressFormDisplayed(): Promise<void> {
        await firstDisplayed(getProfileLocators().addressFormHeading)
    }

    /**
     * Navigue vers la page "Mon profil" depuis la home : menu avatar → « Mon profil » → titre de la page.
     * À appeler dans un `inWebContext` (l'appelant le pose) : la page /#/profile est dans la même WebView que la home.
     */
    async navigate(): Promise<void> {
        const loc = getProfileLocators()
        // Le menu avatar (= menu « Plus ») peut déjà être ouvert (ex. re-navigation après un logout) :
        // openPlusMenu() est sans effet dans ce cas.
        await NavigationPage.openPlusMenu()
        await clickDisplayed(loc.profileMenuButton, {timeout: 5000})
        await waitForHeading(loc.pageTitle)
    }

    /**
     * Retourne les textes des balises <b> de la section "Mon identité".
     * Ordre attendu : [nom usuel, nom de naissance, date naissance, lieu naissance].
     */
    async getIdentityBolds(): Promise<string[]> {
        const loc = getProfileLocators()
        await this.openSection('identity')
        const texts: string[] = []
        for await (const b of $$(`${loc.identitySection} b`)) {
            const text = (await b.getText()).trim()
            if (text) texts.push(text)
        }
        return texts
    }

    /**
     * Retourne la valeur du champ « Nom d'usage » du formulaire d'édition (ouvert puis quitté par « Annuler », sans rien
     * enregistrer). C'est la seule lecture fiable du nom d'usage modifié : depuis le 2026-10-26 (staging), la sous-page
     * « Mon identité » affiche le nom issu de FranceConnect (`getFullName()` lit `_pivot`, cf. `User.svelte.ts` d'ami-notifications-api
     * `origin/main`) et ne reflète plus la modification — **constaté en live** (NOMTEST enregistré, bolds inchangés, même après
     * rechargement) ; que ce soit voulu ou une anomalie de l'app est **non confirmé**.
     */
    async getPreferredUsernameField(): Promise<string> {
        const loc = getProfileLocators()
        await this.openSection('identity')
        await clickDisplayed(loc.preferredUsernameEditButton, {timeout: 5000})
        const input = await firstDisplayed(loc.preferredUsernameInput, {timeout: 5000})
        const value = await input.getValue()
        await clickRole('button', 'Annuler', {timeout: 5000})
        await this.waitForProfileAfterEdit()
        return value
    }

    /**
     * Retourne le texte de la balise <b> de la section "Contact" (adresse email).
     */
    async getEmailBold(): Promise<string> {
        const loc = getProfileLocators()
        await this.openSection('contact')
        return (await $(`${loc.emailSection} b`).getText()).trim()
    }

    /**
     * Retourne les textes des balises <b> de la section "Mon adresse".
     * Ordre attendu : [rue, code postal + ville] — ou tableau vide si l'usager n'a pas d'adresse
     * connue (donnée Caf vide, cf. +page.svelte `{#if address}` : la carte s'affiche toujours,
     * son contenu <b> est conditionnel, 0 <b> est un état légitime et non une erreur de chargement).
     */
    async getAddressBolds(): Promise<string[]> {
        const loc = getProfileLocators()
        await this.openSection('contact')
        // Sentinelle : `identity`/`address` sont posés dans le même onMount synchrone
        // (+page.svelte) mais le rendu de la carte peut encore être en cours juste après
        // l'arrivée sur la page — on attend que le HTML de la section soit identique sur deux
        // lectures rapprochées avant de lire les <b>, plutôt que d'exiger `>0` balise (qui
        // traiterait une adresse légitimement vide comme un échec, cf. CONTRIBUTING.md §5).
        let previousHtml: string | null = null
        await browser.waitUntil(
            async () => {
                const html = await $(loc.addressSection).getHTML({includeSelectorTag: false}).catch((ex) => {
                    log.warn('getAddressBolds: lecture du HTML de la section « Mon adresse » en échec, on retente', ex)
                    return null
                })
                const stable = html !== null && html === previousHtml
                previousHtml = html
                return stable
            },
            {timeout: 5000, interval: 300, timeoutMsg: 'Section "Mon adresse" jamais stabilisée'}
        )

        const texts: string[] = []
        for await (const b of $$(`${loc.addressSection} b`)) {
            const text = (await b.getText()).trim()
            if (text) texts.push(text)
        }
        return texts
    }

    /**
     * Ouvre le menu avatar et clique le bouton "Paramètres".
     * Après le clic, l'app quitte la WebView pour l'écran natif Paramètres —
     * les interactions suivantes (ex. logout) doivent cibler des éléments natifs.
     */
    async navigateToSettings(): Promise<void> {
        const loc = getProfileLocators()
        await platform().refreshAxTree()
        await NavigationPage.openPlusMenu()
        await clickDisplayed(loc.settingsMenuButton, {timeout: 5000})
    }

    /**
     * Navigue directement vers /#/profile via le hash SvelteKit.
     * Utilisable depuis n'importe quelle page d'édition ou après un échec de test.
     */
    async navigateToProfileDirect(): Promise<void> {
        // driver.execute : pas de bouton menant au profil depuis une page d'édition ou après un échec —
        // navigation directe par hash.
        await driver.execute(() => {
            window.location.hash = '/profile'
        })
        await waitForHeading(getProfileLocators().pageTitle, 5000)
    }

    /**
     * Ouvre le formulaire d'édition d'un bloc (« Modifier ») sans rien saisir ni enregistrer, et
     * attend son titre. Les 3 boutons « Modifier » ont le même nom : data-testid (cf. ProfileLocators).
     */
    async openEditForm(block: 'identity' | 'email' | 'address'): Promise<void> {
        const loc = getProfileLocators()
        const editButton = {identity: loc.preferredUsernameEditButton, email: loc.emailEditButton, address: loc.addressEditButton}[block]
        const heading = {identity: loc.identityHeading, email: loc.contactHeading, address: loc.addressFormHeading}[block]
        await this.openSection(block === 'identity' ? 'identity' : 'contact')
        await clickDisplayed(editButton, {timeout: 5000})
        await firstDisplayed(heading, {timeout: 5000})
    }

    /** « Annuler » dans un formulaire d'édition : retour au profil sans modification. */
    async cancelEdit(): Promise<void> {
        await clickRole('button', 'Annuler', {timeout: 5000})
        await this.waitForProfileAfterEdit()
    }

    /**
     * Ouvre le formulaire d'édition du nom d'usage, saisit la valeur, enregistre,
     * et attend le retour sur la page profil.
     */
    async editPreferredUsername(newValue: string): Promise<void> {
        const loc = getProfileLocators()
        await this.openSection('identity')
        await clickDisplayed(loc.preferredUsernameEditButton)
        // Le champ affiché est la sentinelle : le formulaire est rendu.
        const input = await firstDisplayed(loc.preferredUsernameInput, {timeout: 5000})
        await input.setValue(newValue)
        await clickRole('button', 'Enregistrer')
        await this.waitForProfileAfterEdit()
    }

    /**
     * Ouvre le formulaire d'édition de l'email, remplace la valeur, enregistre,
     * et attend le retour sur la page profil.
     */
    async editEmail(newValue: string): Promise<void> {
        const loc = getProfileLocators()
        await this.openSection('contact')
        await clickDisplayed(loc.emailEditButton)
        const input = await firstDisplayed(loc.emailInput, {timeout: 5000})
        await input.setValue(newValue)
        await clickRole('button', 'Enregistrer')
        await this.waitForProfileAfterEdit()
    }

    /**
     * Ouvre le menu avatar et clique "Me déconnecter".
     * Le bouton est dans la WebView SPA (menu avatar, même niveau que "Mon profil" et "Paramètres").
     *
     * Pas de branchement iOS/Android pour confirmer la fin du logout : la disparition de la
     * modale de confirmation (ci-dessous) est un signal DOM observable identiquement sur les
     * deux plateformes, plus simple et plus fiable qu'un branchement qui aurait comparé
     * `driver.getContexts()` (iOS, réapparition d'un contexte WEBVIEW) au bouton FranceConnect
     * natif (Android) — deux chemins de code pour un seul événement métier.
     */
    async logout(): Promise<void> {
        const loc = getProfileLocators()
        await NavigationPage.openPlusMenu()
        await clickDisplayed(loc.logoutButton)

        // Modale de confirmation : son titre est le signal (échec = AssertionError avec le sélecteur et le délai).
        await firstDisplayed(loc.deletionHeading, {timeout: 5000})
        await clickDisplayed(loc.confirmButton)
        // `$()` et non l'élément cliqué : la déconnexion remplace le document, un élément déjà résolu y deviendrait
        // « belongs to different document » ; `$()` se ré-interroge à chaque commande.
        await $(loc.confirmButton).waitForDisplayed({timeout: 15000, reverse: true})
    }

    /**
     * Remet le profil dans son état d'origine (hook `after` des scénarios qui le modifient). Best-effort : chaque
     * étape est indépendante et son échec est journalisé, pour qu'un échec partiel ne laisse pas le compte dans un
     * état incohérent. `email` absent : le scénario ne l'a pas modifié. L'adresse n'est pas restaurée : elle vient de
     * la Caf et n'est pas modifiée par les scénarios.
     */
    async restore(original: {preferredUsername: string; email?: string}): Promise<void> {
        const attempt = async (what: string, action: () => Promise<void>): Promise<void> => {
            try { await action() } catch (err) { log.warn(`restore : ${what} impossible`, err) }
        }
        await attempt('retour au profil', () => this.navigateToProfileDirect())
        await attempt("restauration du nom d'usage", () => this.editPreferredUsername(original.preferredUsername))
        if (original.email !== undefined) await attempt("restauration de l'email", () => this.editEmail(original.email as string))
    }

    /**
     * Ouvre le formulaire d'édition de l'adresse, saisit la requête BAN,
     * sélectionne le premier résultat de l'autocomplétion, enregistre,
     * et attend le retour sur la page profil.
     *
     * L'input déclenche un debounce Svelte de 750 ms avant l'appel BAN →
     * l'item d'autocomplétion est attendu jusqu'à 6 s (data-testid : texte imprévisible, dépendant de l'API BAN).
     */
    async editAddress(query: string): Promise<void> {
        const loc = getProfileLocators()
        await this.openSection('contact')
        const editBtn = await firstDisplayed(loc.addressEditButton)
        // waitForClickable vérifie aussi qu'aucun élément (info-tip laissé par une étape
        // précédente du scénario) ne recouvre le bouton au point de clic.
        await editBtn.waitForClickable({timeout: 5000})
        await editBtn.click()

        // setValue envoie des keystrokes qui déclenchent oninput + debounce
        const input = await firstDisplayed(loc.addressInput, {timeout: 5000})
        await input.setValue(query)

        await clickDisplayed(loc.autocompleteFirstItem, {timeout: 6000})
        await clickRole('button', 'Enregistrer')
        await this.waitForProfileAfterEdit()
    }
}

export default traced(new ProfilePage(), 'ProfilePage')
