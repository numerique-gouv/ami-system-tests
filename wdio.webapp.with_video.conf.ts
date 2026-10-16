import path from 'path'
import type { Options } from '@wdio/types'
import { config as webappConfig } from './wdio.webapp.conf'
import { traceServices } from './wdio.base.conf'

/**
 * Config WDIO « vidéo » : la config webapp (`wdio.webapp.conf.ts`) + le service DevTools réglé pour filmer. C'est la SEULE config qui
 * active la vidéo ; la config de référence la laisse à `'off'`. Lancement documenté : `just test-webvideo <spec>`.
 *
 * Ce que le service DevTools produit, sans aucun traitement de notre part (options du service, cf. son README) :
 *  - `video: 'on'` : un fichier `.webm` par test, gardé même si le test RÉUSSIT →
 *      `test-results/traces/<horodatage>_webapp_<spec>/test-results/video-<test>-<session>.webm` ;
 *  - `filmstrip: true` : un film continu enregistré DANS la trace, rejoué par le lecteur → `just failures-ui <dossier du run>` ;
 *  - `tracePolicy: 'on'` : la trace est gardée aussi pour un test réussi (la config de référence ne la garde qu'en cas d'échec).
 * Le service DevTools est remis en marche même en mode visible (`WEBAPP_HEADLESS=false`), où la config de référence le coupe pour
 * éviter le clignotement de la fenêtre : la vidéo l'exige, au prix de ce clignotement.
 */

// Contournement ffmpeg 9 (Homebrew) : le service DevTools passe `-vsync` à ffmpeg, option SUPPRIMÉE en ffmpeg 9 ; sans cette enveloppe
// l'encodage du `.webm` échoue avec « ffmpeg binary not found on PATH » (message trompeur). L'enveloppe ne fait que remplacer `-vsync`
// par `-fps_mode` ; elle ne touche ni à la vidéo ni à la trace. À retirer quand le service passera `-fps_mode`. `filmstrip` n'en dépend pas.
process.env.FFMPEG_PATH = path.resolve(__dirname, 'wdio.webapp.with_video.ffmpeg.sh')

// Les services de trace de la base, avec les trois options ci-dessus (les autres options sont conservées telles quelles).
const servicesAvecVideo = traceServices.map(service =>
  Array.isArray(service) && service[0] === 'devtools'
    ? ['devtools', { ...(service[1] as Record<string, unknown>), video: 'on', filmstrip: true, tracePolicy: 'on' }]
    : service,
) as NonNullable<Options.Testrunner['services']>

export const config: Options.Testrunner = {
  ...webappConfig,
  services: servicesAvecVideo,
  // Une seule tentative : un test rejoué écrit sa trace sous la même clé de test que le premier essai (la trace du premier est écrasée,
  // ses vidéos, captures et dumps restent), d'où deux vidéos pour une seule trace. Pour filmer, on veut un essai = une vidéo = une trace.
  specFileRetries: 0,
}
