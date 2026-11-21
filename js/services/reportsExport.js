// Exportación comercial de reportes PDF y CSV para Posiciones y Resultados.
// Comparte la misma base PDF-1.4 sin dependencias externas para escritorio Electron y web.

const latin = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\xFF]/g, '?');
const pdfText = value => latin(value).replace(/([\\()])/g, '\\$1');
const clip = (value, max) => {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, Math.max(1, max - 3))}...` : text;
};
const line = (x, y, size, value, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
const slug = value => latin(value || 'torneo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'torneo';

const compilePdfPages = pageStreams => {
    const streams = pageStreams.length ? pageStreams : [''];
    const objects = [];
    const add = value => { objects.push(value); return objects.length; };
    const catalogId = add('');
    const pagesId = add('');
    const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const boldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds = [];
    streams.forEach(stream => {
        const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    });
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Uint8Array([...pdf].map(character => character.charCodeAt(0) & 0xff));
};

const renderDocumentHeader = ({ bannerTitle, tournament, category, subtitle, pageNumber, totalPages }) => {
    const org = tournament?.branding?.brandName || tournament?.organizacion || '';
    const period = tournament?.startDate && tournament?.endDate ? `${tournament.startDate} al ${tournament.endDate}` : '';
    const title = org ? `${bannerTitle} · ${org.toUpperCase()}` : bannerTitle;
    const cmds = [
        '0.08 0.12 0.2 rg', '40 543 762 32 re f', '1 1 1 rg', line(52, 554, 15, clip(title, 66), true),
        '0.08 0.12 0.2 rg', line(40, 523, 13, clip(`${tournament?.nombre || 'Torneo'}${category ? ` · ${category.nombre}` : ''}${period ? ` (${period})` : ''}`, 72), true),
        '0.35 0.42 0.55 rg', line(640, 523, 9, `Pagina ${pageNumber} de ${totalPages}`, true)
    ];
    if (subtitle) cmds.push('0.35 0.42 0.55 rg', line(40, 507, 9, clip(subtitle, 96)));
    return cmds;
};

const triggerDownload = (bytesOrBlob, filename, mime) => {
    const blob = bytesOrBlob instanceof Blob ? bytesOrBlob : new Blob([bytesOrBlob], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Construye un PDF de Tablas de Posiciones (Clasificación Final, Zona Final, Zonas y/o General).
export const buildStandingsPdf = ({ tournament, category, formatLabel = '', sections = [], showPointsColumn = false }) => {
    const rowsFlat = [];
    sections.forEach(section => {
        rowsFlat.push({ kind: 'section', title: section.title, note: section.note || '' });
        (section.rows || []).forEach((row, index) => {
            rowsFlat.push({ kind: 'row', rank: index + 1, row });
        });
    });
    if (!rowsFlat.length) rowsFlat.push({ kind: 'empty', text: 'Sin posiciones registradas para esta categoria.' });

    const pagesData = [];
    let current = [];
    let used = 0;
    const budget = 420;
    rowsFlat.forEach(entry => {
        const height = entry.kind === 'section' ? 38 : 19;
        if (current.length && used + height > budget) {
            pagesData.push(current);
            current = [];
            used = 0;
        }
        current.push(entry);
        used += height;
    });
    if (current.length) pagesData.push(current);

    const streams = pagesData.map((entries, pageIndex) => {
        const cmds = renderDocumentHeader({
            bannerTitle: 'TABLA DE POSICIONES',
            tournament,
            category,
            subtitle: formatLabel ? `Formato: ${formatLabel}` : 'Calculo por sets reales (PJ, PG, PP, SF, SC, PF, PC, DIF)',
            pageNumber: pageIndex + 1,
            totalPages: pagesData.length
        });
        let y = 486;
        entries.forEach(entry => {
            if (entry.kind === 'section') {
                cmds.push('0.88 0.91 0.95 rg', `40 ${y - 4} 762 18 re f`, '0.08 0.12 0.2 rg', line(46, y + 1, 10, clip(entry.title, 70), true));
                if (entry.note) cmds.push('0.35 0.42 0.55 rg', line(470, y + 1, 8, clip(entry.note, 45)));
                y -= 20;
                cmds.push('0.08 0.12 0.2 rg',
                    line(44, y, 8, '#', true),
                    line(74, y, 8, 'EQUIPO', true),
                    line(340, y, 8, 'PJ', true),
                    line(382, y, 8, 'PG', true),
                    line(424, y, 8, 'PP', true),
                    line(466, y, 8, 'SF', true),
                    line(508, y, 8, 'SC', true),
                    line(550, y, 8, 'PF', true),
                    line(596, y, 8, 'PC', true),
                    line(642, y, 8, 'DIF', true),
                    ...(showPointsColumn ? [line(700, y, 8, 'PTS', true)] : [])
                );
                y -= 16;
                return;
            }
            if (entry.kind === 'empty') {
                cmds.push('0.35 0.42 0.55 rg', line(46, y, 10, entry.text));
                y -= 20;
                return;
            }
            const r = entry.row;
            const dif = `${r.diferenciaPuntos > 0 ? '+' : ''}${r.diferenciaPuntos}`;
            cmds.push('0.08 0.12 0.2 rg',
                line(44, y, 9, String(entry.rank), true),
                line(74, y, 9, clip(r.nombre || 'Equipo', 42), entry.rank <= 3),
                line(340, y, 9, String(r.jugados)),
                line(382, y, 9, String(r.ganados)),
                line(424, y, 9, String(r.perdidos)),
                line(466, y, 9, String(r.setsFavor)),
                line(508, y, 9, String(r.setsContra)),
                line(550, y, 9, String(r.puntosFavor)),
                line(596, y, 9, String(r.puntosContra)),
                line(642, y, 9, dif, true),
                ...(showPointsColumn ? [line(700, y, 9, String(r.puntosTabla ?? 0), true)] : [])
            );
            cmds.push('0.85 0.87 0.90 RG', `40 ${y - 5} m 802 ${y - 5} l S`, '0.08 0.12 0.2 rg');
            y -= 19;
        });
        cmds.push('0.35 0.42 0.55 rg', line(40, 24, 8, `N3com · Reporte oficial de posiciones - Pagina ${pageIndex + 1} de ${pagesData.length}`));
        return cmds.join('\n');
    });

    return compilePdfPages(streams);
};

export const downloadStandingsPdf = params => {
    const bytes = buildStandingsPdf(params);
    triggerDownload(bytes, `posiciones-${slug(params.tournament?.nombre)}-${slug(params.category?.nombre)}.pdf`, 'application/pdf');
};

export const buildStandingsCsv = ({ sections = [], showPointsColumn = false }) => {
    const esc = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = ['Tabla', '#', 'Equipo', 'PJ', 'PG', 'PP', 'SF', 'SC', 'PF', 'PC', 'DIF', ...(showPointsColumn ? ['PTS'] : [])];
    const body = [];
    sections.forEach(section => {
        (section.rows || []).forEach((row, index) => {
            body.push([
                section.title, index + 1, row.nombre,
                row.jugados, row.ganados, row.perdidos,
                row.setsFavor, row.setsContra, row.puntosFavor, row.puntosContra,
                row.diferenciaPuntos, ...(showPointsColumn ? [row.puntosTabla ?? 0] : [])
            ]);
        });
    });
    return [header, ...body].map(row => row.map(esc).join(';')).join('\r\n');
};

export const downloadStandingsCsv = ({ tournament, category, sections, showPointsColumn = false }) => {
    const csv = buildStandingsCsv({ sections, showPointsColumn });
    triggerDownload(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `posiciones-${slug(tournament?.nombre)}-${slug(category?.nombre)}.csv`, 'text/csv;charset=utf-8');
};

// Construye un PDF de Resultados oficiales con detalle real set a set y puntos totales.
export const buildResultsPdf = ({ tournament, category, formatLabel = '', matches = [], teams = [], zones = [], phaseLabels = {} }) => {
    const teamName = id => teams.find(item => item.id === id)?.nombre || 'Por definir';
    const zoneName = id => zones.find(item => item.id === id)?.nombre || '';
    const sorted = [...matches].sort((left, right) => (
        String(left.fecha || '9999-99-99').localeCompare(String(right.fecha || '9999-99-99'))
        || String(left.hora || '99:99').localeCompare(String(right.hora || '99:99'))
        || Number(left.ronda || left.orden || 0) - Number(right.ronda || right.orden || 0)
    ));

    const pagesData = [];
    const perPage = 16;
    for (let index = 0; index < sorted.length; index += perPage) {
        pagesData.push(sorted.slice(index, index + perPage));
    }
    if (!pagesData.length) pagesData.push([]);

    const streams = pagesData.map((pageRows, pageIndex) => {
        const cmds = renderDocumentHeader({
            bannerTitle: 'REPORTE DE RESULTADOS',
            tournament,
            category,
            subtitle: formatLabel ? `Formato: ${formatLabel} · ${sorted.length} partido(s)` : `${sorted.length} partido(s)`,
            pageNumber: pageIndex + 1,
            totalPages: pagesData.length
        });
        cmds.push('0.08 0.12 0.2 rg',
            line(42, 488, 8, 'FECHA / HORA', true),
            line(130, 488, 8, 'ETAPA / ZONA', true),
            line(268, 488, 8, 'PARTIDO', true),
            line(500, 488, 8, 'SETS', true),
            line(640, 488, 8, 'MARCADOR', true),
            line(702, 488, 8, 'GANADOR', true)
        );
        let y = 468;
        if (!pageRows.length) {
            cmds.push('0.35 0.42 0.55 rg', line(42, y, 10, 'Aun no hay partidos confirmados en esta categoria.'));
        }
        pageRows.forEach(match => {
            const when = `${match.fecha || 'Sin fecha'} ${match.hora || ''}`.trim();
            const stageText = `${phaseLabels[match.phase || 'ZONAS'] || match.phase || 'Zonas'}${match.zonaId ? ` · ${zoneName(match.zonaId)}` : ''}`;
            const pairText = `${teamName(match.equipoLocalId)} vs ${teamName(match.equipoVisitanteId)}`;
            const setsText = Array.isArray(match.sets) && match.sets.length
                ? match.sets.map((set, idx) => `S${idx + 1}:${set.puntosLocal}-${set.puntosVisitante}`).join(' ')
                : 'Pendiente';
            const scoreText = match.estado === 'finalizado' ? `${match.score} (${match.puntosFavor}-${match.puntosContra})` : 'Pend.';
            const winnerText = match.estado === 'finalizado' ? teamName(match.ganadorId) : '-';
            cmds.push('0.08 0.12 0.2 rg',
                line(42, y, 8, clip(when, 17)),
                line(130, y, 8, clip(stageText, 26)),
                line(268, y, 8, clip(pairText, 44), true),
                line(500, y, 8, clip(setsText, 27)),
                line(640, y, 8, clip(scoreText, 13), true),
                line(702, y, 8, clip(winnerText, 18))
            );
            cmds.push('0.85 0.87 0.90 RG', `40 ${y - 6} m 802 ${y - 6} l S`, '0.08 0.12 0.2 rg');
            y -= 24;
        });
        cmds.push('0.35 0.42 0.55 rg', line(40, 24, 8, `N3com · Reporte oficial de resultados - Pagina ${pageIndex + 1} de ${pagesData.length}`));
        return cmds.join('\n');
    });

    return compilePdfPages(streams);
};

export const downloadResultsPdf = params => {
    const bytes = buildResultsPdf(params);
    triggerDownload(bytes, `resultados-${slug(params.tournament?.nombre)}-${slug(params.category?.nombre)}.pdf`, 'application/pdf');
};

export const buildResultsCsv = ({ matches = [], teams = [], zones = [], phaseLabels = {} }) => {
    const esc = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const teamName = id => teams.find(item => item.id === id)?.nombre || 'Por definir';
    const zoneName = id => zones.find(item => item.id === id)?.nombre || '';
    const header = ['Fecha', 'Hora', 'Cancha', 'Etapa', 'Zona', 'Local', 'Visitante', 'Estado', 'Set 1', 'Set 2', 'Set 3', 'Marcador', 'PF Local', 'PC Local', 'Ganador'];
    const body = matches.map(match => [
        match.fecha || '', match.hora || '', match.cancha || '',
        phaseLabels[match.phase || 'ZONAS'] || match.phase || 'Zonas',
        zoneName(match.zonaId),
        teamName(match.equipoLocalId), teamName(match.equipoVisitanteId),
        match.estado || 'pendiente',
        match.sets?.[0] ? `${match.sets[0].puntosLocal}-${match.sets[0].puntosVisitante}` : '',
        match.sets?.[1] ? `${match.sets[1].puntosLocal}-${match.sets[1].puntosVisitante}` : '',
        match.sets?.[2] ? `${match.sets[2].puntosLocal}-${match.sets[2].puntosVisitante}` : '',
        match.score || '',
        match.puntosFavor ?? '', match.puntosContra ?? '',
        match.ganadorId ? teamName(match.ganadorId) : ''
    ]);
    return [header, ...body].map(row => row.map(esc).join(';')).join('\r\n');
};

export const downloadResultsCsv = params => {
    const csv = buildResultsCsv(params);
    triggerDownload(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `resultados-${slug(params.tournament?.nombre)}-${slug(params.category?.nombre)}.csv`, 'text/csv;charset=utf-8');
};
