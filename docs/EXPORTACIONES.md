# Guía de Exportaciones y Respaldos — N3com

N3com genera todos sus documentos de forma local y sin conexión, reflejando siempre los datos reales y los filtros seleccionados.

---

## 1. Exportaciones desde Programación (`js/services/fixturePdf.js`)

| Documento | Botón / Origen | Contenido |
| :--- | :--- | :--- |
| **PDF General del Torneo** | `Exportar fixture completo` | Todas las jornadas y canchas del torneo, separadas por página de cancha/jornada para impresión de mesa. |
| **PDF por Categoría** | `PDF de la categoría filtrada` | Exclusivamente los partidos de la categoría seleccionada. |
| **PDF por Jornada** | `PDF del día filtrado` | Exclusivamente los partidos del día seleccionado en el filtro. |
| **PDF por Cancha** | `PDF de la cancha filtrada` | Exclusivamente los partidos asignados a la cancha elegida. |
| **PDF con Filtros Combinados** | `PDF con filtros activos` | Proyección exacta de la combinación actual (Día + Categoría + Modalidad + Etapa + Zona + Cancha + Estado). |
| **Hoja de Cálculo Excel (`.xlsx`)** | `Exportar a hoja de cálculo (.xlsx)` | Libro multi-hoja con pestaña `Fixture completo` + una pestaña individual por cada cancha configurada. |
| **Archivo CSV (`.csv`)** | `Exportar CSV` | Tabla delimitada por `;` con BOM UTF-8 compatible con Excel y LibreOffice, incluyendo Set 1, Set 2, Set 3 y marcador. |
| **Impresión directa** | `Imprimir` | Hoja optimizada con `@media print` que oculta controles, filtros y editores. |

### Modo de visualización horaria
- Por defecto se imprime la **hora programada de cada bloque**.
- Activando la casilla **«Solo hora de inicio por cancha»**, tanto la tabla como el PDF y el `.xlsx` muestran únicamente la hora de inicio del primer partido de cada cancha por jornada (ideal para torneos jugados *a continuación*).

---

## 2. Exportaciones de Posiciones (`js/services/reportsExport.js`)

Disponibles desde la pestaña **Posiciones**:
- **PDF de Posiciones (`Exportar posiciones (PDF)`):** incluye encabezado del torneo, organización/marca, período, formato activo y todas las tablas vigentes de la categoría (Clasificación definitiva, Zona Final con su política explícita de arrastre, Tablas por Zona y Tabla General) con columnas `PJ, PG, PP, SF, SC, PF, PC, DIF` (y `PTS` en modo FEVA).
- **CSV de Posiciones (`Exportar posiciones (CSV)`):** listo para planillas o publicación web.

---

## 3. Exportaciones de Resultados (`js/services/reportsExport.js`)

Disponibles desde la pestaña **Resultados**:
- **PDF de Resultados (`Exportar resultados (PDF)`):** respeta los filtros activos (equipo, etapa, estado) y muestra fecha, hora, etapa/zona, equipos, detalle set por set (`S1`, `S2`, `S3`), marcador, puntos totales `PF-PC` y ganador.
- **CSV de Resultados (`Exportar CSV`):** incluye columnas separadas para cada set, marcador, `PF Local`, `PC Local` y ganador.

---

## 4. Copias de Seguridad e Importación (`.json`)

- **Respaldo completo:** desde **Mis Torneos → `Exportar respaldo (.json)`** se descarga una instantánea versionada (`schema: "n3com-backup", version: "2.0"`) con todos los torneos, categorías, equipos, zonas, calendario y partidos.
- **Respaldo por torneo:** desde **Inicio del torneo → `Respaldar torneo (.json)`** se exporta un único torneo autocontenido.
- **Importación segura:** **`Importar respaldo (.json)`** valida la estructura del archivo e incorpora torneos nuevos sin sobrescribir ni duplicar torneos existentes (`mode: "merge"`).
