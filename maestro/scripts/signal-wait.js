// Attend (polling) qu'un fichier signal soit créé par un autre appareil.
// Variables Maestro disponibles : SIGNAL_FILE, TIMEOUT_MS
const fs      = require('fs');
const file    = process.env.SIGNAL_FILE  || '/tmp/maestro-signal.json';
const timeout = parseInt(process.env.TIMEOUT_MS || '15000', 10);
const start   = Date.now();

while (!fs.existsSync(file)) {
    if (Date.now() - start > timeout) {
        throw new Error('Timeout : signal ' + file + ' jamais reçu');
    }
    // Maestro runScript est synchrone — busy-wait intentionnel (court intervalle)
    const until = Date.now() + 500;
    while (Date.now() < until) { /* spin */ }
}

output.data = JSON.parse(fs.readFileSync(file, 'utf8'));
// Nettoyage pour le prochain run
fs.unlinkSync(file);
