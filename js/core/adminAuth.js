export const ADMIN_USERNAME = 'MRX2026';
export const ADMIN_PASSWORD = 'AjedrezEsVida2026';

export const validarAccesoAdmin = (username, password) => (
    String(username || '').trim() === ADMIN_USERNAME
    && String(password || '') === ADMIN_PASSWORD
);
