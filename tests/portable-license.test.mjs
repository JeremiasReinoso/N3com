import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalLicenseService } from '../services/licenseService.js';
import { parsePortableLicenseCode } from '../js/core/portableLicense.js';

const issuerDirectory = await mkdtemp(join(tmpdir(), 'newcom-license-issuer-'));
const recipientDirectory = await mkdtemp(join(tmpdir(), 'newcom-license-recipient-'));

try {
    const issuer = new LocalLicenseService(issuerDirectory);
    await issuer.initialize();
    const issued = await issuer.create({ clientName: 'Club Prueba', tournamentsPurchased: 4 });
    if (!parsePortableLicenseCode(issued.code)) throw new Error('El administrador no generó un código portátil verificable.');

    const recipient = new LocalLicenseService(recipientDirectory);
    await recipient.initialize();
    const activated = await recipient.activate(issued.code);
    if (activated.code !== issued.code || activated.tournamentsRemaining !== 4 || activated.clientName !== 'Licencia portátil') throw new Error('Otra instalación local no pudo importar el código emitido.');
    const consumed = await recipient.consumeTournament(issued.code);
    if (consumed.tournamentsRemaining !== 3 || consumed.tournamentsUsed !== 1) throw new Error('La licencia portátil importada no consume créditos correctamente.');
    console.log('Una licencia generada en un equipo se activa y consume créditos en otro sin archivos adicionales.');
} finally {
    await rm(issuerDirectory, { recursive: true, force: true });
    await rm(recipientDirectory, { recursive: true, force: true });
}
