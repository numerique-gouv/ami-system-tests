// Écrit un fichier signal pour la coordination multi-appareils.
// Variables Maestro disponibles : SIGNAL_FILE, SIGNAL_DATA (JSON stringifié)
const fs = require('fs');

const file  = process.env.SIGNAL_FILE  || '/tmp/maestro-signal.json';
const data  = process.env.SIGNAL_DATA  || '{}';

fs.writeFileSync(file, data);
output.written = file;
