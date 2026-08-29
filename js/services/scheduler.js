import { DataManager } from '../data/dataManager.js';

const pairKey = (teamAId, teamBId) => {
    if (!teamAId || !teamBId || teamAId === teamBId) throw new Error('Un equipo no puede jugar contra sí mismo.');
    return [String(teamAId), String(teamBId)].sort().join(':');
};
const isOfficialMatch = match => match.confirmado || ['pendiente', 'programado', 'finalizado'].includes(match.estado);
const isGroupMatch = match => !match.tipo || match.tipo === 'fase_zonas';
const schedulerMinutesFromTime = time => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
};
const schedulerTimeFromMinutes = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Método circular de todos contra todos. Cada ronda deja a cada equipo con un
// único partido, salvo el descanso inevitable de las zonas impares.
const buildRoundRobin = teams => {
    const rotation = teams.slice().sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const hasBye = rotation.length % 2 !== 0;
    if (hasBye) rotation.push(null);
    const rounds = [];
    const slotCount = rotation.length;

    for (let roundIndex = 0; roundIndex < slotCount - 1; roundIndex += 1) {
        const matches = [];
        for (let slot = 0; slot < slotCount / 2; slot += 1) {
            const first = rotation[slot];
            const second = rotation[slotCount - 1 - slot];
            if (!first || !second) continue;
            const [local, visitante] = roundIndex % 2 === 0 ? [first, second] : [second, first];
            matches.push({ local, visitante, key: pairKey(local.id, visitante.id) });
        }
        rounds.push(matches);
        rotation.splice(1, 0, rotation.pop());
    }
    return { rounds, hasBye };
};

