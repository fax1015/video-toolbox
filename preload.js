const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectFile: () => ipcRenderer.invoke('select-file'),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    listFiles: (folderPath) => ipcRenderer.invoke('list-files', folderPath),
    getMetadata: (filePath) => ipcRenderer.invoke('get-metadata', filePath),
    getEncoders: () => ipcRenderer.invoke('get-encoders'),
    startEncode: (options) => ipcRenderer.send('start-encode', options),
    cancelEncode: () => ipcRenderer.send('cancel-encode'),
    onProgress: (callback) => ipcRenderer.on('encode-progress', (event, data) => callback(data)),
    onComplete: (callback) => ipcRenderer.on('encode-complete', (event, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('encode-error', (event, data) => callback(data)),
    openFile: (filePath) => ipcRenderer.send('open-file', filePath),
    openFolder: (filePath) => ipcRenderer.send('open-folder', filePath)
});
