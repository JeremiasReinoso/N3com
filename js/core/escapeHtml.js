const HTML_ESCAPE_MAP = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
});

export const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => HTML_ESCAPE_MAP[character]);
