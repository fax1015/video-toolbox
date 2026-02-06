const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');

// Set application name and App User Model ID for Windows
app.setName('Video Toolbox');
if (process.platform === 'win32') {
    app.setAppUserModelId('com.fax1015.videotoolbox');
}

Menu.setApplicationMenu(null);

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');


const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Application Constants
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'];

// Performance: Buffer size limits to prevent unbounded memory accumulation
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10 MB max for any output buffer
const MAX_ENCODER_BUFFER = 1024 * 1024;   // 1 MB for encoder list
const MAX_METADATA_BUFFER = 5 * 1024 * 1024; // 5 MB for metadata

const FFMPEG_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(__dirname, 'bin', 'ffmpeg.exe');

const FFPROBE_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffprobe.exe')
    : path.join(__dirname, 'bin', 'ffprobe.exe');

let currentFfmpegProcess = null;
let currentOutputPath = null;
let isCancelling = false;

// ============================================================================
// INPUT VALIDATION & SECURITY UTILITIES
// ============================================================================

/**
 * Validates and normalizes a file path to prevent directory traversal attacks
 * @param {string} inputPath - The path to validate
 * @param {string} basePath - The base allowed directory (optional)
 * @returns {string|null} - Normalized path if valid, null if invalid
 */
function validateAndNormalizePath(inputPath, basePath = null) {
    if (!inputPath || typeof inputPath !== 'string') return null;

    try {
        const normalizedPath = path.normalize(inputPath);
        const resolvedPath = path.resolve(normalizedPath);

        // If basePath is provided, ensure the resolved path is within it
        if (basePath) {
            const resolvedBase = path.resolve(basePath);
            const relative = path.relative(resolvedBase, resolvedPath);

            // If relative path starts with .., it's trying to escape basePath
            if (relative.startsWith('..')) {
                console.error('Path traversal attempt detected:', inputPath);
                return null;
            }
        }

        return resolvedPath;
    } catch (err) {
        console.error('Path validation error:', err);
        return null;
    }
}

/**
 * Validates URL format to prevent command injection
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if URL is valid
 */
