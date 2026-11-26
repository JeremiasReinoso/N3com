import { fixtureCompare } from './logistics.js';

const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// Codificación compatible con WinAnsiEncoding (ISO-8859-1 + signos tipográficos usuales)
// para conservar tildes, eñes, "Nº", "°" y "·" en PDF-1.4 sin dependencias externas.
const WIN_ANSI_EXTRAS = new Map([
    ['\u2013', '\x96'], // –
    ['\u2014', '\x97'], // —
    ['\u2018', '\x91'], // ‘
    ['\u2019', '\x92'], // ’
    ['\u201C', '\x93'], // “
    ['\u201D', '\x94'], // ”
    ['\u2022', '\x95'], // •
    ['\u2026', '...']
]);

const toWinAnsi = value => {
    const str = String(value ?? '').normalize('NFC');
    let out = '';
    for (const ch of str) {
        if (WIN_ANSI_EXTRAS.has(ch)) {
            out += WIN_ANSI_EXTRAS.get(ch);
            continue;
        }
        const code = ch.codePointAt(0);
        if (code >= 0x20 && code <= 0x7E) {
            out += ch;
        } else if (code >= 0xA0 && code <= 0xFF) {
            out += ch;
        } else {
            const stripped = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
            for (const sub of stripped) {
                const sc = sub.codePointAt(0);
                out += (sc >= 0x20 && sc <= 0xFF) ? sub : ' ';
            }
        }
    }
    return out;
};

const asciiSlug = value => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'torneo';

const pdfEscape = value => toWinAnsi(value).replace(/([\\()])/g, '\\$1');
const fmtNum = n => Number(n).toFixed(2).replace(/\.00$/, '');

const formatJornadaDate = isoDate => {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
    const [year, month, day] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (Number.isNaN(dt.getTime())) return isoDate;
    const weekday = WEEKDAYS_ES[dt.getUTCDay()];
    const monthName = MONTHS_ES[month - 1];
    return `${weekday} ${String(day).padStart(2, '0')} de ${monthName} de ${year}`;
};

const statusLabel = status => ({
    borrador: 'Sin programar',
    pendiente: 'Confirmado',
    programado: 'Programado',
    confirmado: 'Confirmado',
    en_juego: 'En juego',
    finalizado: 'Finalizado'
}[status] || status || 'Sin programar');

const DEFAULT_PHASE_LABELS = {
    ZONAS: 'Fase de zonas',
    LIGA: 'Todos contra todos / Liga',
    TODOS_CONTRA_TODOS: 'Todos contra todos / Liga',
    ZONA_FINAL: 'Zona Final',
    TOP_32: 'Top 32',
    TOP_16: 'Top 16',
    TOP_8: 'Top 8 / Cuartos',
    TOP_4: 'Top 4',
    SEMIFINAL: 'Semifinales · Top 4',
    THIRD_PLACE: 'Tercer puesto',
    FINAL: 'Final'
};

const parseCategoryFields = item => {
    const rawName = String(item?.nombre || item?.categoryName || 'Sin categoría').trim();
    const explicitAge = String(item?.edad || item?.categoryAge || '').trim();
    const explicitModality = String(item?.modalidad || item?.modality || '').trim();
    if (explicitAge && explicitModality) {
        return { age: explicitAge, modality: explicitModality, name: rawName };
    }
    const ageMatch = rawName.match(/^\+\s*\d+/);
    const modalityMatch = rawName.match(/\b(femenino|masculino|mixto|libre|recreativo)\b/i);
    if (ageMatch) {
        const age = explicitAge || ageMatch[0].replace(/\s+/g, '');
        const rest = rawName.slice(ageMatch[0].length).trim();
        const mod = explicitModality || rest || (modalityMatch ? modalityMatch[0] : '');
        const normalizedMod = mod ? mod.charAt(0).toUpperCase() + mod.slice(1) : '';
        return { age, modality: normalizedMod, name: rawName };
    }
    if (modalityMatch && !explicitModality) {
        const mod = modalityMatch[0];
        const normalizedMod = mod.charAt(0).toUpperCase() + mod.slice(1).toLowerCase();
        const base = rawName.replace(modalityMatch[0], '').trim() || rawName;
        return { age: explicitAge || base, modality: normalizedMod, name: rawName };
    }
    return { age: explicitAge || rawName, modality: explicitModality || '', name: rawName };
};

