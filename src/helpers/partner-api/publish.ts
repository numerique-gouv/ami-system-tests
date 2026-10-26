/**
 * Fonctions métier au-dessus de publishEvent : chacune remplit un gabarit d'EventPayload.
 *
 * L'API n'a qu'un endpoint et qu'un schéma ; les « types » ci-dessous sont des conventions déduites
 * des champs renseignés (règles : ami-notifications-api, ami/notification/serializers.py). Les
 * champs obligatoires du serveur sont obligatoires dans les types, donc un appel qui ferait
 * répondre 400 au serveur ne compile pas. Pour envoyer volontairement un payload invalide :
 * publishEvent directement.
 *
 * Les trois publications vérifient d'abord le consentement du partenaire émetteur (`partner`, AMI par défaut), c'est-à-dire son
 * consentement aux DÉMARCHES (porte d'entrée backend des événements, cf. consent.ts), sauf `verifyPartnerConsent: false`. Pour une
 * notification simple, que le backend applique cette même porte est NON CONFIRMÉ : l'option est donc nommée d'après le partenaire,
 * pas d'après un type de consentement. Les notifications PUSH (réglage global AMI, côté app) n'ont rien à voir avec cette option.
 *
 *   publishNotification     — notification simple, sans objet associé
 *   publishDemarche         — démarche (suivi) : item_type, item_id et statut obligatoires
 *   publishDemarcheEnfant   — démarche rattachée à une démarche parente
 */
import type {PartnerId} from './consent'
import {publishEvent, type EventPayload, type GenericStatus} from './event'

export interface NotificationOptions {
    recipientFcHash: string
    title: string
    body: string
    /** Corps privé, jamais poussé dans la notification push. */
    privateBody?: string
    /** Sous-titre / service instructeur. Titre de la démarche enfant dans le suivi. */
    subheading?: string
    /** Nom d'icône DSFR, ex. `fr-icon-notification-3-line`. */
    icon?: string
    contentLink?: string
    eventDate?: string
    validUntil?: string
    tryPush?: boolean
    /** Partenaire émetteur dont on vérifie le consentement ; AMI par défaut (partenaire des identifiants de test). */
    partner?: PartnerId
    /** Vérifie le consentement du partenaire pour ses événements (cf. consent.ts) avant publication ; true par défaut. */
    verifyPartnerConsent?: boolean
}

export interface DemarcheOptions extends NotificationOptions {
    /** Type libre de l'objet, ex. `OTV`. */
    itemType: string
    /** Identifiant de l'objet chez le partenaire. */
    itemId: string
    /** Statut générique, qui pilote le comportement de l'app (en cours, archivage…). */
    status: GenericStatus
    /** Libellé affiché ; par défaut selon `status` (voir DEFAULT_STATUS_LABEL). */
    statusLabel?: string
    /** Canal source pour la mesure d'impact ; `AMI` par défaut. */
    canal?: string
    /**
     * Dates de l'échéance (ISO 8601). Renseigner l'une des deux crée une entrée dans l'agenda de l'usager
     * (front : `buildAgendaItem`, ami-notifications-api/public/mobile-app/src/lib/followup.ts) : un rendez-vous
     * n'existe pas seul, c'est une démarche avec une date. Les dates sont lues sur la DERNIÈRE notification
     * de la démarche : une mise à jour qui ne les répète pas retire l'entrée de l'agenda.
     */
    milestoneStartDate?: string
    milestoneEndDate?: string
}

export interface ParentRef {
    type: string
    id: string
    /** Partenaire émetteur du parent ; par défaut le partenaire courant. */
    partnerId?: string
}

export interface DemarcheEnfantOptions extends DemarcheOptions {
    parent: ParentRef
}

const DEFAULT_STATUS_LABEL: Record<GenericStatus, string> = {new: 'Brouillon', wip: 'En cours', closed: 'Terminé'}

function notificationPayload(o: NotificationOptions): EventPayload {
    return {
        recipient_fc_hash: o.recipientFcHash,
        content_title: o.title,
        content_body: o.body,
        content_private_body: o.privateBody,
        content_subheading: o.subheading,
        content_icon: o.icon,
        content_link: o.contentLink,
        event_date: o.eventDate,
        valid_until: o.validUntil,
        try_push: o.tryPush,
    }
}

function demarchePayload(o: DemarcheOptions): EventPayload {
    return {
        ...notificationPayload(o),
        item_type: o.itemType,
        item_id: o.itemId,
        item_status_label: o.statusLabel ?? DEFAULT_STATUS_LABEL[o.status],
        item_generic_status: o.status,
        item_canal: o.canal ?? 'AMI',
        item_milestone_start_date: o.milestoneStartDate,
        item_milestone_end_date: o.milestoneEndDate,
    }
}

export async function publishNotification(o: NotificationOptions): Promise<void> {
    await publishEvent(notificationPayload(o), {partner: o.partner, verifyPartnerConsent: o.verifyPartnerConsent})
}

export async function publishDemarche(o: DemarcheOptions): Promise<void> {
    await publishEvent(demarchePayload(o), {partner: o.partner, verifyPartnerConsent: o.verifyPartnerConsent})
}

export async function publishDemarcheEnfant(o: DemarcheEnfantOptions): Promise<void> {
    await publishEvent({
        ...demarchePayload(o),
        item_parent_type: o.parent.type,
        item_parent_id: o.parent.id,
        item_parent_partner_id: o.parent.partnerId,
    }, {partner: o.partner, verifyPartnerConsent: o.verifyPartnerConsent})
}
