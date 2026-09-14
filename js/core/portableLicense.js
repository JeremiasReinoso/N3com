const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const base = alphabet.length;
const portablePattern = /^NWC-(P[A-Z2-9]{3})-([A-Z2-9]{4})-([A-Z2-9]{4})$/;

const normalize = code => String(code || '').trim().toUpperCase();
const encode = (value, width) => {
    let remaining = Number(value);
    let result = '';
    for (let index = 0; index < width; index += 1) {
        result = alphabet[remaining % base] + result;
        remaining = Math.floor(remaining / base);
    }
    return result;
};
const decode = value => [...value].reduce((result, character) => {
    const index = alphabet.indexOf(character);
    return index < 0 ? NaN : result * base + index;
}, 0);
const checksum = payload => {
    let hash = 2166136261;
    for (const character of `NEWCOM-PORTABLE-2026:${payload}`) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return encode(hash % (base ** 4), 4);
};

export const createPortableLicenseCode = (id, tournamentsPurchased) => {
    const serial = Number(String(id || '').replace(/^CLI-/, ''));
    const credits = Number(tournamentsPurchased);
    if (!Number.isInteger(serial) || serial < 1 || serial >= base ** 3) throw new Error('INVALID_LICENSE_ID');
    if (!Number.isInteger(credits) || credits < 1 || credits >= base ** 4) throw new Error('INVALID_CREDITS');
    const identifier = `P${encode(serial, 3)}`;
    const allowance = encode(credits, 4);
    return `NWC-${identifier}-${allowance}-${checksum(`${identifier}-${allowance}`)}`;
};

export const parsePortableLicenseCode = code => {
    const normalized = normalize(code);
    const match = normalized.match(portablePattern);
    if (!match) return null;
    const [, identifier, allowance, verification] = match;
    if (verification !== checksum(`${identifier}-${allowance}`)) return null;
    const serial = decode(identifier.slice(1));
    const tournamentsPurchased = decode(allowance);
    if (!Number.isInteger(serial) || serial < 1 || !Number.isInteger(tournamentsPurchased) || tournamentsPurchased < 1) return null;
    return { id: `CLI-${String(serial).padStart(4, '0')}`, code: normalized, tournamentsPurchased };
};