// Métrica AFM real (en milésimas de em) para Helvetica y Helvetica-Bold.
const HELVETICA_REGULAR_WIDTHS = {
    ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
    '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
    '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
    ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
    N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
    n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
    '¡': 333, 'ª': 370, '°': 400, '·': 278, 'º': 365, '¿': 611,
    Á: 667, É: 667, Í: 278, Ñ: 722, Ó: 778, Ú: 722, Ü: 722,
    á: 556, é: 556, í: 278, ñ: 556, ó: 556, ú: 556, ü: 556
};

const HELVETICA_BOLD_WIDTHS = {
    ' ': 278, '!': 333, '"': 474, '#': 556, '$': 556, '%': 889, '&': 722, "'": 238,
    '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
    '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
    ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611, '@': 975,
    A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
    N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    '[': 333, '\\': 278, ']': 333, '^': 584, '_': 556, '`': 333,
    a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889,
    n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
    '¡': 333, 'ª': 370, '°': 400, '·': 278, 'º': 365, '¿': 611,
    Á: 722, É: 667, Í: 278, Ñ: 722, Ó: 778, Ú: 722, Ü: 722,
    á: 556, é: 556, í: 278, ñ: 611, ó: 611, ú: 611, ü: 611
};

const charUnitWidth = (ch, bold) => {
    const table = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_REGULAR_WIDTHS;
    return table[ch] ?? (bold ? 584 : 556);
};

const measureTextWidth = (text, fontSize, bold = false) => {
    const clean = toWinAnsi(text);
    let units = 0;
    for (const ch of clean) units += charUnitWidth(ch, bold);
    return (units / 1000) * fontSize;
};

// Divide texto en renglones completos respetando palabras, sin truncar jamás con "...".
const wrapText = (text, maxWidth, fontSize, bold = false) => {
    const raw = String(text ?? '').replace(/\r\n/g, '\n').trim();
    if (!raw) return [''];
    if (measureTextWidth(raw, fontSize, bold) <= maxWidth) return [raw];

    const tokens = raw.split(/(\s+)/).filter(tok => tok.length > 0);
    const lines = [];
    let current = '';

    const pushCurrent = () => {
        const trimmed = current.replace(/\s+$/g, '').replace(/^\s+/g, '');
        if (trimmed) lines.push(trimmed);
        current = '';
    };

    for (const token of tokens) {
        if (/^\s+$/.test(token)) {
            if (current) current += token;
            continue;
        }
        const candidate = current + token;
        if (!current || measureTextWidth(candidate, fontSize, bold) <= maxWidth) {
            current = candidate;
            continue;
        }
        pushCurrent();
        if (measureTextWidth(token, fontSize, bold) <= maxWidth) {
            current = token;
        } else {
            let chunk = '';
            for (const ch of token) {
                if (chunk && measureTextWidth(chunk + ch, fontSize, bold) > maxWidth) {
                    lines.push(chunk);
                    chunk = ch;
                } else {
                    chunk += ch;
                }
            }
            current = chunk;
        }
    }
    pushCurrent();
    return lines.length ? lines : [''];
};

const drawText = (x, y, size, value, bold = false) =>
    `BT /${bold ? 'F2' : 'F1'} ${fmtNum(size)} Tf ${fmtNum(x)} ${fmtNum(y)} Td (${pdfEscape(value)}) Tj ET`;

// Colores exactos de la especificación del PDF de referencia:
//   #1F3A5F -> 0.121569 0.227451 0.372549
//   #666666 -> 0.400000 0.400000 0.400000
//   #EEF2F7 -> 0.933333 0.949020 0.968627
//   #B8C4D6 -> 0.721569 0.768627 0.839216
const COLOR_NAVY = '0.121569 0.227451 0.372549';
const COLOR_GRAY = '0.4 0.4 0.4';
const COLOR_ZEBRA = '0.933333 0.94902 0.968627';
const COLOR_GRID = '0.721569 0.768627 0.839216';
const COLOR_BLACK = '0 0 0';

