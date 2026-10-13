export {setBackendUrl, getBackendUrl, scalingoLogsHint} from './client'
export {checkConsent, grantConsent, revokeConsent} from './consent'
export {publishEvent, type EventPayload, type GenericStatus, type PublishEventOptions} from './event'
export {
    publishNotification, publishDemarche, publishDemarcheEnfant,
    type NotificationOptions, type DemarcheOptions, type DemarcheEnfantOptions, type ParentRef,
} from './publish'
