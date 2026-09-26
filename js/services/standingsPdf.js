import { latin, pdfText, line, clip } from './fixturePdf.js';

// PDF de la clasificación (Posiciones) con las mismas columnas que la tabla
// de la vista: puesto, equipo y los datos de sets y puntos.
const makePage = (tournament, category, rows, pageNumber, totalPages, subtitle) => {
    const commands = [
        '0.08 0.12 0.2 rg', '40 543 762 32 re f', '1 1 1 rg', line(52, 554, 16, subtitle.title, true),
        '0.08 0.12 0.2 rg', line(40, 523, 13, tournament.nombre, true),
        line(44, 507, 8, '#', true), line(66, 507, 8, 'PUESTO', true), line(138, 507, 8, 'EQUIPO', true),
        line(275, 507, 8, 'PJ', true), line(308, 507, 8, 'PG', true), line(341, 507, 8, 'PP', true),
        line(376, 507, 8, 'SF', true), line(409, 507, 8, 'SC', true), line(444, 507, 8, 'DIF. SETS', true),
        line(500, 507, 8, 'PTS', true), line(535, 507, 8, 'PF', true), line(568, 507, 8, 'PC', true),
        line(602, 507, 8, 'DIF. PUNTOS', true)
    ];
    if (subtitle.text) commands.push('0.35 0.42 0.55 rg', line(40, 493, 9, clip(subtitle.text, 90)));
    commands.push('0.35 0.42 0.55 rg', line(560, 523, 9, clip(`Pagina ${pageNumber} de ${totalPages}`, 34), true));
    if (!rows.length) commands.push('0.08 0.12 0.2 rg', line(44, 470, 11, 'Sin equipos en esta categoria.'));
    let y = 470;
    rows.forEach((row, index) => {
        if (row.zebra) commands.push('0.94 0.95 0.97 rg', `40 ${y - 5} 762 18 re f`);
        commands.push('0.08 0.12 0.2 rg');
        commands.push(line(44, y, 9, String(row.position)));
        commands.push(line(66, y, 9, clip(row.place, 11), true));
        commands.push(line(138, y, 9, clip(row.nombre, 28)));
        commands.push(line(275, y, 9, String(row.jugados)));
        commands.push(line(308, y, 9, String(row.ganados)));
        commands.push(line(341, y, 9, String(row.perdidos)));
        commands.push(line(376, y, 9, String(row.setsFavor)));
        commands.push(line(409, y, 9, String(row.setsContra)));
        commands.push(line(444, y, 9, clip(row.diferenciaSetsText, 7)));
        commands.push(line(500, y, 9, String(row.puntosClasificacion), true));
        commands.push(line(535, y, 9, String(row.puntosFavor)));
        commands.push(line(568, y, 9, String(row.puntosContra)));
        commands.push(line(602, y, 9, clip(row.diferenciaPuntosText, 7), true));
        commands.push('0.82 0.84 0.87 RG', `40 ${y - 6} m 802 ${y - 6} l S`);
        y -= 20;
    });
    commands.push(line(40, 24, 8, `Generado desde la clasificacion vigente - Pagina ${pageNumber} de ${totalPages}`));
    return commands.join('\n');
};

const pdfRows = (rows, labelFor) => rows.map((row, index) => ({
    position: index + 1,
    place: labelFor ? labelFor(index) : `${index + 1}.o`,
    nombre: row.nombre,
    jugados: row.jugados, ganados: row.ganados, perdidos: row.perdidos,
    setsFavor: row.setsFavor, setsContra: row.setsContra,
    diferenciaSetsText: `${row.diferenciaSets > 0 ? '+' : ''}${row.diferenciaSets}`,
    puntosClasificacion: row.puntosClasificacion,
    puntosFavor: row.puntosFavor, puntosContra: row.puntosContra,
    diferenciaPuntosText: `${row.diferenciaPuntos > 0 ? '+' : ''}${row.diferenciaPuntos}`,
    zebra: index % 2 === 1
}));

export const buildStandingsPdf = ({ tournament, category, rows, title = 'CLASIFICACION GENERAL DEL TORNEO', subtitle = '', labelFor = null }) => {
    const pdfRowsList = pdfRows(rows || [], labelFor);
    const budget = 470 - 46;
    const pages = [];
    let current = [];
    let used = 0;
    pdfRowsList.forEach(row => {
        if (current.length && used + 20 > budget) {
            pages.push(current);
            current = [];
            used = 0;
        }
        used += 20;
        current.push(row);
    });
    pages.push(current);
    const subtitleInfo = { title, text: [category?.nombre, subtitle].filter(Boolean).join(' · ') };
    const objects = [];
    const add = value => { objects.push(value); return objects.length; };
    const catalogId = add('');
    const pagesId = add('');
    const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const boldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds = [];
    pages.forEach((pageRows, index) => {
        const stream = makePage(tournament, category, pageRows, index + 1, pages.length, subtitleInfo);
        const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Uint8Array([...pdf].map(character => character.charCodeAt(0) & 0xff));
};

export const downloadStandingsPdf = options => {
    const bytes = buildStandingsPdf(options);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    const slug = value => latin(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.download = `clasificacion-${slug(options.tournament.nombre)}-${slug(options.category?.nombre || 'general')}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
