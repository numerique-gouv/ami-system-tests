import {refreshAxTree, tl, withWebView} from '../helpers/webview'
import {traced} from '../helpers/traced'
import {getProfileLocators} from './locators/profile.locators'
import {AssertionError} from "node:assert";
import logger from "@wdio/logger";

const log = logger('page-object')

class AvatarMenuPage {
    /**
     * Navigue vers la page "Mon profil" depuis la home :
     *   clic toggle-menu-button → attente profile-button → clic profile-button → attente conteneur profil.
     *
     * Toute la navigation est dans un seul withWebView — la page /#/profile est dans la même
     * WebView que la home, la navigation hash ne nécessite pas de re-switch de contexte.
     */
    async navigate(): Promise<void> {
        const loc = getProfileLocators()
        await withWebView(async () => {
            // Le menu avatar peut déjà être ouvert (ex. re-navigation après un logout) —
            // ne cliquer toggleMenuButton que si "Mon profil" n'est pas déjà visible.
            await tl()
                .findByTestId(loc.profileMenuButtonTestId, {}, {timeout: 500})
                .then(async () => {
                    await $(loc.toggleMenuButton).waitForClickable({timeout: 5000})
                    await $(loc.toggleMenuButton).click()
                })
                .catch(() => {})

            // 2-3. Attendre le bouton "Mon profil" dans le menu ouvert puis le cliquer —
            // findByTestId attend la résolution avant de retourner le handle, pas besoin
            // d'un waitUntil séparé.
            const profileBtn = await tl().findByTestId(loc.profileMenuButtonTestId, {}, {timeout: 5000})
            await profileBtn.click()

            // 4. Attendre le conteneur de la page profil
            await tl().findByTestId(loc.profileContainerTestId, {}, {timeout: 10000})
        })
    }

    /**
     * Retourne les textes des balises <b> de la section "Mon identité".
     * Ordre attendu : [nom usuel, nom de naissance, date naissance, lieu naissance].
     */
    async getIdentityBolds(): Promise<string[]> {
        const loc = getProfileLocators()
        return await withWebView(async () => {
            const texts: string[] = []
            for await (const b of $$(`${loc.identitySection} b`)) {
                const text = (await b.getText()).trim()
                if (text) texts.push(text)
            }
            return texts
        })
    }

    /**
     * Retourne le texte de la balise <b> de la section "Contact" (adresse email).
     */
    async getEmailBold(): Promise<string> {
        const loc = getProfileLocators()
        return await withWebView(async () =>
            (await $(`${loc.emailSection} b`).getText().catch(() => '')).trim()
        )
    }

    /**
     * Retourne les textes des balises <b> de la section "Mon adresse".
     * Ordre attendu : [rue, code postal + ville].
     */
    async getAddressBolds(): Promise<string[]> {
        const loc = getProfileLocators()
        return await withWebView(async () => {
            const texts: string[] = []
            for await (const b of $$(`${loc.addressSection} b`)) {
                const text = (await b.getText()).trim()
                if (text) texts.push(text)
            }
            return texts
        })
    }

    /**
     * Ouvre le menu avatar et clique le bouton "Paramètres".
     * Après le clic, l'app quitte la WebView pour l'écran natif Paramètres —
     * les interactions suivantes (ex. logout) doivent cibler des éléments natifs.
     */
    async navigateToSettings(): Promise<void> {
        const loc = getProfileLocators()
        await withWebView(async () => {
            await refreshAxTree()
            await $(loc.toggleMenuButton).waitForClickable({timeout: 5000})
            await $(loc.toggleMenuButton).click()

            const settingsBtn = await tl().findByTestId(loc.settingsMenuButtonTestId, {}, {timeout: 5000})
            await settingsBtn.click()
        })
    }

    /**
     * Navigue directement vers /#/profile via le hash SvelteKit.
     * Utilisable depuis n'importe quelle page d'édition ou après un échec de test.
     */
    async navigateToProfileDirect(): Promise<void> {
        const loc = getProfileLocators()
        await withWebView(async () => {
            await driver.execute(() => {
                window.location.hash = '/profile'
            })
            await tl().findByTestId(loc.profileContainerTestId, {}, {timeout: 5000})
        })
    }

