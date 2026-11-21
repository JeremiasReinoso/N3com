# Manual del Organizador de Torneos — N3com

Guía práctica paso a paso para clubes, asociaciones y federaciones que organizan torneos reales de Newcom con N3com.

---

## Paso 1: Activar la licencia y crear el torneo
1. Al iniciar N3com por primera vez, ingresá el código de licencia entregado por tu administrador (`NWC-...` o token firmado `NWC2-...`).
2. En **Mis Torneos**, completá:
   - **Nombre del torneo** y **Organización / Club**.
   - **Formato predeterminado** (A–F), **Partidos por equipo**, **Canchas disponibles** y, opcionalmente, **Fechas de inicio y fin**.
3. Hacé clic en **Crear torneo** y luego en **Abrir torneo**.

## Paso 2: Revisar el tablero de Inicio
- En la pestaña **Inicio** verás el resumen global del torneo (categorías, equipos, canchas, avance de partidos y alertas logísticas).
- Desde allí podés editar los datos generales, definir una etiqueta institucional para los PDFs o descargar una **copia de seguridad del torneo (`.json`)**.

## Paso 3: Crear categorías, configurar formatos y cargar equipos
1. Ingresá a **Equipos**.
2. Seleccioná las categorías de Newcom (`+40`, `+50`, `+60`, `+68` en Masculino, Femenino o Mixto) o creá una **categoría personalizada** (ej. `+70 Mixto`).
3. En el panel **Formato de competición y reglas**, ajustá el formato específico de esa categoría (A–F), las reglas de tabla/desempate, la cantidad de clasificados, la política de Zona Final (cero o arrastre) o el partido por 3.º puesto, y guardá.
4. Cargá todos los equipos participantes. Si cometiste un error, podés **Renombrar** o **Eliminar** equipos antes de jugar sus partidos.

## Paso 4: Organizar zonas (si el formato usa zonas)
1. Ingresá a **Zonas**. *(Si la categoría usa Todos contra Todos, Liga o Eliminación Directa, N3com te avisará que no necesita zonas y podés pasar directo al paso 5).*
2. Creá las zonas (`Zona A`, `Zona B`, etc.).
3. Asigná equipos manualmente o elegí **cabezas de serie** opcionales y presioná **Sortear equipos sin zona** para una distribución equilibrada automática.
4. Podés mover equipos entre zonas, quitar asignaciones o liberar cabezas de serie antes de generar partidos.

## Paso 5: Configurar el Calendario y la Planificación
1. En **Calendario**, seleccioná el período de competencia, el horario diario (`desde` / `hasta`), la **duración del bloque (min)** y el **intervalo entre partidos (min)**, y guardá.
2. En **Planificación** (opcional), indicá para cada categoría qué etapas se jugarán en cada jornada.

## Paso 6: Generar emparejamientos y programar el Fixture General
1. Ingresá a **Programación**.
2. Revisá las **canchas globales** (podés renombrar, agregar o quitar canchas sin uso) y el **descanso mínimo en bloques por categoría**.
3. Para cada categoría, presioná **Generar emparejamientos**, revisá la previsualización (y los descansos por ronda si hay cantidad impar) y hacé clic en **Confirmar emparejamientos**.
4. Cuando las categorías estén confirmadas, presioná **Programar todos los partidos**. N3com asignará automáticamente fecha, horario y cancha respetando descansos y evitando choques.
5. Si necesitás mover un encuentro manualmente, abrí **Reprogramar** en la fila del partido: el sistema validará conflictos antes de guardar y conservará el mismo partido sin duplicarlo.

## Paso 7: Cargar resultados y seguir posiciones
1. En **Resultados**, buscá por equipo, categoría, etapa o estado (`Pendientes`/`Jugados`).
2. Presioná **Cargar resultado** e ingresá los puntos reales de cada set (si los dos primeros sets quedan `1-1`, se habilitará automáticamente el Set 3 de desempate).
3. Consultá **Posiciones** para ver en tiempo real las tablas por zona, la tabla general, la Zona Final o la **Clasificación Definitiva + Podio**.

## Paso 8: Avanzar a Zona Final o Eliminatorias
1. Una vez finalizados todos los partidos de la fase clasificatoria, ingresá a **Eliminatorias**.
2. Presioná **Generar Zona Final** (Formato C) o **Generar cuadro eliminatorio** (Formatos A, D y F).
3. Al cargar los resultados de cada ronda en **Resultados**, los ganadores avanzan automáticamente a la ronda siguiente (y los perdedores de semifinales al partido por el **Tercer Puesto** si está habilitado).

## Paso 9: Exportar documentación y resguardar el torneo
- Exportá fixtures en PDF/XLSX/CSV desde **Programación**, tablas en PDF/CSV desde **Posiciones** y planillas de resultados desde **Resultados**.
- Guardá periódicamente un respaldo `.json` desde **Inicio** o **Mis Torneos**.