// Anchos base idénticos al PDF de referencia ([36, 80, 80, 210, 380] = 786 pt)
// con adaptación automática si una categoría, modalidad o partido necesita más espacio.
const computeColumnWidths = (rows, totalWidth, fontSize) => {
    const padCenter = 12;
    const padLeft = 12;
    const wNum = rows.length >= 100 ? 40 : 36;

    let maxCat = measureTextWidth('Categoría', 10, true) + padCenter;
    let maxMod = measureTextWidth('Modalidad', 10, true) + padCenter;
    let maxStage = measureTextWidth('Etapa / Zona', 10, true) + padLeft;
    let maxMatch = measureTextWidth('Partido', 10, true) + padLeft;

    rows.forEach(r => {
        maxCat = Math.max(maxCat, measureTextWidth(r.catDisplay, fontSize, true) + padCenter);
        maxMod = Math.max(maxMod, measureTextWidth(r.modDisplay, fontSize, false) + padCenter);
        maxStage = Math.max(maxStage, measureTextWidth(r.stageDisplay, fontSize, false) + padLeft);
        maxMatch = Math.max(maxMatch, measureTextWidth(r.matchDisplay, fontSize, false) + padLeft);
    });

    const wCat = Math.min(120, Math.max(80, Math.ceil(maxCat)));
    const wMod = Math.min(116, Math.max(80, Math.ceil(maxMod)));
    const remaining = totalWidth - wNum - wCat - wMod;

    // Base de referencia: Etapa/Zona = 210 pt, Partido = 380 pt (cuando remaining = 590 pt)
    let wStage = Math.min(250, Math.max(210, Math.ceil(maxStage)));
    if (maxMatch > remaining - wStage) {
        const minStageNeeded = Math.max(145, Math.min(210, Math.ceil(maxStage)));
        wStage = Math.max(minStageNeeded, remaining - Math.ceil(maxMatch));
    }
    const wMatch = remaining - wStage;

    return [wNum, wCat, wMod, wStage, wMatch];
};

const prepareCourtRowCells = row => {
    const parsed = parseCategoryFields({
        nombre: row.categoryName,
        edad: row.categoryAge,
        modalidad: row.modality
    });
    const catDisplay = parsed.age || row.categoryName || '—';
    const modDisplay = parsed.modality || '—';
    const basePhase = row.phaseLabel || DEFAULT_PHASE_LABELS[row.phase] || 'Fase de zonas';
    let stageDisplay = basePhase;
    if (row.zoneName) {
        if (row.zoneName === basePhase || (row.phase === 'ZONA_FINAL' && String(row.zoneName).toLowerCase().includes('zona'))) {
            stageDisplay = row.zoneName;
        } else {
            stageDisplay = `${basePhase} · ${row.zoneName}`;
        }
    }
    const matchDisplay = `${row.teamA || 'Por definir'}  vs  ${row.teamB || 'Por definir'}`;
    return {
        ...row,
        catDisplay,
        modDisplay,
        stageDisplay,
        matchDisplay
    };
};

const buildSubtitleText = (tournament, pageDate, rows) => {
    const name = String(tournament?.nombre || 'Torneo').trim();
    const club = String(
        tournament?.organizacion
        || tournament?.branding?.brandName
        || tournament?.club
        || tournament?.sede
        || ''
    ).trim();

    let dateLabel = '';
    if (pageDate) {
        dateLabel = formatJornadaDate(pageDate);
    } else {
        const distinctDates = [...new Set(rows.map(r => r.fecha).filter(Boolean))].sort();
        if (distinctDates.length === 1) {
            dateLabel = formatJornadaDate(distinctDates[0]);
        } else if (distinctDates.length > 1) {
            dateLabel = `${formatJornadaDate(distinctDates[0])} al ${formatJornadaDate(distinctDates.at(-1))}`;
        } else if (tournament?.startDate) {
            dateLabel = tournament.endDate && tournament.endDate !== tournament.startDate
                ? `${formatJornadaDate(tournament.startDate)} al ${formatJornadaDate(tournament.endDate)}`
                : formatJornadaDate(tournament.startDate);
        }
    }

    return [name, club, dateLabel].filter(Boolean).join(' · ');
};

