# N3com — Plataforma Comercial de Gestión de Torneos de Newcom

N3com es un sistema profesional multiplataforma (**Escritorio Electron** y **Web compartida**) para la organización integral de torneos de Newcom de cualquier escala: clubes, asociaciones y federaciones.

Ambas variantes comparten **exactamente la misma interfaz, el mismo motor modular de competición (`js/engine/`) y las mismas reglas deportivas**.

---

## Capacidades principales

- **6 Formatos de competición modulares y extensibles:**
  - **Formato A — Zonas + Eliminatorias:** clasificación por tabla general (Top 2/4/8/16/personalizado) o por zona (+ mejores terceros), cruces configurables y 3.º puesto opcional.
  - **Formato B — Todos contra Todos:** tabla única con Método del Círculo (Berger), rondas equilibradas y descansos (*byes*) explícitos para cantidades impares.
  - **Formato C — Zonas + Zona Final:** clasificación a Zona Final todos contra todos con regla explícita y validada de **arranque en 0 puntos (`reset`)** o **arrastre de resultados entre clasificados (`carry_over`)**, sin generar eliminatorias artificiales.
  - **Formato D — Eliminación Directa:** cuadro automático para cualquier $N \ge 2$ con seeds estándar, **byes reales** en no-potencias de dos (sin cruces ficticios) y 3.º puesto opcional.
  - **Formato E — Liga por Rondas:** campeonato por jornadas y rondas completas con tabla acumulativa (puntos FEVA 3-2-1-0 o PG).
  - **Formato F — Formato Personalizado:** configurador multifase con validación de coherencia que impide combinaciones imposibles.
- **Categorías independientes dentro de un mismo torneo:** cada categoría conserva su formato, reglas de clasificación, planificación de jornadas y descanso mínimo entre partidos, compartiendo las canchas globales del torneo.
- **Resultados y posiciones verificables:** carga por **sets reales** (`2-0` o `2-1`) con acumulación exacta de `PJ, PG, PP, SF, SC, PF, PC, DIF` y mini-tabla de desempate directo para empates de 2 o más equipos.
- **Logística global sin conflictos:** asignación equilibrada de canchas compartidas, bloques horarios con paso efectivo unificado (`blockDuration + intervaloPartidos`), detección y explicación de conflictos, reprogramación manual con conservación de ID y rollback atómico.
- **Exportación profesional sin dependencias externas:** PDF general, por categoría, por jornada, por cancha y con filtros combinados; PDF y CSV de Tablas de Posiciones y Resultados; libro Excel `.xlsx` con hojas por cancha; hoja de impresión y copias de seguridad `.json`.
- **Seguridad defensiva:** autenticación administrativa en servidor con `scrypt` + sesiones `HttpOnly`/`SameSite=Strict` + tokens CSRF + rate limiting, allowlist estático estricto, cabeceras CSP sin scripts inline, endurecimiento de Electron y licencias criptográficas **Ed25519 (v2)** retrocompatibles con códigos portátiles v1.

---

## Instalación y ejecución

### Requisitos
- Node.js `>= 20` (verificado en Node.js `24.x`).

### Instalación
```bash
npm install
```

### Modo Escritorio (Electron)
```bash
npm start
```
Inicia el servidor local embebido en `127.0.0.1:4174` (configurable con `N3COM_DESKTOP_PORT`) con bloqueo de instancia única y almacenamiento privado en `app.getPath('userData')/private`. Funciona completamente sin conexión a Internet.

### Modo Web local
```bash
npm run web
```
Abrí `http://127.0.0.1:4173` (configurable con `PORT`).

### Panel Administrativo (`admin.html`)
Abrí `http://127.0.0.1:4173/admin.html`.
- En el primer inicio (si no configuraste `N3COM_ADMIN_USER` y `N3COM_ADMIN_PASSWORD` como variables de entorno), el panel solicita crear la cuenta administrativa inicial (mínimo 8 caracteres), que se almacena hasheada con `scrypt` en `private/admin.json` (`0600`).
- Opcionalmente podés preconfigurar credenciales al iniciar el servidor:
```bash
N3COM_ADMIN_USER=admin N3COM_ADMIN_PASSWORD="TuPasswordSegura2026" npm run web
```

---

## Pruebas automatizadas

```bash
npm test
```

La suite verifica:
- Motor de competición (`RoundRobinEngine`, `KnockoutEngine`, `GroupStageEngine`, `FinalStageEngine`, `StandingsEngine`, `QualificationEngine`, `ValidationEngine`, `CompetitionEngine`).
- Casos de `3, 4, 5, 6, 8, 10, 12, 16 y 20` equipos, cantidades impares, zonas únicas y múltiples, multicategoría, Top 2/4/8/16, Zona Final (`reset` vs `carry_over`), Eliminación Directa con byes y 3.º puesto.
- Logística global, descansos por categoría, conflictos, reprogramaciones, rollbacks y compatibilidad con datos históricos.
- Exportaciones PDF (estructura `xref` válida), XLSX y CSV, y respaldos JSON.
- Seguridad: allowlist estático, cabeceras CSP, autenticación `scrypt` + CSRF + rate limiting, firmas Ed25519 y endurecimiento Electron.

---

## Empaquetado comercial

### Linux x64 (`AppImage`, `deb`, `rpm`)
```bash
npm run dist:linux
```

### Validación empaquetada sin instalador
```bash
npm run pack
```

### Windows x64 (`NSIS .exe`, desde Windows o CI Windows)
```powershell
npm ci
npm run dist:win
```

Los artefactos se generan en `release/`. Reemplazá los iconos en `assets/` (`icon.png`, `icon.ico`, `icon.icns`) por la identidad definitiva antes de distribuir.

---

## Documentación adicional

- [Registro de cambios](CHANGELOG.md)
- [Arquitectura del sistema](docs/ARQUITECTURA.md)
- [Formatos de competición y reglas deportivas](docs/FORMATOS_Y_REGLAS.md)
- [Manual del organizador de torneos](docs/MANUAL_ORGANIZADOR.md)
- [Guía de exportaciones y copias de seguridad](docs/EXPORTACIONES.md)
