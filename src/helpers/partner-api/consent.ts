/** Consentement de l'usager envers le partenaire — API `/api/v1/consent/{fc_hash}`. */
import {AssertionError} from 'node:assert'
import {REQUEST_TIMEOUT_MS, authHeaders, getBackendUrl} from './client'

/**
 * Vérifie le consentement de l'usager auprès d'AMI (GET /api/v1/consent/{fc_hash}).
 * Retourne true si AMI a connaissance d'un consentement actif, false si 404 (absent ou retiré).
 */
export async function checkConsent(recipientFcHash: string): Promise<boolean> {
    const url = `${getBackendUrl()}/api/v1/consent/${recipientFcHash}`
    let response: Response
    try {
        response = await fetch(url, {
            headers: {'Content-Type': 'application/json', ...authHeaders()},
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch (err) {
        throw new AssertionError({message: `GET /api/v1/consent/${recipientFcHash} → pas de réponse sous ${REQUEST_TIMEOUT_MS}ms (${(err as Error).message})`})
    }
    if (response.status === 404) return false
    if (!response.ok) {
        const text = await response.text().catch(() => '(corps illisible)')
        throw new AssertionError({message: `GET /api/v1/consent/${recipientFcHash} → HTTP ${response.status}: ${text}`})
    }
    return true
}

/** Communique le consentement (don ou retrait) de l'usager (POST /api/v1/consent/{fc_hash}). */
async function setConsent(recipientFcHash: string, granted: boolean): Promise<void> {
    const url = `${getBackendUrl()}/api/v1/consent/${recipientFcHash}`
    let response: Response
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', ...authHeaders()},
            body: JSON.stringify({consent: granted}),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch (err) {
        throw new AssertionError({message: `POST /api/v1/consent/${recipientFcHash} → pas de réponse sous ${REQUEST_TIMEOUT_MS}ms (${(err as Error).message})`})
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '(corps illisible)')
        throw new AssertionError({message: `POST /api/v1/consent/${recipientFcHash} → HTTP ${response.status}: ${text}`})
    }
}

/** Donne le consentement de l'usager. */
export async function grantConsent(recipientFcHash: string): Promise<void> {
    await setConsent(recipientFcHash, true)
}

/** Retire le consentement de l'usager. */
export async function revokeConsent(recipientFcHash: string): Promise<void> {
    await setConsent(recipientFcHash, false)
}