const makeCourtPage = ({ tournament, courtName, date, rows, pageNumber, totalPages }) => {
    // A4 Horizontal exacto (297 mm x 210 mm = 841.89 x 595.28 pt), márgenes laterales ~1 cm (27.94 pt)
    const pageW = 841.89;
    const tableWidth = 786;
    const tableLeft = (pageW - tableWidth) / 2; // 27.945 pt
    const tableRight = tableLeft + tableWidth;  // 813.945 pt

    const titleX = 34;
    const titleY = 541.28;
    const subtitleY = 527.28;
    const tableTop = 514.28;
    const tableBottom = 61;
    const totalTableHeight = tableTop - tableBottom; // 453.28 pt
    const footerY = 16;
    const cellPadLeft = 6;

    const prepared = rows.map(prepareCourtRowCells);
    const count = Math.max(1, prepared.length);

    // Con 16+ partidos de 1 línea, la altura del encabezado es exactamente igual a la fila (como en el PDF de referencia).
    // Si una cancha tiene pocos partidos (<16), se limita el encabezado a 25 pt para que las filas absorban la altura útil.
    const headerHeight = Math.max(15.5, Math.min(25, totalTableHeight / (count + 1)));
    const bodyTop = tableTop - headerHeight;
    const availableBodyHeight = bodyTop - tableBottom;

    // Tamaño de texto en filas: 9.5 pt estándar (rango 9-10 pt; escala suavemente solo si hay gran densidad o saltos de línea)
    let fontSize = count <= 14 ? 10 : (count <= 25 ? 9.5 : 9);
    let colWidths = computeColumnWidths(prepared, tableWidth, fontSize);
    let wrappedRows = [];
    let weights = [];

    for (let attempt = 0; attempt < 9; attempt += 1) {
        colWidths = computeColumnWidths(prepared, tableWidth, fontSize);
        wrappedRows = prepared.map((r, idx) => {
            const c0 = [String(idx + 1)];
            const c1 = wrapText(r.catDisplay, colWidths[1] - 8, fontSize, true);
            const c2 = wrapText(r.modDisplay, colWidths[2] - 8, fontSize, false);
            const c3 = wrapText(r.stageDisplay, colWidths[3] - cellPadLeft * 2, fontSize, false);
            const c4 = wrapText(r.matchDisplay, colWidths[4] - cellPadLeft * 2, fontSize, false);
            const maxLines = Math.max(c0.length, c1.length, c2.length, c3.length, c4.length);
            return { cells: [c0, c1, c2, c3, c4], maxLines };
        });
        weights = wrappedRows.length
            ? wrappedRows.map(item => 1 + (item.maxLines - 1) * 0.72)
            : [1];
        const totalWeight = weights.reduce((acc, w) => acc + w, 0);
        const unitHeight = availableBodyHeight / totalWeight;
        const fitsAll = wrappedRows.every((item, idx) => {
            const rowH = unitHeight * weights[idx];
            const needed = item.maxLines * (fontSize * 1.15) + 2.8;
            return needed <= rowH;
        });
        if (fitsAll || fontSize <= 6.0) break;
        fontSize = Math.max(6.0, Number((fontSize - 0.5).toFixed(2)));
    }

    const colX = [tableLeft];
    colWidths.forEach(w => colX.push(colX.at(-1) + w));

    const totalWeight = weights.reduce((acc, w) => acc + w, 0);
    const rowHeights = weights.map(w => (availableBodyHeight * w) / totalWeight);

    const commands = [];

    // 1. Título "Cancha N" (20 pt, negrita, #1F3A5F) y subtítulo dinámico (10 pt, #666666)
    const headingTitle = courtName || 'Cancha 1';
    const subtitleText = buildSubtitleText(tournament, date, prepared);
    commands.push(`${COLOR_NAVY} rg`, drawText(titleX, titleY, 20, headingTitle, true));
    commands.push(`${COLOR_GRAY} rg`, drawText(titleX, subtitleY, 10, subtitleText, false));

    // 2. Fondo del encabezado (#1F3A5F)
    commands.push(`${COLOR_NAVY} rg`, `${fmtNum(tableLeft)} ${fmtNum(bodyTop)} ${fmtNum(tableWidth)} ${fmtNum(headerHeight)} re f`);

    // 3. Fondos de filas alternadas: blanco y #EEF2F7
    let cursorY = bodyTop;
    rowHeights.forEach((rowH, idx) => {
        const yBottom = cursorY - rowH;
        const fill = idx % 2 === 1 ? COLOR_ZEBRA : '1 1 1';
        commands.push(`${fill} rg`, `${fmtNum(tableLeft)} ${fmtNum(yBottom)} ${fmtNum(tableWidth)} ${fmtNum(rowH)} re f`);
        cursorY = yBottom;
    });

    // 4. Texto del encabezado (10 pt blanco en negrita, centrado verticalmente)
    const headerFontSize = Math.min(10, Math.max(8.5, headerHeight * 0.55));
    const headerBaselineY = bodyTop + (headerHeight - headerFontSize * 0.8) / 2;
    const headers = [
        { label: 'Nº', align: 'center' },
        { label: 'Categoría', align: 'center' },
        { label: 'Modalidad', align: 'center' },
        { label: 'Etapa / Zona', align: 'left' },
        { label: 'Partido', align: 'left' }
    ];
    commands.push('1 1 1 rg');
    headers.forEach((h, cIdx) => {
        const w = colWidths[cIdx];
        const x = h.align === 'center'
            ? colX[cIdx] + (w - measureTextWidth(h.label, headerFontSize, true)) / 2
            : colX[cIdx] + cellPadLeft;
        commands.push(drawText(x, headerBaselineY, headerFontSize, h.label, true));
    });

    // 5. Texto de las filas (centrado vertical exacto en cada celda)
    const drawCellLines = (lines, cIdx, yTop, rowH, { align = 'left', bold = false, color = COLOR_BLACK } = {}) => {
        const visualCap = fontSize * 0.8;
        const lineStep = fontSize * 1.15;
        const yBottom = yTop - rowH;
        const totalTextHeight = visualCap + (lines.length - 1) * lineStep;
        const firstBaseline = yBottom + (rowH + totalTextHeight) / 2 - visualCap;

        commands.push(`${color} rg`);
        lines.forEach((txt, lineIdx) => {
            const y = firstBaseline - lineIdx * lineStep;
            const x = align === 'center'
                ? colX[cIdx] + (colWidths[cIdx] - measureTextWidth(txt, fontSize, bold)) / 2
                : colX[cIdx] + cellPadLeft;
            commands.push(drawText(x, y, fontSize, txt, bold));
        });
    };

    if (!wrappedRows.length) {
        const emptyText = 'Sin partidos programados para esta cancha';
        const midY = tableBottom + (availableBodyHeight - 10 * 0.8) / 2;
        const emptyX = tableLeft + (tableWidth - measureTextWidth(emptyText, 10, false)) / 2;
        commands.push(`${COLOR_GRAY} rg`, drawText(emptyX, midY, 10, emptyText, false));
    } else {
        let rowTop = bodyTop;
        wrappedRows.forEach((item, idx) => {
            const rowH = rowHeights[idx];
            drawCellLines(item.cells[0], 0, rowTop, rowH, { align: 'center', bold: false, color: COLOR_BLACK });
            drawCellLines(item.cells[1], 1, rowTop, rowH, { align: 'center', bold: true, color: COLOR_BLACK });
            drawCellLines(item.cells[2], 2, rowTop, rowH, { align: 'center', bold: false, color: COLOR_BLACK });
            drawCellLines(item.cells[3], 3, rowTop, rowH, { align: 'left', bold: false, color: COLOR_GRAY });
            drawCellLines(item.cells[4], 4, rowTop, rowH, { align: 'left', bold: false, color: COLOR_BLACK });
            rowTop -= rowH;
        });
    }

    // 6. Bordes dibujados sobre los fondos para máxima nitidez:
    //    - Líneas internas #B8C4D6 de 0.3 pt
    //    - Contorno exterior #1F3A5F de 0.8 pt
    commands.push('q', '1 J', '1 j', `${COLOR_GRID} RG`, '0.3 w');
    let lineY = bodyTop;
    commands.push(`${fmtNum(tableLeft)} ${fmtNum(lineY)} m ${fmtNum(tableRight)} ${fmtNum(lineY)} l S`);
    for (let i = 0; i < rowHeights.length - 1; i += 1) {
        lineY -= rowHeights[i];
        commands.push(`${fmtNum(tableLeft)} ${fmtNum(lineY)} m ${fmtNum(tableRight)} ${fmtNum(lineY)} l S`);
    }
    for (let c = 1; c < colX.length - 1; c += 1) {
        commands.push(`${fmtNum(colX[c])} ${fmtNum(tableBottom)} m ${fmtNum(colX[c])} ${fmtNum(tableTop)} l S`);
    }
    commands.push(`${COLOR_NAVY} RG`, '0.8 w');
    commands.push(`${fmtNum(tableLeft)} ${fmtNum(tableBottom)} ${fmtNum(tableWidth)} ${fmtNum(totalTableHeight)} re S`, 'Q');

    // 7. Pie de página abajo a la derecha (gris #666666, 8 pt): "Página X de Y"
    const footerText = `Página ${pageNumber} de ${totalPages}`;
    const footerX = tableRight - measureTextWidth(footerText, 8, false);
    commands.push(`${COLOR_GRAY} rg`, drawText(footerX, footerY, 8, footerText, false));

    return commands.join('\n');
};