function validateUrl(url) {
    if (!url || typeof url !== 'string') return false;

    try {
        // Allow http and https only
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (err) {
        return false;
    }
}

/**
 * Sanitizes filename to prevent directory traversal and special character issues
 * Replaces user input with UUID-based naming when appropriate
 * @param {string} filename - Original filename (optional)
 * @returns {string} - Safe filename or UUID-based name
 */
function getSafeFileName(filename) {
    if (!filename || typeof filename !== 'string') {
        return generateUUID();
    }

    // Use only alphanumeric, dash, underscore. Replace unsafe chars with underscore
    let safe = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');

    // Remove leading/trailing dots and slashes
    safe = safe.replace(/^[./\\]+|[./\\]+$/g, '');

    // Limit length
    if (safe.length > 50) {
        safe = safe.substring(0, 50);
    }

    return safe || generateUUID();
}

/**
 * Generates a UUID for safe file naming
 * @returns {string} - UUID string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Validates numeric input (bitrate, fps, threads)
 * @param {string|number} value - The value to validate
 * @param {number} min - Minimum allowed value (optional)
 * @param {number} max - Maximum allowed value (optional)
 * @returns {boolean} - True if valid
 */
function validateNumericInput(value, min = 0, max = 999999) {
    if (value === null || value === undefined) return true; // Optional parameter

    const num = typeof value === 'string' ? parseInt(value) : value;
    return !isNaN(num) && num >= min && num <= max;
}

/**
 * Escape special characters in metadata strings to prevent injection
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeMetadataString(str) {
    if (!str) return '';

    // Remove control characters and limit length
    return String(str)
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .substring(0, 500); // Limit length to prevent buffer overflow
}

/**
 * Set process priority for FFmpeg based on user setting
 * @param {ChildProcess} process - The FFmpeg process
 * @param {string} priority - Priority level: 'idle', 'low', 'normal', 'high'
 */
function setProcessPriority(process, priority = 'normal') {
    if (!process || !process.pid) return;

    const os = require('os');

    try {
        const platform = os.platform();

        if (platform === 'win32') {
            // Windows: Use WMIC to set priority class
            const priorityMap = {
                'idle': 64,        // IDLE_PRIORITY_CLASS
                'low': 16384,      // BELOW_NORMAL_PRIORITY_CLASS
                'normal': 32,      // NORMAL_PRIORITY_CLASS
                'high': 128        // ABOVE_NORMAL_PRIORITY_CLASS
            };

            const priorityValue = priorityMap[priority] || priorityMap['normal'];

            // Use WMIC to set priority
            spawn('wmic', [
                'process',
                'where',
                `ProcessId=${process.pid}`,
                'CALL',
                'setpriority',
                priorityValue.toString()
            ], { detached: true, stdio: 'ignore' }).unref();

        } else {
            // Linux/Mac: Use renice command
            const niceMap = {
                'idle': 19,    // Lowest priority
                'low': 10,     // Below normal
                'normal': 0,   // Normal
                'high': -10    // Above normal (requires sudo for negative values on some systems)
            };

            const niceValue = niceMap[priority] || niceMap['normal'];

            // Use renice to adjust priority
            spawn('renice', ['-n', niceValue.toString(), '-p', process.pid.toString()],
                { detached: true, stdio: 'ignore' }).unref();
        }
    } catch (error) {
        console.warn('Failed to set process priority:', error.message);
        // Don't throw - encoding should continue even if priority setting fails
    }
}

function createWindow() {
    const win = new BrowserWindow({
        title: 'Video Toolbox',
        titleBarStyle: 'hidden',
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 700,
        show: false,
        backgroundColor: '#0a0f0e',
        icon: path.join(__dirname, 'assets', 'icons', 'favicon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        },
        ...(process.platform !== 'darwin' ? {
            titleBarOverlay: {
                color: '#00000000',
                symbolColor: '#c5c5c5ff',
                height: 36
            }
        } : {})
    });

    win.once('ready-to-show', () => {
        win.show();
    });

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    ipcMain.handle('select-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openFile', 'dontAddToRecent'],
            filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'] }]
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('select-folder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openDirectory', 'dontAddToRecent']
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('list-files', async (event, folderPath) => {
        // Input validation
        if (!folderPath || typeof folderPath !== 'string') {
            console.error('Invalid folder path provided');
            return [];
        }

        // Normalize and validate path to prevent traversal
        const normalizedPath = path.normalize(folderPath);

        try {
            // Check if path exists and is a directory
            const stats = await fs.promises.stat(normalizedPath);
            if (!stats.isDirectory()) {
                console.error('Path is not a directory:', normalizedPath);
                return [];
            }

            const files = await fs.promises.readdir(normalizedPath);
            return files
                .filter(file => VIDEO_EXTENSIONS.includes(path.extname(file).toLowerCase()))
                .map(file => path.join(normalizedPath, file));
        } catch (err) {
            console.error('Error listing files:', err);
            return [];
        }
    });

    ipcMain.handle('get-encoders', async () => {
        return new Promise((resolve) => {
            const ffmpeg = spawn(FFMPEG_PATH, ['-encoders']);
            let output = '';
            ffmpeg.stdout.on('data', (data) => {
                // Prevent unbounded buffer growth
                const chunk = data.toString();
                if (output.length + chunk.length > MAX_ENCODER_BUFFER) {
                    output = output.slice(-512 * 1024) + chunk; // Keep last 512KB
                } else {
                    output += chunk;
                }
            });
            ffmpeg.stderr.on('data', (data) => {
                const chunk = data.toString();
                if (output.length + chunk.length > MAX_ENCODER_BUFFER) {
                    output = output.slice(-512 * 1024) + chunk;
                } else {
                    output += chunk;
                }
            });
            ffmpeg.on('close', () => {
                // Check for actual encoder names (e.g. h264_nvenc) to avoid false positives
                const encoders = {
                    nvenc: /h264_nvenc|hevc_nvenc/.test(output),
                    amf: /h264_amf|hevc_amf/.test(output),
                    qsv: /h264_qsv|hevc_qsv/.test(output)
                };
                resolve(encoders);
            });
        });
    });

    ipcMain.handle('get-metadata', async (event, filePath) => {
        // Input validation
        if (!filePath || typeof filePath !== 'string') {
            return { error: 'Invalid file path provided' };
        }

        const normalizedPath = path.normalize(filePath);

        // Check if file exists
        try {
            await fs.promises.access(normalizedPath, fs.constants.R_OK);
        } catch (err) {
            return { error: 'File not accessible or does not exist' };
        }

        return new Promise((resolve, reject) => {
            const ffprobe = spawn(FFMPEG_PATH, ['-i', normalizedPath]);
            let output = '';
            ffprobe.stderr.on('data', (data) => {
                // Prevent unbounded buffer growth
                const chunk = data.toString();
                if (output.length + chunk.length > MAX_METADATA_BUFFER) {
                    output = output.slice(-512 * 1024) + chunk; // Keep last 512KB
                } else {
                    output += chunk;
                }
            });
            ffprobe.on('close', () => {
                const metadata = {
                    resolution: 'Unknown',
                    duration: '00:00:00',
                    bitrate: '0 kbps'
                };

                const resMatch = output.match(/Stream #.*Video:.* (\d+x\d+)/);
                if (resMatch) {
                    metadata.resolution = resMatch[1];
                    const dims = resMatch[1].split('x');
                    metadata.width = parseInt(dims[0]);
                    metadata.height = parseInt(dims[1]);
                }

                // FPS
                const fpsMatch = output.match(/(\d+(?:\.\d+)?) fps/);
                if (fpsMatch) {
                    metadata.fps = parseFloat(fpsMatch[1]);
                }

                const durMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
                if (durMatch) {
                    metadata.duration = durMatch[1] + ':' + durMatch[2] + ':' + durMatch[3] + '.' + durMatch[4];
                    metadata.durationSeconds = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3]) + parseInt(durMatch[4]) / 100;
                } else {
                    metadata.durationSeconds = 0;
                }

                const bitMatch = output.match(/bitrate: (\d+ kb\/s)/);
                if (bitMatch) metadata.bitrate = bitMatch[1];

                resolve(metadata);
            });
        });
    });

    ipcMain.handle('get-app-version', () => app.getVersion());

    ipcMain.handle('get-metadata-full', async (event, filePath) => {
        return new Promise((resolve, reject) => {
            // Use FFPROBE_PATH for proper JSON metadata output
            const ffprobeArgs = [
                '-v', 'error',
                '-print_format', 'json',
                '-show_entries',
                'format=format_name,duration,size,bit_rate:format_tags=title,artist,album,date,genre,track,comment:stream=codec_type,codec_name,width,height,r_frame_rate,bit_rate,pix_fmt,sample_rate,channels,channel_layout:stream_tags=language',
                '-show_format',
                '-show_streams',
                '-i', filePath
            ];
            const ffprobe = spawn(FFPROBE_PATH, ffprobeArgs);

            let output = '';
            let errorOutput = '';

            ffprobe.stdout.on('data', (data) => {
                const chunk = data.toString();
                if (output.length + chunk.length > MAX_METADATA_BUFFER) {
                    output = output.slice(-512 * 1024) + chunk;
                } else {
                    output += chunk;
                }
            });
            ffprobe.stderr.on('data', (data) => {
                const chunk = data.toString();
                if (errorOutput.length + chunk.length > MAX_METADATA_BUFFER) {
                    errorOutput = errorOutput.slice(-512 * 1024) + chunk;
                } else {
                    errorOutput += chunk;
                }
            });

            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    console.error('ffprobe exited with code', code);
                    console.error('ffprobe stderr:', errorOutput);
                    resolve({ error: `ffprobe failed: ${errorOutput}` });
                    return;
                }

                try {
                    // Sometimes output is empty if file is invalid
                    if (!output.trim()) {
                        throw new Error('Empty output from ffprobe');
                    }
                    const data = JSON.parse(output);
                    resolve(data);
                } catch (e) {
                    console.error('Error parsing ffprobe json:', e);
                    console.error('Raw output:', output);
                    console.error('Stderr:', errorOutput);
                    resolve({ error: `Failed to parse metadata: ${e.message}` });
                }
            });
        });
    });

    ipcMain.handle('save-metadata', async (event, options) => {
        const { filePath, metadata } = options;

        // Validate input file path
        const validatedPath = validateAndNormalizePath(filePath);
        if (!validatedPath) {
            return { success: false, error: 'Invalid file path' };
        }

        return new Promise((resolve, reject) => {
            // Create a temp output file (we'll replace the original)
            const ext = path.extname(validatedPath);
            const dir = path.dirname(validatedPath);
            const baseName = path.basename(validatedPath, ext);
            const tempPath = path.join(dir, `${baseName}_temp${ext}`);

            // Build metadata arguments with escaped strings to prevent injection
            const metaArgs = [];
            if (metadata.title) metaArgs.push('-metadata', `title=${escapeMetadataString(metadata.title)}`);
            if (metadata.artist) metaArgs.push('-metadata', `artist=${escapeMetadataString(metadata.artist)}`);
            if (metadata.album) metaArgs.push('-metadata', `album=${escapeMetadataString(metadata.album)}`);
            if (metadata.year) metaArgs.push('-metadata', `date=${escapeMetadataString(metadata.year)}`);
            if (metadata.genre) metaArgs.push('-metadata', `genre=${escapeMetadataString(metadata.genre)}`);
            if (metadata.track) metaArgs.push('-metadata', `track=${escapeMetadataString(metadata.track)}`);
            if (metadata.comment) metaArgs.push('-metadata', `comment=${escapeMetadataString(metadata.comment)}`);

            const args = [
                '-y',
                '-i', validatedPath,
                '-c', 'copy',  // Copy streams without re-encoding
                ...metaArgs,
                tempPath
            ];

            const ffmpeg = spawn(FFMPEG_PATH, args);
            let errorOutput = '';

            ffmpeg.stderr.on('data', (data) => errorOutput += data.toString());

            ffmpeg.on('close', async (code) => {
                if (code === 0) {
                    // Use atomic file replacement to prevent race conditions
                    try {
                        // Create backup of original
                        const backupPath = validatedPath + '.backup';
                        await fs.promises.copyFile(validatedPath, backupPath);

                        // Replace original with temp file
                        await fs.promises.rename(tempPath, validatedPath);

                        // Remove backup after successful replacement
                        await fs.promises.unlink(backupPath).catch(() => { });

                        resolve({ success: true });
                    } catch (e) {
                        console.error('Error replacing file:', e);
                        // Try to clean up temp file
                        try { await fs.promises.unlink(tempPath); } catch (e2) { }
                        resolve({ success: false, error: `Failed to replace file: ${e.message}` });
                    }
                } else {
                    console.error('ffmpeg failed:', errorOutput);
                    // Clean up temp file if it exists
                    try { await fs.promises.unlink(tempPath); } catch (e) { }
                    resolve({ success: false, error: `ffmpeg failed: ${errorOutput}` });
                }
            });

            ffmpeg.on('error', (err) => {
                console.error('ffmpeg spawn error:', err);
                resolve({ success: false, error: err.message });
            });
        });
    });

    ipcMain.handle('get-audio-waveform', async (event, payload) => {
        return new Promise((resolve) => {
            const options = typeof payload === 'string'
                ? { filePath: payload }
                : (payload || {});
            const filePath = options.filePath;
            const mode = options.mode || 'waveform';
            const width = parseInt(options.width, 10) || 800;
            const height = parseInt(options.height, 10) || 120;
            const palette = options.palette || 'heatmap';
            const paletteColor = (options.paletteColor || '63f1af').replace('#', '');

            if (!filePath) {
                resolve(null);
                return;
            }

            let filter = '';
            if (mode === 'spectrogram') {
                filter = `[0:a]showspectrumpic=s=${width}x${height}:legend=0:color=rainbow:scale=log`;
            } else if (palette === 'heatmap') {
                filter = `[0:a]aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=white:scale=log,format=gray,` +
                    `lutrgb=r='if(lte(val,128),0,2*(val-128))':` +
                    `g='if(lte(val,128),2*val,255-2*(val-128))':` +
                    `b='if(lte(val,128),255-2*val,0)'`;
            } else if (palette === 'accent') {
                filter = `[0:a]aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=0x${paletteColor}:scale=log`;
            } else {
                filter = `[0:a]aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=white:scale=log`;
            }

            const args = [
                '-y', '-i', filePath,
                '-filter_complex', filter,
                '-frames:v', '1', '-f', 'image2', 'pipe:1'
            ];
            const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            const chunks = [];
            ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
            ffmpeg.stderr.on('data', () => { });
            ffmpeg.on('error', () => resolve(null));
            ffmpeg.on('close', (code) => {
                if (code === 0 && chunks.length > 0) {
                    resolve(Buffer.concat(chunks).toString('base64'));
                } else {
                    resolve(null);
                }
            });
        });
    });

    ipcMain.handle('get-video-thumbnails', async (event, options) => {
        const { filePath, duration, count = 50 } = options;
        if (!duration) return null;

        return new Promise((resolve) => {
            let fileSizeMB = 0;
            try {
                const stats = fs.statSync(filePath);
                fileSizeMB = stats.size / (1024 * 1024);
            } catch (err) {
                fileSizeMB = 0;
            }

            let targetHeight = 240;
            let quality = 2;
            let maxCount = 300;

            if (fileSizeMB > 600) {
                targetHeight = 160;
                quality = 6;
                maxCount = 80;
            } else if (fileSizeMB > 300) {
                targetHeight = 180;
                quality = 5;
                maxCount = 100;
            } else if (fileSizeMB > 120) {
                targetHeight = 200;
                quality = 4;
                maxCount = 140;
            } else if (fileSizeMB > 40) {
                targetHeight = 220;
                quality = 3;
                maxCount = 180;
            }

            // Target roughly 240px height for quality (approx 240x135 for 16:9)
            // Use Grid Layout to avoid texture width limits (~16384px)
            const desiredCount = Math.min(count, maxCount);
            const safeCount = Math.min(desiredCount, 300);
            const fps = (safeCount + 2) / duration;

            // Grid Layout: 10 columns wide
            const cols = 10;
            // Rows proportional to count
            const rows = Math.ceil(safeCount / cols);

            // "tile=10x30" -> 10 columns, 30 rows
            const tileLayout = `${cols}x${rows}`;

            // Scale to 240px height, keep aspect ratio
            const vf = `fps=${fps},scale=-1:${targetHeight},tile=${tileLayout}`;

            const args = [
                '-y', '-i', filePath,
                '-vf', vf,
                '-frames:v', '1',
                '-q:v', String(quality), // Lower quality for large files
                '-f', 'image2',
                'pipe:1'
            ];

            const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });

            // Enforce IDLE priority for background generation
            setProcessPriority(ffmpeg, 'idle');

            const chunks = [];
            ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
            ffmpeg.stderr.on('data', () => { }); // Ignore stderr
            ffmpeg.on('error', (err) => {
                console.error('Thumb generation error:', err);
                resolve(null);
            });
            ffmpeg.on('close', (code) => {
                if (code === 0 && chunks.length > 0) {
                    resolve({
                        data: Buffer.concat(chunks).toString('base64'),
                        count: safeCount,
                        cols: cols,
                        rows: rows, // Return grid dimensions for frontend
                        interval: duration / safeCount
                    });
                } else {
                    resolve(null);
                }
            });
        });
    });

    ipcMain.on('start-encode', (event, options) => {
        const {
            input, format, codec, preset, audioCodec, crf, audioBitrate,
            outputSuffix, fps, rateMode, bitrate, twoPass,
            audioTracks, subtitleTracks, chaptersFile, customArgs, outputFolder,
            resolution, workPriority, threads
        } = options;

        // Validate numeric inputs
        const needsBitrate = rateMode === 'bitrate';
        const hasCustomThreads = threads !== null && threads !== undefined && parseInt(threads) !== 0;
        if (!validateNumericInput(crf, 0, 51) ||
            (needsBitrate && !validateNumericInput(bitrate, 50, 50000)) ||
            (hasCustomThreads && !validateNumericInput(threads, 1, 128))) {
            event.reply('encode-error', { message: 'Invalid numeric input parameters' });
            return;
        }

        const outputExt = format;
        const suffix = outputSuffix || '_encoded';
        const filename = input.split(/[\\/]/).pop().replace(/\.[^.]+$/, `${suffix}.${outputExt}`);

        let outputPath;
        if (outputFolder && outputFolder.trim() !== '') {
            // Validate output folder path to prevent directory traversal
            const validatedFolder = validateAndNormalizePath(outputFolder);
            if (!validatedFolder) {
                event.reply('encode-error', { message: 'Invalid output folder path' });
                return;
            }
            outputPath = path.join(validatedFolder, filename);
        } else {
            // Use same as source
            const validatedInput = validateAndNormalizePath(input);
            if (!validatedInput) {
                event.reply('encode-error', { message: 'Invalid input file path' });
                return;
            }
            outputPath = validatedInput.replace(/\.[^.]+$/, `${suffix}.${outputExt}`);
        }

        const args = ['-i', input];
        let inputCount = 1;

        // Add external audio tracks
        const externalAudioIdxs = [];
        if (audioTracks && audioTracks.length > 0) {
            audioTracks.forEach((track, index) => {
                if (track.path) {
                    args.push('-i', track.path);
                    externalAudioIdxs[index] = inputCount;
                    inputCount++;
                }
            });
        }

        // Add external subtitle tracks
        const externalSubtitleIdxs = [];
        if (subtitleTracks && subtitleTracks.length > 0) {
            subtitleTracks.forEach((track, index) => {
                if (track.path) {
                    args.push('-i', track.path);
                    externalSubtitleIdxs[index] = inputCount;
                    inputCount++;
                }
            });
        }

        // Add chapters file
        let chaptersInputIdx = -1;
        if (chaptersFile) {
            args.push('-i', chaptersFile);
            chaptersInputIdx = inputCount;
            inputCount++;
        }

        args.push('-y'); // Overwrite

        args.push('-map', '0:v:0');

        // Map audio
        if (audioCodec === 'none' || (audioTracks && audioTracks.length === 0)) {
            // No audio from any source
            args.push('-an');
        } else {
            // Loop through audioTracks and map them
            audioTracks.forEach((track, index) => {
                if (track.isSource) {
                    args.push('-map', '0:a:0');
                } else if (externalAudioIdxs[index] !== undefined) {
                    args.push('-map', `${externalAudioIdxs[index]}:a`);
                }
            });
        }

        // Map subtitles
        // Map original subtitles
        args.push('-map', '0:s?');
        // Map external subtitles
        if (subtitleTracks && subtitleTracks.length > 0) {
            subtitleTracks.forEach((track, index) => {
                if (externalSubtitleIdxs[index] !== undefined) {
                    args.push('-map', `${externalSubtitleIdxs[index]}:s`);
                }
            });
        }

        // Chapters mapping
        if (chaptersInputIdx !== -1) {
            args.push('-map_metadata', `${chaptersInputIdx}`);
        }

        if (codec === 'copy') {
            args.push('-c:v', 'copy');
        } else {
            // Resolution scale filter (-2 preserves aspect and ensures divisible by 2)
            if (resolution && resolution !== 'source') {
                const scaleHeights = { '4320p': 4320, '2160p': 2160, '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 };
                const h = scaleHeights[resolution];
                if (h) args.push('-vf', `scale=-2:${h}`);
            }
            const vCodecMap = {
                'h264': 'libx264',
                'h265': 'libx265',
                'vp9': 'libvpx-vp9',
                'h264_nvenc': 'h264_nvenc',
                'hevc_nvenc': 'hevc_nvenc',
                'h264_amf': 'h264_amf',
                'hevc_amf': 'hevc_amf',
                'h264_qsv': 'h264_qsv',
                'hevc_qsv': 'hevc_qsv'
            };
            args.push('-c:v', vCodecMap[codec] || 'libx264');

            // Presets
            if (codec.includes('nvenc')) {
                const nvencPresets = {
                    'ultrafast': 'p1', 'superfast': 'p2', 'veryfast': 'p3',
                    'faster': 'p4', 'fast': 'p5', 'medium': 'p6', 'slow': 'p7',
                    'slower': 'p7', 'veryslow': 'p7'
                };
                args.push('-preset', nvencPresets[preset] || 'p4');
            } else if (codec.includes('amf')) {
                const amfQuality = {
                    'ultrafast': 'speed', 'superfast': 'speed', 'veryfast': 'speed',
                    'faster': 'speed', 'fast': 'balanced', 'medium': 'balanced',
                    'slow': 'quality', 'slower': 'quality', 'veryslow': 'quality'
                };
                args.push('-quality', amfQuality[preset] || 'balanced');
            } else {
                args.push('-preset', preset);
            }

            // Rate Control
            if (rateMode === 'bitrate') {
                args.push('-b:v', `${bitrate}k`);
                // For average bitrate, we often want a max bitrate or buffer too, but simplified for now
            } else {
                args.push('-crf', crf.toString());
            }

            // FPS
            if (fps && fps !== 'source') {
                args.push('-r', fps);
            }
        }

        if (audioCodec !== 'none') {
            if (audioCodec === 'copy') {
                args.push('-c:a', 'copy');
            } else {
                const aCodecMap = {
                    'aac': 'aac',
                    'opus': 'libopus',
                    'mp3': 'libmp3lame',
                    'ac3': 'ac3',
                    'flac': 'flac',
                    'pcm_s16le': 'pcm_s16le'
                };
                args.push('-c:a', aCodecMap[audioCodec] || 'aac');
                args.push('-b:a', audioBitrate);
            }
        }

        // Subtitle codec (default to copy for simplicity, or mov_text/srt based on format)
        if (format === 'mp4' || format === 'mov') {
            args.push('-c:s', 'mov_text');
        } else {
            args.push('-c:s', 'copy'); // MKV handles most subs as copy
        }

        // Output Threads
        if (threads && threads > 0) {
            args.push('-threads', threads.toString());
        }

        // Advanced custom args
        if (customArgs) {
            const cArgs = customArgs.split(' ').filter(arg => arg.trim() !== '');
            args.push(...cArgs);
        }

        args.push(outputPath);

        console.log('Running FFmpeg with args:', args.join(' '));

        currentFfmpegProcess = spawn(FFMPEG_PATH, args);


        setProcessPriority(currentFfmpegProcess, workPriority || 'normal');

        currentOutputPath = outputPath;
        let durationInSeconds = 0;

        currentFfmpegProcess.stderr.on('data', (data) => {
            const str = data.toString();

            if (!durationInSeconds) {
                const durMatch = str.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.\d{2}/);
                if (durMatch) {
                    durationInSeconds = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3]);
                }
            }

            const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/);
            const speedMatch = str.match(/speed=\s*(\d+\.?\d*x)/);

            if (timeMatch && durationInSeconds) {
                const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
                const percent = Math.min(99, Math.round((currentTime / durationInSeconds) * 100));

                event.reply('encode-progress', {
                    percent,
                    time: timeMatch[1] + ':' + timeMatch[2] + ':' + timeMatch[3],
                    speed: speedMatch ? speedMatch[1] : '0.00x'
                });
            }
        });

        currentFfmpegProcess.on('close', (code) => {
            currentFfmpegProcess = null;
            currentOutputPath = null;
            if (isCancelling) {
                isCancelling = false;
                event.reply('encode-cancelled');
                return;
            }
            if (code === 0) {
                event.reply('encode-complete', { outputPath });
            } else {
                event.reply('encode-error', { message: `FFmpeg exited with code ${code}` });
            }
        });
    });


    ipcMain.on('extract-audio', (event, options) => {
        const { input, format, bitrate, workPriority } = options;
        const extMap = { mp3: 'mp3', aac: 'm4a', flac: 'flac', wav: 'wav', ogg: 'ogg', opus: 'opus' };
        const ext = extMap[format] || 'mp3';
        const baseName = input.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
        const outputPath = input.replace(/\.[^.]+$/, `_audio.${ext}`);

        const codecMap = {
            mp3: ['libmp3lame', bitrate || '192k'],
            aac: ['aac', bitrate || '192k'],
            flac: ['flac', null],
            wav: ['pcm_s16le', null],
            ogg: ['libvorbis', bitrate || '192k'],
            opus: ['libopus', bitrate || '128k']
        };
        const [aCodec, aBitrate] = codecMap[format] || codecMap.mp3;
        const args = ['-y', '-i', input, '-vn', '-c:a', aCodec];
        if (aBitrate) args.push('-b:a', aBitrate);
        args.push(outputPath);

        currentFfmpegProcess = spawn(FFMPEG_PATH, args);


        setProcessPriority(currentFfmpegProcess, workPriority || 'normal');

        currentOutputPath = outputPath;
        let durationInSeconds = 0;
        currentFfmpegProcess.stderr.on('data', (data) => {
            const str = data.toString();
            if (!durationInSeconds) {
                const durMatch = str.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.\d{2}/);
                if (durMatch) {
                    durationInSeconds = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3]);
                }
            }
            const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/);
            const speedMatch = str.match(/speed=\s*(\d+\.?\d*x)/);
            if (timeMatch && durationInSeconds) {
                const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
                const percent = Math.min(99, Math.round((currentTime / durationInSeconds) * 100));
                event.reply('encode-progress', {
                    percent,
                    time: timeMatch[1] + ':' + timeMatch[2] + ':' + timeMatch[3],
                    speed: speedMatch ? speedMatch[1] : '0.00x'
                });
            }
        });
        currentFfmpegProcess.on('close', (code) => {
            currentFfmpegProcess = null;
            currentOutputPath = null;
            if (isCancelling) {
                isCancelling = false;
                event.reply('encode-cancelled');
                return;
            }
            if (code === 0) {
                event.reply('encode-complete', { outputPath });
            } else {
                event.reply('encode-error', { message: `FFmpeg exited with code ${code}` });
            }
        });
    });

    ipcMain.on('trim-video', (event, options) => {
        const { input, startSeconds, endSeconds, outputFolder, workPriority } = options;
        const start = Math.max(0, startSeconds);
        const end = Math.max(start + 1, endSeconds);
        const baseName = input.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
        const outputPath = outputFolder && outputFolder.trim()
            ? path.join(outputFolder, `${baseName}_trimmed.mp4`)
            : input.replace(/\.[^.]+$/, '_trimmed.mp4');

        const duration = end - start;
        const args = ['-y', '-ss', start.toString(), '-i', input, '-t', duration.toString(), '-c', 'copy', outputPath];
        currentFfmpegProcess = spawn(FFMPEG_PATH, args);


        setProcessPriority(currentFfmpegProcess, workPriority || 'normal');

        currentOutputPath = outputPath;
        let durationInSeconds = end - start;
        currentFfmpegProcess.stderr.on('data', (data) => {
            const str = data.toString();
            const timeMatch = str.match(/time=(\d+\.?\d*)/);
            if (timeMatch && durationInSeconds > 0) {
                const currentTime = parseFloat(timeMatch[1]);
                const percent = Math.min(99, Math.round((currentTime / durationInSeconds) * 100));
                const t = Math.floor(currentTime);
                const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
                const timeStr = [h, m, s].map(n => n.toString().padStart(2, '0')).join(':');
                event.reply('encode-progress', { percent, time: timeStr, speed: 'N/A' });
            }
        });
        currentFfmpegProcess.on('close', (code) => {
            currentFfmpegProcess = null;
            currentOutputPath = null;
            if (isCancelling) {
                isCancelling = false;
                event.reply('encode-cancelled');
                return;
            }
            if (code === 0) {
                event.reply('encode-complete', { outputPath });
            } else {
                event.reply('encode-error', { message: `FFmpeg exited with code ${code}` });
            }
        });
    });

    ipcMain.on('cancel-encode', () => {
        if (currentFfmpegProcess) {
            isCancelling = true;
            // Capture path before kill triggers close handler which clears it
            const pathToDelete = currentOutputPath;

            currentFfmpegProcess.kill();
            currentFfmpegProcess = null;

            // Delete incomplete output file
            if (pathToDelete) {
                // Wait slightly for file lock to release
                setTimeout(() => {
                    fs.unlink(pathToDelete, (err) => {
                        if (err && err.code !== 'ENOENT') {
                            console.error('Error deleting cancelled output:', err);
                        } else {
                            console.log('Deleted cancelled output:', pathToDelete);
                        }
                    });
                }, 500);
            }
        }
    });

    ipcMain.on('open-file', (event, path) => shell.openPath(path));
    ipcMain.on('open-folder', (event, path) => shell.showItemInFolder(path));

    ipcMain.on('open-external', (event, url) => {
        shell.openExternal(url);
    });

    // Get video info (title, thumbnail, duration) using yt-dlp
    ipcMain.handle('get-video-info', async (event, url, options = {}) => {
        // Validate URL format to prevent command injection
        if (!validateUrl(url)) {
            return { error: 'Invalid URL format' };
        }

        const YT_DLP_PATH = app.isPackaged
            ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe')
            : path.join(__dirname, 'bin', 'yt-dlp.exe');

        const fs = require('fs');
        if (!fs.existsSync(YT_DLP_PATH)) {
            return { error: 'yt-dlp not found' };
        }

        return new Promise((resolve) => {
            const args = [
                '--dump-json',
                '--no-download',
                '--no-warnings',
                '--restrict-filenames',  // Prevent unsafe filename issues
                '--user-agent', USER_AGENT,
                url
            ];

            if (!options.disableFlatPlaylist) {
                args.push('--flat-playlist');
            }

            const proc = spawn(YT_DLP_PATH, args, {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0 && stdout) {
                    try {
                        // Attempt to parse strictly first
                        let info;
                        try {
                            info = JSON.parse(stdout);
                        } catch (e) {
                            // If strict parse fails, try NDJSON (Newlines Delimited JSON)
                            // This handles cases where yt-dlp outputs multiple lines of JSON
                            const lines = stdout.trim().split('\n');
                            if (lines.length > 1) {
                                // It might be a list of video objects/entries
                                // We can try to construct a pseudo-playlist object from them
                                const entries = [];
                                let firstInfo = null;

                                for (const line of lines) {
                                    try {
                                        const entry = JSON.parse(line);
                                        entries.push(entry);
                                        if (!firstInfo) firstInfo = entry;
                                    } catch (lineErr) {
                                        console.warn('Skipping invalid JSON line:', lineErr);
                                    }
                                }

                                if (entries.length > 0) {
                                    info = {
                                        _type: 'playlist',
                                        title: firstInfo.playlist_title || firstInfo.title || 'Unknown Playlist',
                                        isPlaylist: true,
                                        count: entries.length,
                                        entries: entries
                                    };
                                } else {
                                    throw e; // Re-throw original error if no valid lines found
                                }
                            } else {
                                throw e; // Single line but invalid JSON
                            }
                        }

                        if (info._type === 'playlist') {
                            resolve({
                                isPlaylist: true,
                                title: info.title || 'Unknown Playlist',
                                count: info.entries ? info.entries.length : 0,
                                entries: info.entries || []
                            });
                        } else {
                            resolve({
                                isPlaylist: false,
                                title: info.title || 'Unknown Title',
                                thumbnail: info.thumbnail || null,
                                duration: info.duration ? formatDuration(info.duration) : '--:--',
                                channel: info.uploader || info.channel || 'Unknown',
                                isVideo: info.vcodec !== 'none',
                                formats: info.formats || [],
                                url: url
                            });
                        }
                    } catch (e) {
                        console.error('JSON parse error:', e);
                        // Return the first 100 chars of stdout to see what we got
                        const preview = stdout.trim().substring(0, 100).replace(/\n/g, ' ');
                        resolve({ error: `Failed to parse video info. Output start: "${preview}..."` });
                    }
                } else {
                    resolve({ error: stderr || 'Failed to get video info' });
                }
            });
        });
    });

    /**
     * Parse download progress line and emit progress event
     * Extracted for performance: reduces handler complexity and allows reuse
     */
    function parseDownloadProgress(line, event, currentDownloadPath) {
        const str = line.trim();
        if (!str) return currentDownloadPath;
        console.log('yt-dlp stdout:', str);

        // Parse progress - handle more variations (including ~ estimated size)
        const progressMatch = str.match(/\[download\]\s+(\d+\.?\d*)%/);
        const sizeMatch = str.match(/of\s+~?(\d+\.?\d*[KMG]iB)/) || str.match(/\[download\]\s+Total:\s+(\d+\.?\d*[KMG]iB)/);
        const speedMatch = str.match(/at\s+(\d+\.?\d*[KMG]iB\/s)/);
        const etaMatch = str.match(/ETA\s+(\d{2}:\d{2})/);

        const destMatch = str.match(/Destination:\s+(.*)/) ||
            str.match(/Already downloaded:\s+(.*)/) ||
            str.match(/\[download\]\s+(.*)\s+has already been downloaded/) ||
            str.match(/\[Merger\]\s+Merging\s+formats\s+into\s+"(.*)"/);
        if (destMatch && !destMatch[1].includes('...')) {
            currentDownloadPath = destMatch[1];
        }

        // Enhanced status updates: Capture any [] tag that isn't just [download] progress
        let status = null;
        const tagMatch = str.match(/^\[([^\]]+)\]/m);
        if (tagMatch) {
            const tag = tagMatch[1];
            if (tag === 'download' && !progressMatch) {
                // It's a [download] line but not progress (e.g. Destination)
                if (str.includes('Destination:')) status = 'Creating file...';
            } else if (tag !== 'download') {
                // Map common tags to friendly names, or use the tag itself
                if (tag === 'Merger') status = 'Merging formats...';
                else if (tag === 'ExtractAudio') status = 'Extracting audio...';
                else if (tag === 'info') {
                    if (str.includes('Downloading webpage')) status = 'Connecting...';
                    else if (str.includes('Downloading m3u8')) status = 'Preparing stream...';
                    else status = 'Extracting metadata...';
                }
                else if (tag === 'dashsegments') status = 'Downloading segments...';
                else if (tag === 'hlsnative') status = 'Downloading segments...';
                else if (tag.startsWith('Fixup')) status = 'Fixing container...';
                else status = `${tag}...`;
            }
        }

        if (progressMatch) {
            event.reply('download-progress', {
                percent: parseFloat(progressMatch[1]),
                size: sizeMatch ? sizeMatch[1] : null,
                speed: speedMatch ? speedMatch[1] : null,
                eta: etaMatch ? etaMatch[1] : null,
                status: status || 'Downloading...'
            });
        } else if (status) {
            event.reply('download-progress', { status: status });
        }

        return currentDownloadPath;
    }

    function formatDuration(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    ipcMain.on('download-video', async (event, options) => {
        try {
            // Validate URL format to prevent command injection
            if (!validateUrl(options.url)) {
                event.reply('download-error', { message: 'Invalid URL format' });
                return;
            }

            const { url, mode, quality, format, audioFormat, audioBitrate, fps, videoBitrate, videoCodec } = options;

            // Path to bin folder and executables
            const BIN_PATH = app.isPackaged
                ? path.join(process.resourcesPath, 'bin')
                : path.join(__dirname, 'bin');
            const YT_DLP_PATH = path.join(BIN_PATH, 'yt-dlp.exe');
            const FFMPEG_PATH = path.join(BIN_PATH, 'ffmpeg.exe');

            // Use default output folder or Downloads
            const outputFolder = global.userSettings?.outputFolder || app.getPath('downloads');

            // Validate output folder path
            const validatedFolder = validateAndNormalizePath(outputFolder);
            if (!validatedFolder) {
                event.reply('download-error', { message: 'Invalid output folder path' });
                return;
            }

            // Ensure yt-dlp exists
            const fs = require('fs');
            if (!fs.existsSync(YT_DLP_PATH)) {
                event.reply('download-error', { message: 'yt-dlp.exe not found in bin folder.' });
                return;
            }

            const args = [];

            // Output template - use safe filename from user input
            let outputTemplate;
            let safeFileName = null;
            if (options.fileName) {
                safeFileName = getSafeFileName(options.fileName);
                outputTemplate = path.join(validatedFolder, safeFileName + '.%(ext)s');
            } else {
                outputTemplate = path.join(validatedFolder, '%(title)s.%(ext)s');
            }

            args.push('-o', outputTemplate);
            args.push('--restrict-filenames'); // Prevent unsafe filename issues

            if (fs.existsSync(FFMPEG_PATH)) {
                args.push('--ffmpeg-location', FFMPEG_PATH);
            }

            // Format selection
            if (mode === 'audio') {
                args.push('-x', '--audio-format', audioFormat || 'mp3');
                if (audioBitrate) {
                    args.push('--audio-quality', audioBitrate);
                }
            } else {
                // Video + Audio
                if (format === 'mp4') args.push('--merge-output-format', 'mp4');
                else if (format === 'mkv') args.push('--merge-output-format', 'mkv');
                else if (format === 'mov') args.push('--merge-output-format', 'mov');
                else if (format === 'webm') args.push('--merge-output-format', 'webm');

                // Quality selection
                if (options.formatId) {
                    // If a specific format ID is selected, use it.
                    // For video, we try to append +bestaudio if it's likely a video-only format
                    if (mode === 'video' && !options.formatId.includes('+')) {
                        args.push('-f', `${options.formatId}+bestaudio/best`);
                    } else {
                        args.push('-f', options.formatId);
                    }
                } else if (quality === 'best') {
                    args.push('-f', 'bestvideo+bestaudio/best');
                } else {
                    // e.g. height <= 1080
                    args.push('-f', `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`);
                }

                // Post-processing with FFmpeg (if any option is not default)
                const needsReencode = (fps && fps !== 'none') || (videoBitrate && videoBitrate !== 'none') || (videoCodec && videoCodec !== 'copy');

                if (needsReencode) {
                    const ffmpegArgs = [];

                    // Video codec - validate against whitelist
                    const validCodecs = ['h264', 'h265', 'vp9', 'av1', 'copy'];
                    if (videoCodec && validCodecs.includes(videoCodec) && videoCodec !== 'copy') {
                        if (videoCodec === 'h264') ffmpegArgs.push('-c:v', 'libx264');
                        else if (videoCodec === 'h265') ffmpegArgs.push('-c:v', 'libx265');
                        else if (videoCodec === 'vp9') ffmpegArgs.push('-c:v', 'libvpx-vp9');
                        else if (videoCodec === 'av1') ffmpegArgs.push('-c:v', 'libaom-av1');
                    } else {
                        ffmpegArgs.push('-c:v', 'copy');
                    }

                    // Video bitrate - validate format (should be like "5000k" or "5M")
                    if (videoBitrate && videoBitrate !== 'none' && /^\d+[kKmM]$/.test(videoBitrate)) {
                        ffmpegArgs.push('-b:v', videoBitrate);
                    }

                    // FPS limit - validate numeric format
                    if (fps && fps !== 'none' && /^\d+(\.\d+)?$/.test(fps)) {
                        ffmpegArgs.push('-r', fps);
                    }

                    // Audio copy
                    ffmpegArgs.push('-c:a', 'copy');

                    if (ffmpegArgs.length > 0) {
                        args.push('--postprocessor-args', `ffmpeg:${ffmpegArgs.join(' ')}`);
                    }
                }
            }

            args.push('--progress', '--newline', '--no-cache-dir', '--no-check-certificates', '--force-ipv4');
            args.push('--force-overwrites', '--postprocessor-args', 'ffmpeg:-y');
            args.push('--user-agent', USER_AGENT);
            args.push(url);

            console.log('Running yt-dlp:', args.join(' '));
            event.reply('download-progress', { status: 'Process initialized...' });

            const proc = spawn(YT_DLP_PATH, args, {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                windowsHide: true
            });
            let currentDownloadPath = null;
            let stdoutBuffer = '';
            let stderrBuffer = '';

            proc.on('error', (err) => {
                console.error('Spawn error:', err);
                event.reply('download-error', { message: `Process failure: ${err.message}` });
            });

            proc.stdout.on('data', (data) => {
                const chunk = data.toString();
                // Prevent unbounded buffer growth - keep only last 1MB if exceeding limit
                if (stdoutBuffer.length + chunk.length > MAX_BUFFER_SIZE) {
                    stdoutBuffer = stdoutBuffer.slice(-512 * 1024) + chunk;
                } else {
                    stdoutBuffer += chunk;
                }

                const lines = stdoutBuffer.split(/\r?\n/);
                stdoutBuffer = lines.pop();

                for (const line of lines) {
                    const updatedPath = parseDownloadProgress(line, event, currentDownloadPath);
                    if (updatedPath) currentDownloadPath = updatedPath;
                }
            });

            proc.stderr.on('data', (data) => {
                const chunk = data.toString();
                // Prevent unbounded buffer growth
                if (stderrBuffer.length + chunk.length > MAX_BUFFER_SIZE) {
                    stderrBuffer = stderrBuffer.slice(-512 * 1024) + chunk;
                } else {
                    stderrBuffer += chunk;
                }

                const lines = stderrBuffer.split(/\r?\n/);
                stderrBuffer = lines.pop();

                for (const line of lines) {
                    const errStr = line.trim();
                    if (!errStr) continue;
                    console.error('yt-dlp stderr:', errStr);
                    if (errStr.includes('ERROR:')) {
                        event.reply('download-progress', { status: `Error: ${errStr.split('ERROR:')[1].trim()}` });
                    } else {
                        // Send other stderr lines as status if they look like progress/info
                        event.reply('download-progress', { status: errStr.substring(0, 50) });
                    }
                }
            });

            let isCancelled = false;

            const cancelHandler = () => {
                isCancelled = true;
                if (process.platform === 'win32') {
                    // Robust process-tree kill for Windows to ensure ffmpeg is also stopped
                    try {
                        spawn('taskkill', ['/F', '/T', '/PID', proc.pid.toString()]);
                    } catch (e) {
                        proc.kill();
                    }
                } else {
                    proc.kill();
                }
            };

            ipcMain.on('cancel-download', cancelHandler);

            proc.on('close', (code) => {
                ipcMain.removeListener('cancel-download', cancelHandler);

                if (isCancelled) {
                    // Cleanup with delay
                    setTimeout(() => {
                        try {
                            if (currentDownloadPath) {
                                const base = currentDownloadPath.replace(/\.[^/.]+$/, "");
                                const potentialFiles = [
                                    currentDownloadPath,
                                    currentDownloadPath + '.part',
                                    currentDownloadPath + '.ytdl',
                                    currentDownloadPath + '.temp',
                                    base + '.part',
                                    base + '.ytdl',
                                    base + '.temp',
                                    base + '.f137', // Example format fragments
                                    base + '.f140',
                                    base + '.f251',
                                    base + '.f248'
                                ];

                                potentialFiles.forEach(file => {
                                    if (fs.existsSync(file)) {
                                        try { fs.unlinkSync(file); } catch (e) { /* ignore locked files */ }
                                    }
                                });

                                // Also try glob-like cleanup for any .part or .temp with same base
                                const dir = path.dirname(currentDownloadPath);
                                const filename = path.basename(base);
                                if (fs.existsSync(dir)) {
                                    const files = fs.readdirSync(dir);
                                    files.forEach(f => {
                                        if (f.startsWith(filename) && (f.endsWith('.part') || f.endsWith('.temp') || f.endsWith('.ytdl') || /\.f\d+$/.test(f))) {
                                            try { fs.unlinkSync(path.join(dir, f)); } catch (e) { }
                                        }
                                    });
                                }
                            } else if (safeFileName && fs.existsSync(outputFolder)) {
                                const files = fs.readdirSync(outputFolder);
                                files.forEach(f => {
                                    if (f.startsWith(safeFileName) && (f.endsWith('.part') || f.endsWith('.temp') || f.endsWith('.ytdl') || /\.f\d+$/.test(f))) {
                                        try { fs.unlinkSync(path.join(outputFolder, f)); } catch (e) { }
                                    }
                                });
                            }
                        } catch (e) { console.error(e); }
                    }, 1000);
                    return;
                }

                if (code === 0) {
                    event.reply('download-complete', { outputPath: currentDownloadPath || outputFolder });
                } else {
                    event.reply('download-error', { message: `Process exited with code ${code}` });
                }
            });
        } catch (err) {
            console.error('IPC handler crash:', err);
            event.reply('download-error', { message: `Backend crash: ${err.message}` });
        }
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});