const { app, BrowserWindow, path } = require('electron');

const url = require('url');
const directory = require('path');

function createWindow() {
    const win = new BrowserWindow({
        title: 'Video Toolbox',
        titleBarStyle: 'hidden',
        width: 1000,
        height: 600,
        minWidth: 400,
        minHeight: 550,
        ...(process.platform !== 'darwin' ? {
            titleBarOverlay: {
                color: '#00000000',
                symbolColor: '#c5c5c5ff',
                height: 36
            }
        } : {})
    });

    const startUrl = url.format({
        pathname: directory.join(__dirname, 'renderer', 'index.html'),
        protocol: 'file:',
    });

    win.loadURL(startUrl);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