export const fixtureRows = ({ matches, categories, teams, zones, phaseLabels, filters = {} }) => {
    const category = id => categories.find(item => item.id === id);
    const team = id => teams.find(item => item.id === id)?.nombre || 'Equipo no disponible';
    const zone = id => zones.find(item => item.id === id)?.nombre || '';
    const sorted = matches.filter(match => {
        const cat = category(match.categoriaId);
        const parsedCat = parseCategoryFields(cat);
        return (!filters.date || match.fecha === filters.date)
            && (!filters.categoryId || match.categoriaId === filters.categoryId)
            && (!filters.modality || parsedCat.modality === filters.modality)
            && (!filters.phase || (match.phase || 'ZONAS') === filters.phase)
            && (!filters.zoneId || match.zonaId === filters.zoneId)
            && (!filters.status || match.estado === filters.status)
            && (!filters.courtId || match.courtId === filters.courtId || match.cancha === filters.courtName);
    }).sort(fixtureCompare);

    const firstByDateAndCourt = new Set();
    return sorted.map(match => {
        const item = category(match.categoriaId) || {};
        const parsedCat = parseCategoryFields(item);
        const dateCourtKey = `${match.fecha || ''}|${match.courtId || match.cancha || ''}`;
        const horaInicio = firstByDateAndCourt.has(dateCourtKey) ? '' : match.hora || '';
        firstByDateAndCourt.add(dateCourtKey);
        const resolvedZoneName = zone(match.zonaId) || match.subZoneName || '';
        const matchPhase = match.phase || 'ZONAS';
        return {
            id: match.id,
            fecha: match.fecha,
            hora: match.hora,
            horaInicio,
            cancha: match.cancha,
            orden: match.orden,
            categoryId: match.categoriaId,
            categoryName: item.nombre || 'Sin categoría',
            categoryAge: parsedCat.age,
            modality: parsedCat.modality,
            phase: matchPhase,
            phaseLabel: match.interzonal
                ? (match.nombreEtapa || 'Interzonal')
                : (phaseLabels?.[matchPhase] || DEFAULT_PHASE_LABELS[matchPhase] || matchPhase || 'Fase de zonas'),
            zoneName: resolvedZoneName,
            teamA: team(match.equipoLocalId),
            teamB: team(match.equipoVisitanteId),
            status: statusLabel(match.estado),
            sets: Array.isArray(match.sets) ? match.sets : [],
            score: match.score || ''
        };
    });
};

