import { fixtureCompare } from './logistics.js';

const latin = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\xFF]/g, '?');
const pdfText = value => latin(value).replace(/([\\()])/g, '\\$1');
const dayLabel = date => date ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`)).toUpperCase() : 'SIN FECHA';
const statusLabel = status => ({ borrador: 'Sin programar', pendiente: 'Confirmado', programado: 'Programado', confirmado: 'Confirmado', en_juego: 'En juego', finalizado: 'Finalizado' }[status] || status || 'Sin programar');

const line = (x, y, size, value, bold = false) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
// Ninguna columna se desborda del ancho de la hoja: los textos largos se
// recortan con puntos para que el documento siga siendo legible al imprimir.
const clip = (value, max) => {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, Math.max(1, max - 3))}...` : text;
};
const makePage = (tournament, rows, pageNumber, totalPages, subtitle = '', courtName = '') => {
    const commands = [
        '0.08 0.12 0.2 rg', '40 543 762 32 re f', '1 1 1 rg', line(52, 554, 16, 'FIXTURE GENERAL DEL TORNEO', true),
        '0.08 0.12 0.2 rg', line(40, 523, 13, tournament.nombre, true),
        // Los títulos de columna se dibujan en la misma posición X que los datos
        // para que la impresión quede alineada aunque cambie el idioma.
        line(42, 507, 8, 'HORA', true), line(86, 507, 8, 'CANCHA', true), line(170, 507, 8, 'CATEGORIA / MODALIDAD', true),
        line(322, 507, 8, 'ETAPA / ZONA', true), line(460, 507, 8, 'PARTIDO', true), line(718, 507, 8, 'ESTADO', true)
    ];
    const pageContext = [subtitle, courtName ? `CANCHA: ${courtName}` : ''].filter(Boolean).join(' · ');
    if (pageContext) commands.push('0.35 0.42 0.55 rg', line(40, 493, 9, clip(pageContext, 78)));
    commands.push('0.35 0.42 0.55 rg', line(560, 523, 9, clip(`Pagina ${pageNumber} de ${totalPages}`, 34), true));
    let y = 476;
    let currentDate = null;
    rows.forEach(row => {
        if (row.fecha !== currentDate) {
            currentDate = row.fecha;
            commands.push('0.88 0.91 0.95 rg', `40 ${y - 4} 762 19 re f`, '0.08 0.12 0.2 rg', line(46, y + 1, 11, dayLabel(row.fecha), true));
            y -= 26;
        }
        const category = [row.categoryAge, row.modality].filter(Boolean).join(' · ') || row.categoryName;
        const stage = `${row.phaseLabel}${row.zoneName ? ` · ${row.zoneName}` : ''}`;
        const match = `${row.teamA} vs ${row.teamB}`;
        const score = row.sets?.length ? `${row.sets.map((set, index) => `S${index + 1}: ${set.puntosLocal}-${set.puntosVisitante}`).join('  ')}  Resultado: ${row.score || ''}` : '';
        commands.push(line(42, y, 9, row.horaInicio ? clip(row.horaInicio, 6) : '', true));
        commands.push(line(86, y, 9, clip(row.cancha || 'Sin cancha', 15)));
        commands.push(line(170, y, 9, clip(category, 30)));
        commands.push(line(322, y, 9, clip(stage, 28)));
        commands.push(line(460, y, 9, clip(match, 50)));
        if (score) commands.push(line(460, y - 10, 7, clip(score, 54)));
        commands.push(line(718, y, 9, clip(row.status, 14)));
        commands.push('0.82 0.84 0.87 RG', `40 ${y - 5} m 802 ${y - 5} l S`, '0.08 0.12 0.2 rg');
        y -= score ? 30 : 20;
    });
    commands.push(line(40, 24, 8, `Generado desde la programacion vigente - Pagina ${pageNumber} de ${totalPages}`));
    return commands.join('\n');
};

