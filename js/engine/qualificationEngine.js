// Motor de clasificación de equipos entre fases (Zonas → Eliminatorias o Zonas → Zona Final).
// Soporta clasificación por tabla general (Top N), por zona (Top K por zona + mejores terceros/adicionales),
// y ordenamiento de seeds (ranking general o cruces cruzados entre zonas evitando cruces prematuros).

import { DataManager } from '../data/dataManager.js';
import { StandingsEngine } from './standingsEngine.js';
import { isMatchFinished } from './resultsEngine.js';

const sortStandingsRows = (rows, rules = {}) => {
    const mode = rules.mode || 'wins';
    return [...rows].sort((left, right) => {
        if (mode === 'legacy_pf') {
            return right.puntosFavor - left.puntosFavor
                || right.diferenciaPuntos - left.diferenciaPuntos
                || right.diferenciaSets - left.diferenciaSets
                || right.ganados - left.ganados
                || String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
                || String(left.id).localeCompare(String(right.id));
        }
        if (mode === 'points_table') {
            return right.puntosTabla - left.puntosTabla
                || right.ganados - left.ganados
                || right.diferenciaSets - left.diferenciaSets
                || right.diferenciaPuntos - left.diferenciaPuntos
                || right.puntosFavor - left.puntosFavor
                || String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
                || String(left.id).localeCompare(String(right.id));
        }
        return right.ganados - left.ganados
            || right.diferenciaSets - left.diferenciaSets
            || right.diferenciaPuntos - left.diferenciaPuntos
            || right.puntosFavor - left.puntosFavor
            || String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es')
            || String(left.id).localeCompare(String(right.id));
    });
};

// Ordena los clasificados cuando se eligen cruces entre zonas (ej. 1.º A vs 2.º B, 1.º B vs 2.º A).
const orderForZoneCross = (qualified, zoneTablesCount) => {
    if (zoneTablesCount === 2 && qualified.length === 4) {
        const firsts = qualified.filter(item => item.zoneRank === 1);
        const seconds = qualified.filter(item => item.zoneRank === 2);
        if (firsts.length === 2 && seconds.length === 2) {
            // Para llaves estándar [1v4, 2v3]: seed1=1A, seed2=1B, seed3=2A, seed4=2B -> 1A vs 2B y 1B vs 2A.
            return [firsts[0], firsts[1], seconds[0], seconds[1]];
        }
    }
    // En el caso general agrupa por posición dentro de la zona (todos los 1.º, luego todos los 2.º, luego mejores adicionales).
    return [...qualified].sort((left, right) => (
        (left.zoneRank ?? 99) - (right.zoneRank ?? 99)
        || left.overallRank - right.overallRank
    ));
};

