const COLORS = {
    navy: '142033',
    white: 'FFFFFF',
    muted: '596B8C',
    day: 'E0E8F2',
    line: 'D1D6DE',
    soft: 'F7F9FC',
    accent: '0757B8',
    success: '126637',
    successFill: 'EAF8EF',
    pending: '6B5220',
    pendingFill: 'FFF7DF'
};

const border = (color = COLORS.line) => ({ style: 'thin', color: { rgb: color } });
const cellStyle = ({ fill, color = COLORS.navy, bold = false, size = 10, align = 'left', wrap = true } = {}) => ({
    font: { name: 'Arial', sz: size, bold, color: { rgb: color } },
    fill: fill ? { patternType: 'solid', fgColor: { rgb: fill } } : undefined,
    border: { top: border(), bottom: border(), left: border(), right: border() },
    alignment: { horizontal: align, vertical: 'center', wrapText: wrap }
});

const put = (sheet, address, value, style) => {
    sheet[address] = { v: value ?? '', t: 's', s: style };
};

const sanitizeFileName = value => {
    const normalized = String(value || 'torneo').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 100);
    return `Fixture_${safe || 'torneo'}.xlsx`;
};

const dateLabel = date => date
    ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`)).toUpperCase()
    : 'SIN FECHA';

const dayRows = rows => {
    const result = [];
    let currentDate = null;
    rows.forEach(row => {
        if (row.fecha !== currentDate) {
            currentDate = row.fecha;
            result.push({ type: 'day', value: dateLabel(row.fecha) });
        }
        result.push({ type: 'match', value: row });
    });
    return result;
};

export const buildFixtureWorkbook = (tournament, rows, xlsx = globalThis.XLSX) => {
    if (!xlsx?.utils?.aoa_to_sheet || !xlsx?.write) throw new Error('La librería de exportación no está disponible.');

    const sheet = xlsx.utils.aoa_to_sheet([]);
    const merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }
    ];
    const titleStyle = cellStyle({ fill: COLORS.navy, color: COLORS.white, bold: true, size: 16, align: 'left' });
    const tournamentStyle = cellStyle({ color: COLORS.navy, bold: true, size: 13, align: 'left' });
    const subtitleStyle = cellStyle({ color: COLORS.muted, size: 10, align: 'left' });
    const headerStyle = cellStyle({ fill: COLORS.navy, color: COLORS.white, bold: true, size: 9, align: 'center' });
    const dayStyle = cellStyle({ fill: COLORS.day, color: COLORS.navy, bold: true, size: 11, align: 'left' });

    put(sheet, 'A1', 'FIXTURE GENERAL DEL TORNEO', titleStyle);
    put(sheet, 'A2', tournament?.nombre || 'Torneo sin nombre', tournamentStyle);
    put(sheet, 'A3', 'Exportación editable de la programación vigente · compatible con Google Sheets', subtitleStyle);
    const headers = ['HORA', 'CANCHA', 'CATEGORÍA / MODALIDAD', 'ETAPA / ZONA', 'PARTIDO', 'RESULTADO', 'ESTADO'];
    headers.forEach((header, column) => put(sheet, xlsx.utils.encode_cell({ r: 4, c: column }), header, headerStyle));

    let rowIndex = 5;
    dayRows(rows).forEach(item => {
        if (item.type === 'day') {
            merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 6 } });
            put(sheet, `A${rowIndex + 1}`, item.value, dayStyle);
            rowIndex += 1;
            return;
        }
        const row = item.value;
        const category = [row.categoryAge, row.modality].filter(Boolean).join(' · ') || row.categoryName;
        const stage = `${row.phaseLabel}${row.zoneName ? ` · ${row.zoneName}` : ''}`;
        const values = [row.hora || '--:--', row.cancha || 'Sin cancha', category, stage, `${row.teamA} vs ${row.teamB}`, row.resultado || '', row.status || 'Sin programar'];
        const isFinished = row.status === 'Finalizado';
        const isPending = !isFinished;
        values.forEach((value, column) => {
            const style = cellStyle({
                fill: column === 6 ? (isFinished ? COLORS.successFill : COLORS.pendingFill) : (rowIndex % 2 ? COLORS.white : COLORS.soft),
                color: column === 0 ? COLORS.accent : (column === 6 ? (isFinished ? COLORS.success : COLORS.pending) : COLORS.navy),
                bold: column === 0 || column === 6,
                size: column === 4 ? 10 : 9,
                align: [0, 5, 6].includes(column) ? 'center' : 'left'
            });
            put(sheet, xlsx.utils.encode_cell({ r: rowIndex, c: column }), value, style);
        });
        rowIndex += 1;
    });

    sheet['!merges'] = merges;
    sheet['!cols'] = [
        { wch: 10 }, { wch: 18 }, { wch: 27 }, { wch: 27 }, { wch: 42 }, { wch: 14 }, { wch: 17 }
    ];
    sheet['!rows'] = [
        { hpt: 27 }, { hpt: 22 }, { hpt: 20 }, { hpt: 8 }, { hpt: 24 },
        ...Array.from({ length: Math.max(0, rowIndex - 5) }, (_, index) => ({ hpt: index % 2 === 0 ? 29 : 29 }))
    ];
    sheet['!freeze'] = { xSplit: 0, ySplit: 5 };
    sheet['!autofilter'] = { ref: `A5:G${Math.max(5, rowIndex)}` };
    sheet['!pageSetup'] = { orientation: 'landscape', paperSize: '9', fitToWidth: 1, fitToHeight: 0, scale: 90 };
    sheet['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet['!printArea'] = `A1:G${Math.max(5, rowIndex)}`;
    sheet['!ref'] = `A1:G${Math.max(5, rowIndex)}`;

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, 'Fixture');
    return workbook;
};

export const downloadFixtureSpreadsheet = (tournament, rows) => {
    try {
        const workbook = buildFixtureWorkbook(tournament, rows);
        globalThis.XLSX.writeFile(workbook, sanitizeFileName(tournament?.nombre));
    } catch (error) {
        console.error('No se pudo generar la hoja de cálculo del fixture.', error);
        alert('No se pudo generar la hoja de cálculo. Intentá nuevamente.');
    }
};
