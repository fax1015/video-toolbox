// Tauri preload script - exposes Tauri APIs to the renderer process
// Uses the global __TAURI__ object to access Tauri core and event APIs

const { invoke } = window.__TAURI__.core;
const { listen, once } = window.__TAURI__.event;

// Track event listeners for cleanup
const eventListeners = {
    'encode-progress': [],
    'encode-complete': [],
    'encode-error': [],
    'encode-cancelled': [],
    'download-progress': [],
    'download-complete': [],
    'download-error': [],
    'download-cancelled': []
};

// Expose Tauri APIs to the renderer
window.api = {
    // ==================== Dialog APIs ====================
    selectFile: (options = {}) => invoke('select_file', { filters: options.filters, allowAll: options.allowAll }),
    selectFiles: (options = {}) => invoke('select_files', { filters: options.filters, allowAll: options.allowAll }),
    saveFile: (options = {}) => invoke('save_file', { filters: options.filters, defaultName: options.defaultName, title: options.title }),
    selectFolder: () => invoke('select_folder'),
    convertFileSrc: (path, options) => window.__TAURI__.core.convertFileSrc(path, options),

    // ==================== File System APIs ====================
    listFiles: (folderPath) => invoke('list_files', { directory: folderPath }),
    getAppVersion: () => invoke('get_app_version'),

    // ==================== FFmpeg/Encoder APIs ====================
    getEncoders: () => invoke('get_encoders'),
    getMetadata: (filePath) => invoke('get_metadata', { filePath }),
    getMetadataFull: (filePath) => invoke('get_metadata_full', { filePath }),
    getImageInfo: (filePath) => invoke('get_image_info', { filePath }),
    saveMetadata: (options) => invoke('save_metadata', { filePath: options.filePath, metadata: options.metadata }),
    startEncode: (options) => invoke('start_encode', options),
    extractAudio: (options) => invoke('extract_audio', options),
    trimVideo: (options) => invoke('trim_video', options),
    cancelEncode: () => invoke('cancel_encode'),

    // ==================== Media Analysis APIs ====================
    getAudioWaveform: (options) => invoke('get_audio_waveform', {
        filePath: options.filePath,
        mode: options.mode,
        width: options.width,
        height: options.height,
        palette: options.palette,
        paletteColor: options.paletteColor
    }),
    getVideoThumbnails: (options) => invoke('get_video_thumbnails', {
        filePath: options.filePath,
        duration: options.duration,
        count: options.count
    }),

    // ==================== Download APIs ====================
    getVideoInfo: (url, options) => invoke('get_video_info', { url, disableFlatPlaylist: options?.disableFlatPlaylist }),
    downloadVideo: (options) => invoke('download_video', { url: options.url, options }),
    cancelDownload: () => invoke('cancel_download'),

    // ==================== Shell APIs ====================
    openFile: (filePath) => invoke('open_file', { filePath }),
    openFolder: (folderPath) => invoke('open_folder', { folderPath }),
    openExternal: (url) => invoke('open_external', { url }),

    // ==================== Window APIs ====================
    minimize: () => window.__TAURI__.window.getCurrentWindow().minimize(),
    toggleMaximize: async () => {
        const win = window.__TAURI__.window.getCurrentWindow();
        const isMaximized = await win.isMaximized();
        if (isMaximized) {
            await win.unmaximize();
        } else {
            await win.maximize();
        }
    },
    close: () => window.__TAURI__.window.getCurrentWindow().close(),

    // ==================== Conversion APIs ====================
    convertImagesToPdf: (options) => invoke('convert_images_to_pdf', {
        imagePaths: options.imagePaths,
        outputPath: options.outputPath,
        quality: options.quality,
        upscale: options.upscale
    }),

    // ==================== Event APIs ====================
    // Encode events
    onProgress: (callback) => {
        const handler = (event) => callback(event.payload);
        listen('encode-progress', handler).then((unlisten) => {
            eventListeners['encode-progress'].push(unlisten);
        });
        return handler;
    },
    onComplete: (callback) => {
        const handler = (event) => callback(event.payload);
        listen('encode-complete', handler).then((unlisten) => {
            eventListeners['encode-complete'].push(unlisten);
        });
        return handler;
    },
    onError: (callback) => {
        const handler = (event) => callback(event.payload);
        listen('encode-error', handler).then((unlisten) => {
            eventListeners['encode-error'].push(unlisten);
        });
        return handler;
    },
    onCancelled: (callback) => {
        const handler = () => callback();
        listen('encode-cancelled', handler).then((unlisten) => {
            eventListeners['encode-cancelled'].push(unlisten);
        });
        return handler;
    },

    // Download events
    onDownloadProgress: (callback) => {
        const handler = (event) => callback(event.payload);
        listen('download-progress', handler).then((unlisten) => {
            eventListeners['download-progress'].push(unlisten);
        });
        return handler;
    },
    onDownloadComplete: (callback) => {
        const handler = () => callback();
        listen('download-complete', handler).then((unlisten) => {
            eventListeners['download-complete'].push(unlisten);
        });
        return handler;
    },
    onDownloadError: (callback) => {
        const handler = (event) => callback(event.payload);
        listen('download-error', handler).then((unlisten) => {
            eventListeners['download-error'].push(unlisten);
        });
        return handler;
    },

    // ==================== Utility APIs ====================
    // Remove event listener (for cleanup)
    removeListener: (eventName, handler) => {
        if (eventListeners[eventName]) {
            const index = eventListeners[eventName].indexOf(handler);
            if (index > -1) {
                eventListeners[eventName].splice(index, 1);
            }
        }
    }
};
