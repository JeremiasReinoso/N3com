# N3com / NEWCOM 2026

N3com puede ejecutarse como aplicación web local o como aplicación de escritorio
multiplataforma. Ambas variantes usan la misma interfaz, módulos JavaScript,
rutas y lógica de torneos; Electron no contiene una copia del frontend.

## Desarrollo

Instalá las dependencias una vez:

```bash
npm install
```

Para abrir la aplicación de escritorio:

```bash
npm run start
```

Electron inicia el servidor local existente en `127.0.0.1:4174` y carga la
aplicación desde allí. El puerto es estable para conservar el `localStorage`
entre aperturas y puede cambiarse si está ocupado con `N3COM_DESKTOP_PORT`.
No necesita conexión a Internet para abrir la interfaz.

Para usar la versión web local, sin Electron:

```bash
npm run web
```

Luego abrí `http://127.0.0.1:4173` en el navegador.

## Datos locales

Los torneos, equipos, zonas, programación, resultados, posiciones y
eliminatorias continúan almacenándose en el `localStorage` del navegador o del
perfil de Electron, respectivamente. No se cambió su formato ni su lógica.

Las licencias del modo web se mantienen en `private/licenses.json`, como antes.
En escritorio se guardan en el directorio de datos de usuario de la aplicación
(`private/licenses.json` dentro de `app.getPath('userData')`), para que un
instalador no intente escribir dentro de la carpeta instalada.

## Pruebas

```bash
npm test
```

La suite cubre los flujos de licencias, navegación, torneos, zonas, fixture,
resultados, posiciones, eliminatorias y todos contra todos.

## Instaladores Linux

En Linux x64:

```bash
npm run dist
```

El comando deja estos artefactos en `release/`:

```text
N3com-<versión>-linux-x64.AppImage
N3com-<versión>-linux-x64.deb
N3com-<versión>-linux-x64.rpm
```

También puede usarse el alias explícito:

```bash
npm run dist:linux
```

Para validar solamente la aplicación empaquetada, sin generar instaladores:

```bash
npm run pack
```

## Instalador Windows

La configuración NSIS x64 ya está declarada. Generalo desde Windows (o desde
un CI con las herramientas de Windows) con:

```powershell
npm ci
npm run dist:win
```

El resultado es un instalador `.exe` dentro de `release/`. No se considera
probado hasta ejecutarlo en Windows; el build cruzado desde Linux depende de
Wine y de herramientas adicionales del entorno.

## Seguridad y mantenimiento

La ventana de Electron usa `contextIsolation: true`, `nodeIntegration: false`
y sandbox del renderer. No se expone API de Node ni IPC al frontend, porque la
aplicación no lo necesita. Las DevTools sólo están disponibles en desarrollo.

Los iconos temporales se encuentran en `assets/` (`icon.png`, `icon.ico` e
`icon.icns`). Reemplazalos por los iconos finales de N3com conservando esos
nombres y formatos antes de una distribución comercial. La arquitectura deja
libre la incorporación futura de un actualizador, sin implementarlo todavía.