export const SchedulerService = {
    // Genera el fixture completo de una vez. Cada par usa una clave
    // normalizada, por lo que A-B y B-A son el mismo enfrentamiento.
    generarEmparejamientos(torneoId, categoriaId) {
        const tournament = DataManager.getTournament(torneoId);
        if (!tournament) throw new Error('Seleccione un torneo válido.');
        const assured = Number(tournament.partidos_asegurados);
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const zones = DataManager.getZonesByTournamentAndCategory(torneoId, categoriaId);
        if (!teams.length) throw new Error('La categoría seleccionada no tiene equipos.');
        if (teams.some(team => !team.zonaId)) throw new Error('Asigne una zona a todos los equipos antes de emparejar.');

        const existingFixture = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(isGroupMatch);
        const fixturePairs = new Set();
        existingFixture.forEach(match => {
            const key = pairKey(match.equipoLocalId, match.equipoVisitanteId);
            if (fixturePairs.has(key)) throw new Error('El fixture existente contiene un enfrentamiento duplicado. Elimínelo antes de regenerar.');
            fixturePairs.add(key);
        });

        const pending = [];
        for (const zone of zones) {
            const zoneTeams = teams.filter(team => team.zonaId === zone.id);
            if (!zoneTeams.length) continue;
            if (zoneTeams.length < 2) throw new Error(`${zone.nombre} necesita al menos dos equipos.`);
            if (assured > zoneTeams.length - 1) throw new Error(`${zone.nombre} permite como máximo ${zoneTeams.length - 1} partidos por equipo sin repetir rivales.`);

            const existing = existingFixture.filter(match => match.zonaId === zone.id);
            const counts = new Map(zoneTeams.map(team => [team.id, 0]));
            const pairsSeen = new Set();
            existing.forEach(match => {
                const key = pairKey(match.equipoLocalId, match.equipoVisitanteId);
                if (pairsSeen.has(key)) throw new Error(`${zone.nombre} contiene un enfrentamiento duplicado.`);
                pairsSeen.add(key);
                counts.set(match.equipoLocalId, (counts.get(match.equipoLocalId) || 0) + 1);
                counts.set(match.equipoVisitanteId, (counts.get(match.equipoVisitanteId) || 0) + 1);
            });

            if ([...counts.values()].every(count => count >= assured)) continue;

            const { rounds, hasBye } = buildRoundRobin(zoneTeams);
            // Con cantidad impar hay un descanso por ronda. La ronda extra
            // permite cumplir los partidos asegurados sin duplicar cruces.
            const roundLimit = existing.length
                ? rounds.length
                : Math.min(rounds.length, assured + (hasBye && assured < rounds.length ? 1 : 0));

            rounds.slice(0, roundLimit).forEach((round, roundIndex) => {
                round.forEach(({ local, visitante, key }) => {
                    if (pairsSeen.has(key)) return;
                    // Si ya hay borradores/manuales válidos, sólo completamos
                    // los equipos que aún adeudan partidos.
                    if (existing.length && counts.get(local.id) >= assured && counts.get(visitante.id) >= assured) return;
                    pending.push({ torneoId, categoriaId, zonaId: zone.id, tipo: 'fase_zonas', ronda: roundIndex + 1, equipoLocalId: local.id, equipoVisitanteId: visitante.id, fecha: null, hora: null, cancha: null, estado: 'borrador', confirmado: false, setsLocal: null, setsVisitante: null });
                    counts.set(local.id, counts.get(local.id) + 1);
                    counts.set(visitante.id, counts.get(visitante.id) + 1);
                    pairsSeen.add(key);
                });
            });
            if ([...counts.values()].some(count => count < assured)) throw new Error(`No se pudo completar ${zone.nombre} sin repetir enfrentamientos.`);
        }
        if (pending.length) DataManager.addMatches(pending);
        this.redistribuirFechas(torneoId, categoriaId);
        return pending.length;
    },

    recrearBorradores(torneoId, categoriaId) {
        const groupMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(isGroupMatch);
        if (groupMatches.some(isOfficialMatch)) throw new Error('No se puede rehacer un fixture que ya tiene partidos confirmados.');
        DataManager.removeDraftGroupMatches(torneoId, categoriaId);
        return this.generarEmparejamientos(torneoId, categoriaId);
    },

    // Distribuye el fixture de forma equitativa, conservando una ronda completa
    // en el mismo día cuando la capacidad lo permite.
    redistribuirFechas(torneoId, categoriaId) {
        const dates = DataManager.getCalendarDates(torneoId);
        if (!dates.length) return 0;
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match) && match.estado !== 'finalizado');
        if (!matches.length) return 0;
        const dailyTargets = dates.map((fecha, index) => ({
            fecha,
            target: Math.floor(matches.length / dates.length) + (index < matches.length % dates.length ? 1 : 0),
            matches: [],
            teams: new Set()
        }));
        const assignMatch = match => {
            const possibleDays = dailyTargets.filter(day => day.matches.length < day.target);
            possibleDays.sort((left, right) => {
                const leftTeamUse = Number(left.teams.has(match.equipoLocalId)) + Number(left.teams.has(match.equipoVisitanteId));
                const rightTeamUse = Number(right.teams.has(match.equipoLocalId)) + Number(right.teams.has(match.equipoVisitanteId));
                return leftTeamUse - rightTeamUse || left.matches.length - right.matches.length || left.fecha.localeCompare(right.fecha);
            });
            const day = possibleDays[0];
            day.matches.push(match);
            day.teams.add(match.equipoLocalId);
            day.teams.add(match.equipoVisitanteId);
        };
        const roundGroups = new Map();
        matches.forEach(match => {
            const key = Number.isInteger(match.ronda) ? `ronda:${match.ronda}` : `partido:${match.id}`;
            const group = roundGroups.get(key) || [];
            group.push(match);
            roundGroups.set(key, group);
        });
        [...roundGroups.values()].forEach(round => {
            const roundTeams = new Set(round.flatMap(match => [match.equipoLocalId, match.equipoVisitanteId]));
            const dayForWholeRound = dailyTargets.filter(day => (
                day.target - day.matches.length >= round.length
                && [...roundTeams].every(teamId => !day.teams.has(teamId))
            ));
            if (dayForWholeRound.length) {
                dayForWholeRound.sort((left, right) => left.matches.length - right.matches.length || left.fecha.localeCompare(right.fecha));
                const day = dayForWholeRound[0];
                round.forEach(match => {
                    day.matches.push(match);
                    day.teams.add(match.equipoLocalId);
                    day.teams.add(match.equipoVisitanteId);
                });
                return;
            }
            round.forEach(assignMatch);
        });
        const reassigned = dailyTargets.flatMap(day => day.matches.map(match => ({
            ...match,
            fecha: day.fecha,
            hora: null,
            cancha: null,
            estado: isOfficialMatch(match) ? 'pendiente' : match.estado
        })));
        DataManager.updateMatches(reassigned);
        return reassigned.length;
    },

    confirmarEmparejamientos(torneoId, categoriaId) {
        const drafts = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match) && (match.estado === 'borrador' || match.estado === 'emparejado'));
        if (!drafts.length) return 0;
        DataManager.updateMatches(drafts.map(match => ({ ...match, estado: 'pendiente', confirmado: true })));
        return drafts.length;
    },

    verificarPartidosAsegurados(torneoId, categoriaId, onlyOfficial = false) {
        const tournament = DataManager.getTournament(torneoId);
        const teams = DataManager.getTeamsByTournamentAndCategory(torneoId, categoriaId);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match) && (!onlyOfficial || isOfficialMatch(match)));
        const missing = teams.filter(team => matches.filter(match => match.equipoLocalId === team.id || match.equipoVisitanteId === team.id).length < tournament.partidos_asegurados);
        return missing.length ? { ok: false, mensaje: `Faltan partidos asegurados para: ${missing.map(team => team.nombre).join(', ')}.` } : { ok: true, mensaje: 'Todos los equipos cumplen los partidos asegurados.' };
    },

    // Programa el fixture confirmado con fecha, hora y cancha. Ejecutarlo de
    // nuevo reconstruye la distribución ante un cambio de calendario.
    programarEmparejamientos(torneoId, categoriaId) {
        const daySchedules = DataManager.getDaySchedules(torneoId);
        if (!daySchedules.length) throw new Error('Configure al menos un día en Calendario.');
        const groupMatches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId).filter(isGroupMatch);
        if (groupMatches.some(match => !isOfficialMatch(match))) throw new Error('Confirme los emparejamientos antes de programarlos.');
        const verification = this.verificarPartidosAsegurados(torneoId, categoriaId, true);
        if (!verification.ok) throw new Error(verification.mensaje);
        this.redistribuirFechas(torneoId, categoriaId);
        const toSchedule = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => isGroupMatch(match) && isOfficialMatch(match) && match.estado !== 'finalizado');
        if (!toSchedule.length) return 0;
        const courts = Array.from({ length: DataManager.getTournamentCourtCount(torneoId) }, (_, index) => `Cancha ${index + 1}`);
        const courtLoads = new Map(courts.map(court => [court, 0]));
        const scheduled = [];

        for (const day of daySchedules) {
            const remaining = toSchedule.filter(match => match.fecha === day.fecha);
            const timeSlots = [];
            for (let minute = schedulerMinutesFromTime(day.inicio); minute + 60 <= schedulerMinutesFromTime(day.fin); minute += 60) {
                timeSlots.push(schedulerTimeFromMinutes(minute));
            }
            if (remaining.length > timeSlots.length * courts.length) throw new Error(`No hay franjas suficientes el ${day.fecha}.`);
            for (const hora of timeSlots) {
                const busyTeams = new Set();
                const availableCourts = courts.slice();
                while (availableCourts.length) {
                    const matchIndex = remaining.findIndex(match => !busyTeams.has(match.equipoLocalId) && !busyTeams.has(match.equipoVisitanteId));
                    if (matchIndex === -1) break;
                    const [match] = remaining.splice(matchIndex, 1);
                    availableCourts.sort((left, right) => courtLoads.get(left) - courtLoads.get(right) || left.localeCompare(right));
                    const cancha = availableCourts.shift();
                    scheduled.push({ ...match, fecha: day.fecha, hora, cancha, estado: 'pendiente', confirmado: true });
                    courtLoads.set(cancha, courtLoads.get(cancha) + 1);
                    busyTeams.add(match.equipoLocalId);
                    busyTeams.add(match.equipoVisitanteId);
                }
            }
            if (remaining.length) throw new Error(`No se pudieron programar todos los partidos del ${day.fecha} sin superponer equipos.`);
        }
        if (scheduled.length !== toSchedule.length) throw new Error('Hay partidos con una fecha fuera del período del torneo.');
        DataManager.updateMatches(scheduled);
        return scheduled.length;
    }
};