export const fixtureRows = ({ matches, categories, teams, zones, phaseLabels, filters = {} }) => {
    const category = id => categories.find(item => item.id === id);
    const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo no disponible';
    const zone = id => zones.find(item => item.id === id)?.nombre || '';
    const sorted = matches.filter(match => (!filters.date || match.fecha === filters.date) && (!filters.courtId || match.courtId === filters.courtId || match.cancha === filters.courtName))
        .sort(fixtureCompare);
    const firstByDate = new Set();
    return sorted.map(match => {
            const item = category(match.categoriaId) || {};
            const horaInicio = firstByDate.has(match.fecha) ? '' : match.hora || '';
            firstByDate.add(match.fecha);
            return {
                id: match.id, fecha: match.fecha, hora: match.hora, horaInicio, cancha: match.cancha, orden: match.orden,
                categoryName: item.nombre || 'Sin categoría', categoryAge: item.edad || '', modality: item.modalidad || '',
                phaseLabel: phaseLabels[match.phase || 'ZONAS'] || match.phase || 'Fase de zonas', zoneName: zone(match.zonaId),
                teamA: team(match.equipoLocalId), teamB: team(match.equipoVisitanteId), status: statusLabel(match.estado),
                sets: Array.isArray(match.sets) ? match.sets : [], score: match.score || ''
            };
        });
};

