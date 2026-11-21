# Formatos de Competición y Reglas Deportivas — N3com

## 1. Reglas Universales de Resultados (Sets Reales de Newcom)

Todos los formatos comparten exactamente la misma regla de puntuación (`ResultsEngine`):

- Los partidos se definen al mejor de **3 sets** (`2-0` o `2-1`).
- No se permiten sets empatados ni valores negativos o decimales.
- Si los dos primeros sets finalizan `1-1`, es obligatorio cargar el 3.º set (desempate). Si finalizan `2-0`, el 3.º set se bloquea y limpia automáticamente.
- Acumulación por equipo:
  - **`PJ`**: partidos jugados.
  - **`PG`**: partidos ganados.
  - **`PP`**: partidos perdidos.
  - **`SF` / `SC`**: sets a favor / sets en contra.
  - **`PF` / `PC`**: suma real de puntos anotados y recibidos en **todos los sets jugados**.
  - **`DIF`**: diferencia de puntos (`PF - PC`).

### Ejemplo verificable
- Set 1: Equipo A `15` – Equipo B `12`
- Set 2: Equipo A `15` – Equipo B `5`
- **Resultado:** Marcador `2-0` → Equipo A (`PJ=1, PG=1, SF=2, SC=0, PF=30, PC=17, DIF=+13`) · Equipo B (`PJ=1, PP=1, SF=0, SC=2, PF=17, PC=30, DIF=-13`).

---

## 2. Criterios de Clasificación y Desempate (`StandingsEngine`)

Cada categoría puede elegir su sistema de tabla:

1. **Estándar Newcom (`wins`, predeterminado):**
   `PG` → `DIF Sets (SF - SC)` → `DIF Puntos (PF - PC)` → `PF` → **Mini-tabla de enfrentamiento directo** → orden determinista.
2. **Tabla por Puntos FEVA (`points_table`):**
   - Victoria `2-0`: **3 pts** · Victoria `2-1`: **2 pts** · Derrota `1-2`: **1 pt** · Derrota `0-2`: **0 pts**.
   - Orden: `PTS` → `PG` → `DIF Sets` → `DIF Puntos` → `PF` → **Mini-tabla directa** → orden determinista.
3. **Histórico por Puntos a Favor (`legacy_pf`):**
   - Conservado opcionalmente para reglamentos específicos que ordenan por `PF → DIF Puntos → DIF Sets → PG`.

> **Mini-tabla en empates múltiples:** Cuando 2, 3 o más equipos igualan en los criterios generales, `StandingsEngine` construye una mini-tabla considerando exclusivamente los partidos jugados **entre los equipos empatados**, evitando inconsistencias no transitivas.

---

## 3. Formatos Soportados (A–F)

### Formato A — Zonas + Eliminatorias (`ZONAS_ELIMINATORIAS`)
1. Registro de equipos y distribución manual o por sorteo (con cabezas de serie opcionales).
2. Generación de fase de zonas (modo *partidos garantizados* o *todos contra todos* intra-zona).
3. Cálculo de tablas por zona y tabla general.
4. Clasificación configurable:
   - **Por tabla general:** Top 2, Top 3, Top 4, Top 6, Top 8, Top 12, Top 16.
   - **Por zona:** Top $K$ por zona + $M$ mejores adicionales (ej. mejores terceros).
5. Ordenamiento de cruces: ranking general (`1.º vs último`), cruce entre zonas (`1.º A vs 2.º B`) o re-seeding legado.
6. Eliminatorias con **byes reales** cuando corresponda y **Tercer Puesto** opcional.
7. Clasificación definitiva completa (Campeón, Subcampeón, 3.º/4.º, Cuartos, Octavos y resto por tabla).

### Formato B — Todos contra Todos (`TODOS_CONTRA_TODOS`)
- Tabla general única sin zonas.
- Generación determinista por **Método del Círculo (Berger)**:
  - $N$ par: $N - 1$ rondas de $N/2$ partidos ($\frac{N(N-1)}{2}$ cruces únicos).
  - $N$ impar: $N$ rondas de $(N-1)/2$ partidos con **1 equipo descansando (bye) por ronda**; cada equipo descansa exactamente 1 vez.
- Soporta 1 vuelta o 2 vueltas (ida y vuelta).
- No genera eliminatorias salvo habilitación explícita.

### Formato C — Zonas + Zona Final (`ZONAS_ZONA_FINAL`)
1. Fase de zonas inicial y clasificación de los mejores equipos.
2. Generación de **Zona Final** todos contra todos entre los clasificados.
3. **Política de puntos obligatoria y explícita** (jamás se mezclan criterios):
   - **`reset` (Arranque en 0 puntos):** todos los clasificados comienzan en cero y juegan un todos contra todos completo en Zona Final.
   - **`carry_over` (Arrastre entre clasificados):** se conservan únicamente los resultados previos de Fase de Zonas jugados **entre equipos clasificados** y sólo se generan los enfrentamientos pendientes entre clasificados que aún no se enfrentaron.
4. **No genera eliminatorias:** el campeón y el orden definitivo surgen directamente de la Zona Final.

### Formato D — Eliminación Directa (`ELIMINACION_DIRECTA`)
- Cuadro directo automático para cualquier $N \ge 2$ equipos (`3, 4, 5, 6, 8, 10, 12, 16, 20...`).
- Seeds estándar oficiales (`1v16, 8v9, 4v13...`).
- Para cantidades que no son potencia de dos ($N < 2^k$), los $2^k - N$ mejores seeds reciben **BYE automático** a la ronda siguiente **sin crear partidos ficticios**.
- Total exacto de partidos principales = $N - 1$ (+1 opcional para Tercer Puesto si $N \ge 4$).

### Formato E — Liga por Rondas (`LIGA_RONDAS`)
- Jornadas y rondas completas con enfrentamientos únicos (1 o 2 vueltas), tabla acumulativa por puntos FEVA (o PG) y control de descansos en cantidades impares.

### Formato F — Formato Personalizado (`PERSONALIZADO`)
- Permite encadenar fases (`ZONAS`, `LIGA`, `ZONA_FINAL`, `ELIMINATORIAS`) definiendo zonas, clasificados, vueltas, política de arrastre y 3.º puesto.
- `ValidationEngine.validateFormatConfig` bloquea antes de guardar cualquier combinación imposible (p. ej. fases posteriores a Eliminatorias, más clasificados que equipos, Zona Final sin política explícita o zonas con menos de 2 equipos).

---

## 4. Programación y Descansos

- **Bloque e intervalo:** si `intervaloPartidos = 0`, los turnos avanzan cada `blockDuration`. Si `0 < intervaloPartidos < blockDuration`, el paso efectivo es `blockDuration + intervaloPartidos` (pausa entre partidos). Si `intervaloPartidos >= blockDuration`, se conserva compatibilidad histórica como paso directo.
- **Descanso mínimo por categoría:** un descanso de $R$ bloques impide programar dos partidos del mismo equipo con separación menor a $\text{slotInterval} \times (R + 1)$.
- **Restricciones duras:** ninguna cancha puede albergar dos partidos superpuestos ni ningún equipo puede disputar dos encuentros simultáneos.
