import { app, BrowserWindow, Menu, dialog } from 'electron';
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
    if (!localServer) localServer = await startLocalServer({ port: desktopPort, privateDirectory });
    const appOrigin = new URL(localServer.url).origin;

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
            devTools: isDevelopment
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== appOrigin) event.preventDefault();
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
