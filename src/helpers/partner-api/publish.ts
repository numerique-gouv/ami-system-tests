/** Chaque fonction remplit un gabarit d'EventPayload : les champs obligatoires du serveur le sont dans les types. Pour un payload invalide, appeler publishEvent. */
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
    /** Partenaire émetteur ; AMI par défaut. */
    partner?: PartnerId
    /** Vérifie le consentement du partenaire avant publication ; true par défaut. */
    verifyPartnerConsent?: boolean
}

export interface DemarcheOptions extends NotificationOptions {
    /** Type libre de l'objet, ex. `OTV`. */
    itemType: string
    /** Identifiant de l'objet chez le partenaire. */
    itemId: string
    /** Statut générique, qui pilote le comportement de l'app. */
    status: GenericStatus
    /** Libellé affiché ; par défaut selon `status`. */
    statusLabel?: string
    /** Canal source ; `AMI` par défaut. */
    canal?: string
    /** Dates ISO 8601 de l'échéance : l'une des deux crée une entrée d'agenda. Lues sur la dernière notification de la démarche. */
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
