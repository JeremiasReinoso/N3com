import { fixtureCompare } from './logistics.js';

const latin = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\xFF]/g, '?');
const pdfText = value => latin(value).replace(/([\\()])/g, '\\$1');
const dayLabel = date => date ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`)).toUpperCase() : 'SIN FECHA';
const statusLabel = status => ({ borrador: 'Sin programar', pendiente: 'Confirmado', programado: 'Programado', confirmado: 'Confirmado', en_juego: 'En juego', finalizado: 'Finalizado' }[status] || status || 'Sin programar');

const line = (x, y, size, value, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
const makePage = (tournament, rows, pageNumber, totalPages) => {
    const commands = [
        '0.08 0.12 0.2 rg', '40 543 762 32 re f', '1 1 1 rg', line(52, 554, 15, 'FIXTURE GENERAL DEL TORNEO', true),
        '0.08 0.12 0.2 rg', line(40, 525, 12, tournament.nombre, true),
        line(40, 507, 8, 'HORA     CANCHA                   CATEGORIA / MODALIDAD             ETAPA / ZONA                       PARTIDO', true)
    ];
    let y = 488;
    let currentDate = null;
    rows.forEach(row => {
        if (row.fecha !== currentDate) {
            currentDate = row.fecha;
            commands.push('0.88 0.91 0.95 rg', `40 ${y - 4} 762 18 re f`, '0.08 0.12 0.2 rg', line(46, y + 1, 10, dayLabel(row.fecha), true));
            y -= 25;
        }
        const category = [row.categoryAge, row.modality].filter(Boolean).join(' · ') || row.categoryName;
        const stage = `${row.phaseLabel}${row.zoneName ? ` · ${row.zoneName}` : ''}`;
        const match = `${row.teamA} vs ${row.teamB}`;
        commands.push(line(42, y, 8, row.hora || '--:--', true));
        commands.push(line(90, y, 8, row.cancha || 'Sin cancha'));
        commands.push(line(180, y, 8, category));
        commands.push(line(350, y, 8, stage));
        commands.push(line(520, y, 8, match));
        commands.push('0.82 0.84 0.87 RG', `40 ${y - 5} m 802 ${y - 5} l S`, '0.08 0.12 0.2 rg');
        y -= 19;
    });
    commands.push(line(40, 24, 7, `Generado desde la programacion vigente · Pagina ${pageNumber} de ${totalPages}`));
    return commands.join('\n');
};

export const fixtureRows = ({ matches, categories, teams, zones, phaseLabels, filters = {} }) => {
    const category = id => categories.find(item => item.id === id);
    const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo no disponible';
    const zone = id => zones.find(item => item.id === id)?.nombre || '';
    return matches.filter(match => (!filters.date || match.fecha === filters.date) && (!filters.courtId || match.courtId === filters.courtId || match.cancha === filters.courtName))
        .sort(fixtureCompare).map(match => {
            const item = category(match.categoriaId) || {};
            return {
                id: match.id, fecha: match.fecha, hora: match.hora, cancha: match.cancha,
                categoryName: item.nombre || 'Sin categoría', categoryAge: item.edad || '', modality: item.modalidad || '',
                phaseLabel: phaseLabels[match.phase || 'ZONAS'] || match.phase || 'Fase de zonas', zoneName: zone(match.zonaId),
                teamA: team(match.equipoLocalId), teamB: team(match.equipoVisitanteId), status: statusLabel(match.estado)
            };
        });
};

export const buildFixturePdf = (tournament, rows) => {
    const pages = [];
    let current = [];
    let lineCount = 0;
    let lastDate = null;
    rows.forEach(row => {
        const needed = row.fecha === lastDate ? 1 : 2;
        if (lineCount + needed > 21 && current.length) { pages.push(current); current = []; lineCount = 0; lastDate = null; }
        current.push(row); lineCount += row.fecha === lastDate ? 1 : 2; lastDate = row.fecha;
    });
    pages.push(current);
    const objects = [];
    const add = value => { objects.push(value); return objects.length; };
    const catalogId = add('');
    const pagesId = add('');
    const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const boldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds = [];
    pages.forEach((pageRows, index) => {
        const stream = makePage(tournament, pageRows, index + 1, pages.length);
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

export const downloadFixturePdf = (tournament, rows, suffix = 'completo') => {
    const bytes = buildFixturePdf(tournament, rows);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixture-${latin(tournament.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