export const QualificationEngine = {
    isSourceStageCompleted(torneoId, categoriaId, phases = ['ZONAS']) {
        const phaseSet = new Set(phases);
        const matches = DataManager.getMatchesByTournamentAndCategory(torneoId, categoriaId)
            .filter(match => phaseSet.has(match.phase) && (match.confirmado || match.estado !== 'borrador'));
        if (!matches.length) {
            return { ok: false, total: 0, finished: 0, pending: 0, mensaje: 'Aún no hay partidos confirmados en la fase clasificatoria.' };
        }
        const finished = matches.filter(isMatchFinished).length;
        const pending = matches.length - finished;
        return {
            ok: pending === 0,
            total: matches.length,
            finished,
            pending,
            mensaje: pending === 0
                ? 'Fase clasificatoria completada.'
                : `Faltan ${pending} partido${pending === 1 ? '' : 's'} por finalizar en la fase clasificatoria.`
        };
    },

    qualifyTeams(torneoId, categoriaId, options = {}) {
        const {
            qualificationMode = 'general_top_n',
            qualifiersTotal = null,
            qualifiersPerZone = 2,
            bestOthers = 0,
            seedingMode = 'overall_rank',
            requireCompleted = true,
            sourcePhases = ['ZONAS'],
            standingsRules = {}
        } = options;

        if (requireCompleted) {
            const status = this.isSourceStageCompleted(torneoId, categoriaId, sourcePhases);
            if (!status.ok) throw new Error(status.mensaje);
        }

        const generalTable = StandingsEngine.calculateGeneralTable(torneoId, categoriaId, {
            ...standingsRules,
            phases: sourcePhases
        });
        const overallRankMap = new Map(generalTable.map((row, index) => [row.id, index + 1]));

        let selected = [];
        let zoneCount = 0;

        if (qualificationMode === 'per_zone') {
            const zoneTables = StandingsEngine.calculateZoneTables(torneoId, categoriaId, standingsRules);
            zoneCount = zoneTables.length;
            if (!zoneTables.length) {
                throw new Error('No hay zonas configuradas para clasificar equipos por zona.');
            }
            const perZone = Number(qualifiersPerZone);
            if (!Number.isInteger(perZone) || perZone < 1) {
                throw new Error('La cantidad de clasificados por zona debe ser al menos 1.');
            }
            const pickedIds = new Set();
            const directQualifiers = [];
            const nextCandidates = [];

            zoneTables.forEach(({ zone, standings }, zoneIndex) => {
                if (standings.length < perZone) {
                    throw new Error(`${zone.nombre} tiene ${standings.length} equipo(s) y requiere al menos ${perZone} para clasificar.`);
                }
                standings.slice(0, perZone).forEach((row, rankIndex) => {
                    pickedIds.add(row.id);
                    directQualifiers.push({
                        ...row,
                        zoneId: zone.id,
                        zoneName: zone.nombre,
                        zoneIndex,
                        zoneRank: rankIndex + 1,
                        overallRank: overallRankMap.get(row.id) || 999,
                        qualificationSource: `${rankIndex + 1}.º ${zone.nombre}`
                    });
                });
                standings.slice(perZone).forEach((row, extraIndex) => {
                    nextCandidates.push({
                        ...row,
                        zoneId: zone.id,
                        zoneName: zone.nombre,
                        zoneIndex,
                        zoneRank: perZone + extraIndex + 1,
                        overallRank: overallRankMap.get(row.id) || 999,
                        qualificationSource: `Mejor ${perZone + extraIndex + 1}.º (${zone.nombre})`
                    });
                });
            });

            const extraCount = Math.max(0, Number(bestOthers || 0));
            const sortedExtras = sortStandingsRows(nextCandidates, standingsRules)
                .filter(row => !pickedIds.has(row.id))
                .slice(0, extraCount);
            if (sortedExtras.length < extraCount) {
                throw new Error(`No alcanzan los equipos disponibles para completar los ${extraCount} mejores adicionales.`);
            }
            selected = [...directQualifiers, ...sortedExtras];
        } else {
            const total = Number(qualifiersTotal || generalTable.length);
            if (!Number.isInteger(total) || total < 2) {
                throw new Error('Deben clasificar al menos 2 equipos.');
            }
            if (generalTable.length < total) {
                throw new Error(`No se pueden clasificar ${total} equipos: la categoría tiene ${generalTable.length}.`);
            }
            selected = generalTable.slice(0, total).map((row, index) => ({
                ...row,
                zoneRank: null,
                overallRank: index + 1,
                qualificationSource: `Top ${total} (#${index + 1})`
            }));
        }

        // Garantiza unicidad absoluta antes de sembrar.
        const uniqueIds = new Set(selected.map(team => team.id));
        if (uniqueIds.size !== selected.length) {
            throw new Error('Se detectaron equipos repetidos durante la clasificación.');
        }

        const ordered = seedingMode === 'zone_cross' && qualificationMode === 'per_zone'
            ? orderForZoneCross(selected, zoneCount)
            : [...selected].sort((left, right) => (
                (left.zoneRank ?? 0) - (right.zoneRank ?? 0)
                || left.overallRank - right.overallRank
            ));

        const finalSeeded = seedingMode === 'overall_rank'
            ? [...selected].sort((left, right) => left.overallRank - right.overallRank)
            : ordered;

        return finalSeeded.map((team, index) => ({
            ...team,
            seed: index + 1
        }));
    }
};
