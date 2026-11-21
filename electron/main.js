import { app, BrowserWindow, Menu, dialog, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startLocalServer } from '../server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDevelopment = !app.isPackaged;
// El puerto estable conserva el mismo origen Chromium entre aperturas y, por
// lo tanto, el localStorage existente de N3com. Se puede cambiar en casos de
// conflicto mediante N3COM_DESKTOP_PORT antes de iniciar la aplicación.
const desktopPort = Number(process.env.N3COM_DESKTOP_PORT) || 4174;
let mainWindow;
let localServer;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });
}

const createApplicationMenu = () => {
    const template = [
        {
            label: 'Archivo',
            submenu: [
                { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
                { type: 'separator' },
                { role: 'quit', label: 'Salir' }
            ]
        },
        {
            label: 'Vista',
            submenu: [
                { role: 'togglefullscreen', label: 'Pantalla completa' }
            ]
        },
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Acerca de N3com',
                    click: () => dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'N3com',
                        message: 'N3com',
                        detail: `Gestión de torneos NEWCOM\nVersión ${app.getVersion()}`
                    })
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createWindow = async () => {
    const privateDirectory = join(app.getPath('userData'), 'private');
    if (!localServer) {
        try {
            localServer = await startLocalServer({ port: desktopPort, privateDirectory });
        } catch (error) {
            if (error?.code === 'EADDRINUSE') {
                dialog.showErrorBox('Puerto en uso', `El puerto local ${desktopPort} está ocupado por otro proceso. Cerralo o definí N3COM_DESKTOP_PORT antes de abrir N3com.`);
            }
            throw error;
        }
    }
    const appOrigin = new URL(localServer.url).origin;
    const isAllowedNavigation = targetUrl => {
        try { return new URL(targetUrl).origin === appOrigin; }
        catch { return false; }
    };

    session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));

    mainWindow = new BrowserWindow({
        width: 1366,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        icon: join(__dirname, '..', 'assets', 'icon.png'),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: isDevelopment
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedNavigation(url)) event.preventDefault();
    });
    mainWindow.webContents.on('will-redirect', (event, url) => {
        if (!isAllowedNavigation(url)) event.preventDefault();
    });
    await mainWindow.loadURL(localServer.url);
};

app.whenReady().then(async () => {
    createApplicationMenu();
    await createWindow();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
}).catch(error => {
    console.error('No se pudo iniciar N3com.', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    localServer?.server.close();
});