export const buildFixturePdf = (tournament, rows, subtitle = '') => {
    // Cada página representa una única cancha y una única jornada. Así la
    // exportación sigue siendo una proyección del fixture general, pero nunca
    // mezcla canchas en la misma hoja.
    const sortedRows = [...rows].sort(fixtureCompare);
    const courts = [...new Set(sortedRows.map(row => row.cancha || 'Sin cancha'))]
        .sort((left, right) => left.localeCompare(right, 'es', { numeric: true }));
    const budget = 476 - 46;
    const pages = [];
    courts.forEach(courtName => {
        const courtRows = sortedRows.filter(row => (row.cancha || 'Sin cancha') === courtName);
        const dates = [...new Set(courtRows.map(row => row.fecha || ''))].sort((left, right) => left.localeCompare(right));
        dates.forEach(date => {
            const dateRows = courtRows.filter(row => (row.fecha || '') === date);
            let current = [];
            let used = 0;
            dateRows.forEach(row => {
                const rowHeight = row.sets?.length ? 30 : 20;
                if (current.length && used + rowHeight > budget) {
                    pages.push({ courtName, rows: current });
                    current = [];
                    used = 0;
                }
                used += rowHeight + (current.length ? 0 : 26);
                current.push(row);
            });
            if (current.length) pages.push({ courtName, rows: current });
        });
    });
    if (!pages.length) pages.push({ courtName: '', rows: [] });
    const objects = [];
    const add = value => { objects.push(value); return objects.length; };
    const catalogId = add('');
    const pagesId = add('');
    const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const boldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds = [];
    pages.forEach((page, index) => {
        const stream = makePage(tournament, page.rows, index + 1, pages.length, subtitle, page.courtName);
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

export const downloadFixturePdf = (tournament, rows, suffix = 'completo', subtitle = '') => {
    const bytes = buildFixturePdf(tournament, rows, subtitle);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixture-${latin(tournament.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadFixtureCsv = (tournament, rows, suffix = 'completo') => {
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = ['Fecha', 'Hora', 'Cancha', 'Categoría / Modalidad', 'Etapa / Zona', 'Partido', 'Estado', 'Set 1', 'Set 2', 'Set 3', 'Resultado'];
    const body = rows.map(row => [row.fecha, row.hora, row.cancha, [row.categoryAge, row.modality].filter(Boolean).join(' · ') || row.categoryName,
        row.zoneName ? `${row.phaseLabel} · ${row.zoneName}` : row.phaseLabel, `${row.teamA} vs ${row.teamB}`, row.status,
        row.sets?.[0] ? `${row.sets[0].puntosLocal}-${row.sets[0].puntosVisitante}` : '',
        row.sets?.[1] ? `${row.sets[1].puntosLocal}-${row.sets[1].puntosVisitante}` : '',
        row.sets?.[2] ? `${row.sets[2].puntosLocal}-${row.sets[2].puntosVisitante}` : '', row.score]);
    const csv = [header, ...body].map(row => row.map(escape).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `fixture-${latin(tournament.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}.csv`;
    link.click();
};

const spreadsheetEscape = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const spreadsheetCell = value => `<Cell><Data ss:Type="String">${spreadsheetEscape(value)}</Data></Cell>`;
const spreadsheetSheet = (name, rows, includeCourt = true) => {
    const header = includeCourt
        ? ['Fecha', 'Hora', 'Cancha', 'Categoría', 'Fase', 'Equipo 1', 'Equipo 2', 'Estado', 'Resultado']
        : ['Fecha', 'Hora', 'Categoría', 'Fase', 'Equipo 1', 'Equipo 2', 'Estado', 'Resultado'];
    const body = rows.map(row => {
        const values = includeCourt
            ? [row.fecha, row.hora, row.cancha, [row.categoryAge, row.modality].filter(Boolean).join(' · ') || row.categoryName, row.zoneName ? `${row.phaseLabel} · ${row.zoneName}` : row.phaseLabel, row.teamA, row.teamB, row.status, row.score]
            : [row.fecha, row.hora, [row.categoryAge, row.modality].filter(Boolean).join(' · ') || row.categoryName, row.zoneName ? `${row.phaseLabel} · ${row.zoneName}` : row.phaseLabel, row.teamA, row.teamB, row.status, row.score];
        return `<Row>${values.map(spreadsheetCell).join('')}</Row>`;
    }).join('');
    return `<Worksheet ss:Name="${spreadsheetEscape(name)}"><Table><Row>${header.map(spreadsheetCell).join('')}</Row>${body}</Table></Worksheet>`;
};

// Libro SpreadsheetML 2003: Excel y LibreOffice lo abren como un único
// archivo con múltiples hojas, sin agregar una dependencia externa al
// escritorio. Todas las hojas se proyectan desde las mismas filas generales.
export const buildFixtureSpreadsheet = ({ tournament, rows, courts }) => {
    const general = [...rows].sort(fixtureCompare);
    const sheets = [spreadsheetSheet('Fixture General', general, true)];
    courts.forEach(court => sheets.push(spreadsheetSheet(court.name, general.filter(row => row.cancha === court.name), false)));
    return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${spreadsheetEscape(tournament?.nombre || 'Fixture')}</Title></DocumentProperties>${sheets.join('')}</Workbook>`;
};

const xlsxColumn = index => {
    let value = index + 1;
    let result = '';
    while (value) {
        const remainder = (value - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        value = Math.floor((value - 1) / 26);
    }
    return result;
};

const xlsxXmlEscape = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const xlsxCell = (value, rowNumber, columnNumber, style = 2) => {
    const reference = `${xlsxColumn(columnNumber)}${rowNumber}`;
    return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xlsxXmlEscape(value)}</t></is></c>`;
};

const xlsxRows = (rows, includeCourt = true) => {
    const header = ['Fecha', 'Hora inicio', ...(includeCourt ? ['Cancha'] : []), 'Categoría', 'Zona', 'Etapa', 'Partido', 'Equipo 1', 'Equipo 2', 'Estado', 'Resultado'];
    const sorted = [...rows].sort(fixtureCompare);
    const body = sorted.map((row, index) => {
        const firstOfDate = index === 0 || sorted[index - 1].fecha !== row.fecha;
        const values = [
            row.fecha,
            firstOfDate ? (row.hora || row.horaInicio || '') : '',
            ...(includeCourt ? [row.cancha] : []),
            [row.categoryAge, row.modality].filter(Boolean).join(' · ') || row.categoryName,
            row.zoneName,
            row.phaseLabel,
            `${row.teamA} vs ${row.teamB}`,
            row.teamA,
            row.teamB,
            row.status,
            row.score
        ];
        const style = index % 2 ? 3 : 2;
        return `<row r="${index + 2}">${values.map((value, column) => xlsxCell(value, index + 2, column, style)).join('')}</row>`;
    }).join('');
    const lastColumn = xlsxColumn(header.length - 1);
    const headerXml = `<row r="1">${header.map((value, column) => xlsxCell(value, 1, column, 1)).join('')}</row>`;
    return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${header.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 16 : index === 1 ? 12 : 20}" customWidth="1"/>`).join('')}</cols><sheetData>${headerXml}${body}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(1, sorted.length + 1)}"/></worksheet>`;
};

const xlsxZip = entries => {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const crc32 = bytes => {
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
        return (crc ^ 0xffffffff) >>> 0;
    };
    entries.forEach(({ name, content }) => {
        const nameBytes = encoder.encode(name);
        const data = typeof content === 'string' ? encoder.encode(content) : content;
        const crc = crc32(data);
        const local = new Uint8Array(30 + nameBytes.length + data.length);
        const view = new DataView(local.buffer);
        view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
        view.setUint16(8, 0, true); view.setUint16(10, 0, true); view.setUint16(12, 0, true);
        view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
        view.setUint16(26, nameBytes.length, true); view.setUint16(28, 0, true);
        local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length);
        chunks.push(local);
        const record = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(record.buffer);
        centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0x800, true); centralView.setUint16(10, 0, true); centralView.setUint16(12, 0, true); centralView.setUint16(14, 0, true);
        centralView.setUint32(16, crc, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true);
        centralView.setUint16(28, nameBytes.length, true); centralView.setUint16(30, 0, true); centralView.setUint16(32, 0, true); centralView.setUint16(34, 0, true); centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true); centralView.setUint32(42, offset, true); record.set(nameBytes, 46);
        central.push(record); offset += local.length;
    });
    const centralSize = central.reduce((total, chunk) => total + chunk.length, 0);
    const end = new Uint8Array(22); const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true); endView.setUint16(20, 0, true);
    const output = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
    chunks.forEach(chunk => { output.set(chunk, cursor); cursor += chunk.length; });
    central.forEach(chunk => { output.set(chunk, cursor); cursor += chunk.length; });
    output.set(end, cursor);
    return output;
};

export const buildFixtureXlsx = ({ tournament, rows, courts }) => {
    const safeSheetName = (name, used) => {
        const base = String(name || 'Cancha').replace(/[\\/:?*\[\]]/g, ' ').slice(0, 31) || 'Cancha';
        let candidate = base; let suffix = 2;
        while (used.has(candidate)) candidate = `${base.slice(0, 27)} (${suffix++})`;
        used.add(candidate); return candidate;
    };
    const usedNames = new Set(['Fixture completo']);
    const sheetNames = ['Fixture completo', ...(courts || []).map(court => safeSheetName(court.name, usedNames))];
    const sheets = [xlsxRows(rows, true), ...(courts || []).map(court => xlsxRows(rows.filter(row => row.cancha === court.name), false))];
    const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
    const workbookSheets = sheetNames.map((name, index) => `<sheet name="${xlsxXmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    const contentTypes = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>', '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>', '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>', ...sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)].join('');
    const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E7490"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf applyFont="1" applyFill="1" fontId="1" fillId="2"/><xf/><xf fillId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    const core = `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${xlsxXmlEscape(tournament?.nombre || 'Fixture')}</dc:title></cp:coreProperties>`;
    return xlsxZip([
        { name: '[Content_Types].xml', content: `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes}</Types>` },
        { name: '_rels/.rels', content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
        { name: 'docProps/core.xml', content: core },
        { name: 'xl/workbook.xml', content: `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets></workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', content: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
        { name: 'xl/styles.xml', content: styles },
        ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheet }))
    ]);
};

export const downloadFixtureSpreadsheet = (tournament, rows, courts) => {
    const xlsx = buildFixtureXlsx({ tournament, rows, courts });
    const safeName = latin(tournament.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    link.download = `fixture-${safeName}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
