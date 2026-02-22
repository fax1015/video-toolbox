// Tauri preload script - exposes Tauri APIs to the renderer process
// Uses the global __TAURI__ object to access Tauri core and event APIs

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// Track event listeners for cleanup and callback management
const eventCallbacks = {
    'encode-progress': [],
    'encode-complete': [],
    'encode-error': [],
    'encode-cancelled': [],
    'download-progress': [],
    'download-complete': [],
    'download-error': [],
    'download-cancelled': []
};

const unlistenFns = {};

// Pre-register all event listeners immediately to avoid race conditions
// This ensures listeners are active before any encoding/download starts
async function initializeEventListeners() {
    const eventNames = Object.keys(eventCallbacks);

    for (const eventName of eventNames) {
        try {
            const unlisten = await listen(eventName, (event) => {
                // Call all registered callbacks for this event
                const callbacks = eventCallbacks[eventName] || [];
                callbacks.forEach(callback => {
                    try {
                        // For 'cancelled' events, payload might be undefined
                        callback(event.payload);
                    } catch (err) {
                        console.error(`Error in callback for ${eventName}:`, err);
                    }
                });
            });
            unlistenFns[eventName] = unlisten;
        } catch (err) {
            console.error(`Failed to register listener for ${eventName}:`, err);
        }
    }
}

// Start initializing listeners immediately
const initPromise = initializeEventListeners();

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
    startEncode: async (options) => {
        await initPromise; // Ensure listeners are ready before starting
        return invoke('start_encode', { options });
    },
    extractAudio: async (options) => {
        await initPromise;
        return invoke('extract_audio', { options });
    },
    trimVideo: async (options) => {
        await initPromise;
        return invoke('trim_video', { options });
    },
    videoToGif: async (options) => {
        await initPromise;
        return invoke('video_to_gif', { options });
    },
    imageToGif: async (options) => {
        await initPromise;
        return invoke('image_to_gif', { options });
    },
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
    downloadVideo: async (options) => {
        await initPromise;
        return invoke('download_video', { url: options.url, options });
    },
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
    pdfToImages: (options) => invoke('pdf_to_images', {
        pdfPath: options.pdfPath,
        outputDir: options.outputDir,
        format: options.format,
    }),

    // ==================== Event APIs ====================
    // Encode events - callbacks are stored and called when events arrive
    onProgress: (callback) => {
        eventCallbacks['encode-progress'].push(callback);
        return callback;
    },
    onComplete: (callback) => {
        eventCallbacks['encode-complete'].push(callback);
        return callback;
    },
    onError: (callback) => {
        eventCallbacks['encode-error'].push(callback);
        return callback;
    },
    onCancelled: (callback) => {
        eventCallbacks['encode-cancelled'].push(callback);
        return callback;
    },

    // Download events
    onDownloadProgress: (callback) => {
        eventCallbacks['download-progress'].push(callback);
        return callback;
    },
    onDownloadComplete: (callback) => {
        eventCallbacks['download-complete'].push(callback);
        return callback;
    },
    onDownloadError: (callback) => {
        eventCallbacks['download-error'].push(callback);
        return callback;
    },

    // ==================== Utility APIs ====================
    logInfo: (...args) => {
        const msg = args.map(a => {
            if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack}`;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ');
        invoke('frontend_log', { level: 'info', message: msg }).catch(() => { });
    },
    logWarn: (...args) => {
        const msg = args.map(a => {
            if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack}`;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ');
        invoke('frontend_log', { level: 'warn', message: msg }).catch(() => { });
    },
    logError: (...args) => {
        const msg = args.map(a => {
            if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack}`;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ');
        invoke('frontend_log', { level: 'error', message: msg }).catch(() => { });
    },
    // Remove event listener (for cleanup)
    removeListener: (eventName, handler) => {
        if (eventCallbacks[eventName]) {
            const index = eventCallbacks[eventName].indexOf(handler);
            if (index > -1) {
                eventCallbacks[eventName].splice(index, 1);
            }
        }
    }
};
