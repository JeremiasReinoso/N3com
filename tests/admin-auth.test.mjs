import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { validarAccesoAdmin } = await import(pathToFileURL(resolve(root, 'js/core/adminAuth.js')).href);

assert.equal(validarAccesoAdmin('MRX2026', 'AjedrezEsVida2026'), true, 'Las credenciales administrativas configuradas deben permitir el acceso.');
assert.equal(validarAccesoAdmin('mrx2026', 'AjedrezEsVida2026'), false, 'El usuario debe respetar las credenciales configuradas.');
assert.equal(validarAccesoAdmin('MRX2026', 'incorrecta'), false, 'Una contraseña incorrecta no debe habilitar el panel.');
console.log('El acceso administrativo exige las credenciales configuradas en cada carga.');