    /**
     * Ouvre le formulaire d'édition du nom d'usage, saisit la valeur, enregistre,
     * et attend le retour sur la page profil.
     *
     * Pattern : driver.execute pour les sentinelles de navigation (nav active = executeAsync tué),
     * tl() pour les interactions sur la page stable (sémantique + résiliente aux refactorings DOM).
     */
    async editPreferredUsername(newValue: string): Promise<void> {
        const loc = getProfileLocators()
        await withWebView(async () => {
            // Clic "Modifier" : data-testid requis (findByTestId), les 3 boutons ont le même texte
            // "Modifier" — un findByRole({name:'Modifier'}) ne pourrait pas les distinguer.
            const editBtn = await tl().findByTestId(loc.preferredUsernameEditButtonTestId)
            await editBtn.click()

            // Sentinelle : attendre que le formulaire soit rendu
            await tl().findByTestId(loc.editContainerTestId, {}, {timeout: 5000})

            // Page stable → tl() : label "Nom d'usage" associé à l'input via for/id
            const input = await tl().findByLabelText("Nom d'usage")
            await input.setValue(newValue)

            const submitBtn = await tl().findByRole('button', {name: 'Enregistrer'})
            await submitBtn.click()

            // Sentinelle retour profil
            await tl().findByTestId(loc.profileContainerTestId, {}, {timeout: 5000})
        })
    }

    /**
     * Ouvre le formulaire d'édition de l'email, remplace la valeur, enregistre,
     * et attend le retour sur la page profil.
     */
    async editEmail(newValue: string): Promise<void> {
        const loc = getProfileLocators()
        await withWebView(async () => {
            const editBtn = await tl().findByTestId(loc.emailEditButtonTestId)
            await editBtn.click()

            await tl().findByTestId(loc.editContainerTestId, {}, {timeout: 5000})

            // Label "E-mail" — libellé observé dans l'APK staging (différent du code source Svelte)
            const input = await tl().findByLabelText('E-mail')
            await input.setValue(newValue)

            const submitBtn = await tl().findByRole('button', {name: 'Enregistrer'})
            await submitBtn.click()

            await tl().findByTestId(loc.profileContainerTestId, {}, {timeout: 5000})
        })
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

        await withWebView(async () => {
            if (!await $(loc.toggleMenuButton).waitForClickable({timeout: 5000})) {
                log.warn("avatar menu is not clickable...")
                return
            }
            await $(loc.toggleMenuButton).click()
            const logoutBtn = await tl().findByRole('button', {name: 'Me déconnecter'})
            await logoutBtn.click()

            const element = await tl().findByRole('heading', {name: 'Suppression de vos données'});
            if (await element.isDisplayed()) {
                const confirmBtn = await tl().findByRole('button', {name: 'Confirmer'})
                await confirmBtn.click()
                await confirmBtn.waitForDisplayed({timeout: 15000, reverse: true})
            } else {
                throw new AssertionError({ message: "La modale de confirmation de suppression des données ne s'affiche pas." })
            }
        })
    }

    /**
     * Ouvre le formulaire d'édition de l'adresse, saisit la requête BAN,
     * sélectionne le premier résultat de l'autocomplétion, enregistre,
     * et attend le retour sur la page profil.
     *
     * L'input déclenche un debounce Svelte de 750 ms avant l'appel BAN →
     * le waitUntil autocomplete attend jusqu'à 6 s.
     * L'item autocomplete est ciblé par data-testid (texte imprévisible dépendant de l'API BAN).
     */
    async editAddress(query: string): Promise<void> {
        const loc = getProfileLocators()
        await withWebView(async () => {
            const editBtn = await tl().findByTestId(loc.addressEditButtonTestId)
            await editBtn.click()

            await tl().findByTestId(loc.editContainerTestId, {}, {timeout: 5000})

            // Label "Adresse" — setValue envoie des keystrokes qui déclenchent oninput + debounce
            const input = await tl().findByLabelText('Adresse')
            await input.setValue(query)

            // Sentinelle autocomplete : debounce 750 ms + latence API BAN, data-testid requis
            // (texte de l'item inconnu à l'avance, retour BAN variable) — findByTestId attend et
            // résout en un seul appel.
            const firstItem = await tl().findByTestId(loc.autocompleteFirstItemButtonTestId, {}, {timeout: 6000})
            await firstItem.click()

            const submitBtn = await tl().findByRole('button', {name: 'Enregistrer'})
            await submitBtn.click()

            await tl().findByTestId(loc.profileContainerTestId, {}, {timeout: 5000})
        })
    }
}

export default traced(new AvatarMenuPage(), 'AvatarMenuPage')
