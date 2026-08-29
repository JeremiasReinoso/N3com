import { DataManager } from '../data/dataManager.js';
import { PosicionesService } from './standings.js';

const winnerOf = match => match.ganadorId;
const playoffMinutesFromTime = time => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
};
const playoffTimeFromMinutes = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const slotsForDay = day => {
    const slots = [];
    for (let minute = playoffMinutesFromTime(day.inicio); minute + 60 <= playoffMinutesFromTime(day.fin); minute += 60) slots.push(playoffTimeFromMinutes(minute));
    return slots;
};
const canUseSlot = (match, hora, cancha, scheduled) => !scheduled.some(existing => {
    if (existing.hora !== hora) return false;
    if (existing.cancha === cancha) return true;
    return [existing.equipoLocalId, existing.equipoVisitanteId].includes(match.equipoLocalId)
        || [existing.equipoLocalId, existing.equipoVisitanteId].includes(match.equipoVisitanteId);
});
const findSlot = (match, slots, courts, scheduled, minimumMinute = 0) => {
    for (const hora of slots) {
        if (playoffMinutesFromTime(hora) < minimumMinute) continue;
        for (const cancha of courts) {
            if (canUseSlot(match, hora, cancha, scheduled)) return { hora, cancha };
        }
    }
    return null;
};

export const PlayoffsService = {
    generarSemifinales(torneoId, categoriaId) {
        const standings = PosicionesService.calcularPosiciones(torneoId, categoriaId);
        if (standings.length < 4) throw new Error('Se necesitan al menos cuatro equipos en la clasificación general.');
        const existing = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(match => match.tipo === 'semifinal');
        if (existing.length) throw new Error('Las semifinales ya fueron generadas para esta categoría.');
        const day = DataManager.getDaySchedules(torneoId).at(-1);
        if (!day) throw new Error('Defina el período del torneo antes de generar eliminatorias.');
        const courts = Array.from({ length: DataManager.getTournamentCourtCount(torneoId) }, (_, index) => `Cancha ${index + 1}`);
        const slots = slotsForDay(day);
        const scheduled = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => match.fecha === day.fecha && match.hora && match.cancha);
        const [first, second, third, fourth] = standings;
        const semiOne = { equipoLocalId: first.id, equipoVisitanteId: fourth.id };
        const semiOneSlot = findSlot(semiOne, slots, courts, scheduled);
        if (!semiOneSlot) throw new Error('El último día no tiene una franja libre para la primera semifinal.');
        scheduled.push({ ...semiOne, ...semiOneSlot });
        const semiTwo = { equipoLocalId: second.id, equipoVisitanteId: third.id };
        const semiTwoSlot = findSlot(semiTwo, slots, courts, scheduled);
        if (!semiTwoSlot) throw new Error('El último día no tiene una franja libre para la segunda semifinal.');
        DataManager.addMatches([
            {
                torneoId, categoriaId, zonaId: null, tipo: 'semifinal', nombreEtapa: 'Semifinal 1',
                equipoLocalId: first.id, equipoVisitanteId: fourth.id,
                fecha: day.fecha, hora: semiOneSlot.hora, cancha: semiOneSlot.cancha, estado: 'pendiente', confirmado: true, setsLocal: null, setsVisitante: null
            },
            {
                torneoId, categoriaId, zonaId: null, tipo: 'semifinal', nombreEtapa: 'Semifinal 2',
                equipoLocalId: second.id, equipoVisitanteId: third.id,
                fecha: day.fecha, hora: semiTwoSlot.hora, cancha: semiTwoSlot.cancha, estado: 'pendiente', confirmado: true, setsLocal: null, setsVisitante: null
            }
        ]);
        return { first, second, third, fourth, date: day.fecha };
    },

    generarFinal(torneoId, categoriaId) {
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId);
        if (matches.some(match => match.tipo === 'final')) throw new Error('La final ya fue generada para esta categoría.');
        const semifinals = matches.filter(match => match.tipo === 'semifinal');
        if (semifinals.length !== 2 || semifinals.some(match => match.estado !== 'finalizado' || !winnerOf(match))) throw new Error('Registre los resultados de las dos semifinales antes de generar la final.');
        const day = DataManager.getDaySchedules(torneoId).at(-1);
        if (!day) throw new Error('Defina el período del torneo antes de generar eliminatorias.');
        const finalMatch = { equipoLocalId: winnerOf(semifinals[0]), equipoVisitanteId: winnerOf(semifinals[1]) };
        const courts = Array.from({ length: DataManager.getTournamentCourtCount(torneoId) }, (_, index) => `Cancha ${index + 1}`);
        const scheduled = matches.filter(match => match.fecha === day.fecha && match.hora && match.cancha);
        const afterSemifinals = Math.max(...semifinals.map(match => playoffMinutesFromTime(match.hora))) + 60;
        const finalSlot = findSlot(finalMatch, slotsForDay(day), courts, scheduled, afterSemifinals);
        if (!finalSlot) throw new Error('El último día no tiene una franja libre para la final.');
        DataManager.addMatches([{
            torneoId, categoriaId, zonaId: null, tipo: 'final', nombreEtapa: 'Final',
            ...finalMatch,
            fecha: day.fecha, hora: finalSlot.hora, cancha: finalSlot.cancha, estado: 'pendiente', confirmado: true, setsLocal: null, setsVisitante: null
        }]);
    }
};