export const buildFixturePdf = (tournament, rows, _subtitle = '', _options = {}) => {
    // Se conserva intacto el orden de partidos provisto por el sistema (fixtureCompare),
    // manteniendo las categorías mezcladas dentro de cada cancha y generando una página
    // completa por cancha (por jornada cuando hay múltiples fechas en el conjunto exportado).
    const sortedRows = [...(rows || [])].sort(fixtureCompare);
    const courts = [...new Set(sortedRows.map(row => row.cancha || 'Cancha 1'))]
        .sort((left, right) => left.localeCompare(right, 'es', { numeric: true }));

    const pages = [];
    courts.forEach(courtName => {
        const courtRows = sortedRows.filter(row => (row.cancha || 'Cancha 1') === courtName);
        const distinctDates = [...new Set(courtRows.map(row => row.fecha || ''))].sort((left, right) => left.localeCompare(right));
        if (distinctDates.length <= 1) {
            pages.push({ courtName, date: distinctDates[0] || '', rows: courtRows });
        } else {
            distinctDates.forEach(date => {
                const dateRows = courtRows.filter(row => (row.fecha || '') === date);
                if (dateRows.length) pages.push({ courtName, date, rows: dateRows });
            });
        }
    });
    if (!pages.length) pages.push({ courtName: 'Cancha 1', date: '', rows: [] });

    const objects = [];
    const add = value => { objects.push(value); return objects.length; };
    const catalogId = add('');
    const pagesId = add('');
    const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const boldId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds = [];

    pages.forEach((page, index) => {
        const stream = makeCourtPage({
            tournament,
            courtName: page.courtName,
            date: page.date,
            rows: page.rows,
            pageNumber: index + 1,
            totalPages: pages.length
        });
        const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`));
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

export const downloadFixturePdf = (tournament, rows, suffix = 'completo', subtitle = '', options = {}) => {
    const bytes = buildFixturePdf(tournament, rows, subtitle, options);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixture-${asciiSlug(tournament?.nombre)}-${suffix}.pdf`;
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
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixture-${asciiSlug(tournament?.nombre)}-${suffix}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

const xlsxRows = (rows, includeCourt = true, options = {}) => {
    const onlyStartTime = Boolean(options?.onlyStartTime);
    const header = ['Fecha', onlyStartTime ? 'Hora inicio' : 'Hora', ...(includeCourt ? ['Cancha'] : []), 'Categoría', 'Zona', 'Etapa', 'Partido', 'Equipo 1', 'Equipo 2', 'Estado', 'Resultado'];
    const sorted = [...rows].sort(fixtureCompare);
    const seenStart = new Set();
    const body = sorted.map((row, index) => {
        const startKey = `${row.fecha || ''}|${row.cancha || ''}`;
        const firstForCourtDay = !seenStart.has(startKey);
        seenStart.add(startKey);
        const horaCell = onlyStartTime ? (firstForCourtDay ? (row.hora || row.horaInicio || '') : '') : (row.hora || row.horaInicio || '');
        const values = [
            row.fecha,
            horaCell,
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

export const buildFixtureXlsx = ({ tournament, rows, courts, options = {} }) => {
    const safeSheetName = (name, used) => {
        const base = String(name || 'Cancha').replace(/[\\/:?*\[\]]/g, ' ').slice(0, 31) || 'Cancha';
        let candidate = base; let suffix = 2;
        while (used.has(candidate)) candidate = `${base.slice(0, 27)} (${suffix++})`;
        used.add(candidate); return candidate;
    };
    const usedNames = new Set(['Fixture completo']);
    const sheetNames = ['Fixture completo', ...(courts || []).map(court => safeSheetName(court.name, usedNames))];
    const sheets = [xlsxRows(rows, true, options), ...(courts || []).map(court => xlsxRows(rows.filter(row => row.cancha === court.name), false, options))];
    const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
    const workbookSheets = sheetNames.map((name, index) => `<sheet name="${xlsxXmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    const contentTypes = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>', '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>', '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>', ...sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)].join('');
    const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E7490"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf applyFont="1" applyFill="1" fontId="1" fillId="2"/><xf/><xf fillId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    const core = `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${xlsxXmlEscape(tournament?.nombre || 'Fixture')}</dc:title></cp:coreProperties>`;
    return xlsxZip([
        { name: '[Content_Types].xml', content: `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes}</Types>` },
        { name: '_rels/.rels', content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
        { name: 'docProps/core.xml', content: core },
        { name: 'xl/workbook.xml', content: `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets></workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', content: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
        { name: 'xl/styles.xml', content: styles },
        ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheet }))
    ]);
};

export const downloadFixtureSpreadsheet = (tournament, rows, courts, options = {}) => {
    const xlsx = buildFixtureXlsx({ tournament, rows, courts, options });
    const safeName = asciiSlug(tournament?.nombre);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    link.download = `fixture-${safeName}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
