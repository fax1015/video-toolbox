const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');

// Set application name and App User Model ID for Windows
app.setName('Video Toolbox');
if (process.platform === 'win32') {
    app.setAppUserModelId('com.fax1015.videotoolbox');
}

// Remove the default menu
Menu.setApplicationMenu(null);


const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const FFMPEG_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(__dirname, 'bin', 'ffmpeg.exe');
let currentFfmpegProcess = null;

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
            nodeIntegration: false
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

    // IPC Handlers
    ipcMain.handle('select-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'] }]
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('select-folder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openDirectory']
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('list-files', async (event, folderPath) => {
        try {
            const files = await fs.promises.readdir(folderPath);
            const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'];
            return files
                .filter(file => videoExtensions.includes(path.extname(file).toLowerCase()))
                .map(file => path.join(folderPath, file));
        } catch (err) {
            console.error('Error listing files:', err);
            return [];
        }
    });

    ipcMain.handle('get-encoders', async () => {
        return new Promise((resolve) => {
            const ffmpeg = spawn(FFMPEG_PATH, ['-encoders']);
            let output = '';
            ffmpeg.stdout.on('data', (data) => output += data.toString());
            ffmpeg.on('close', () => {
                const encoders = {
                    nvenc: output.includes('nvenc'),
                    amf: output.includes('amf'),
                    qsv: output.includes('qsv')
                };
                resolve(encoders);
            });
        });
    });

    ipcMain.handle('get-metadata', async (event, filePath) => {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn(FFMPEG_PATH, ['-i', filePath]);
            let output = '';
            ffprobe.stderr.on('data', (data) => output += data.toString());
            ffprobe.on('close', () => {
                const metadata = {
                    resolution: 'Unknown',
                    duration: '00:00:00',
                    bitrate: '0 kbps'
                };

                const resMatch = output.match(/Stream #.*Video:.* (\d+x\d+)/);
                if (resMatch) metadata.resolution = resMatch[1];

                const durMatch = output.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
                if (durMatch) metadata.duration = durMatch[1].split('.')[0];

                const bitMatch = output.match(/bitrate: (\d+ kb\/s)/);
                if (bitMatch) metadata.bitrate = bitMatch[1];

                resolve(metadata);
            });
        });
    });

    ipcMain.on('start-encode', (event, options) => {
        const { input, format, codec, preset, audioCodec, crf, audioBitrate, outputSuffix } = options;
        const outputExt = format;
        const suffix = outputSuffix || '_encoded';
        const outputPath = input.replace(/\.[^.]+$/, `${suffix}.${outputExt}`);

        const args = ['-i', input, '-y'];

        // Video codec
        if (codec === 'copy') {
            args.push('-c:v', 'copy');
        } else {
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

            // Map presets for different encoders
            if (codec.includes('nvenc')) {
                // NVENC presets: p1 (fastest) to p7 (slowest) or legacy slow/medium/fast
                // We'll try to map common names to p1-p7 for better compatibility
                const nvencPresets = {
                    'ultrafast': 'p1', 'superfast': 'p2', 'veryfast': 'p3',
                    'faster': 'p4', 'fast': 'p5', 'medium': 'p6', 'slow': 'p7',
                    'slower': 'p7', 'veryslow': 'p7'
                };
                args.push('-preset', nvencPresets[preset] || 'p4');
            } else if (codec.includes('amf')) {
                // AMF uses -quality
                const amfQuality = {
                    'ultrafast': 'speed', 'superfast': 'speed', 'veryfast': 'speed',
                    'faster': 'speed', 'fast': 'balanced', 'medium': 'balanced',
                    'slow': 'quality', 'slower': 'quality', 'veryslow': 'quality'
                };
                args.push('-quality', amfQuality[preset] || 'balanced');
            } else if (codec.includes('qsv')) {
                // QSV uses -preset (similar to x264)
                args.push('-preset', preset);
            } else {
                // Software encoders (libx264, libx265, vp9)
                args.push('-preset', preset);
            }

            args.push('-crf', crf.toString());
        }

        // Audio codec
        if (audioCodec === 'none') {
            args.push('-an');
        } else if (audioCodec === 'copy') {
            args.push('-c:a', 'copy');
        } else {
            const aCodecMap = { 'aac': 'aac', 'opus': 'libopus' };
            args.push('-c:a', aCodecMap[audioCodec] || 'aac');
            args.push('-b:a', audioBitrate);
        }

        args.push(outputPath);

        // Advanced custom args
        if (options.customArgs) {
            const customArgs = options.customArgs.split(' ').filter(arg => arg.trim() !== '');
            // Insert custom args before output path (at the end but before outputPath)
            args.splice(args.length - 1, 0, ...customArgs);
        }

        currentFfmpegProcess = spawn(FFMPEG_PATH, args);

        let durationInSeconds = 0;

        currentFfmpegProcess.stderr.on('data', (data) => {
            const str = data.toString();

            // Get duration if not already set
            if (!durationInSeconds) {
                const durMatch = str.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.\d{2}/);
                if (durMatch) {
                    durationInSeconds = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseInt(durMatch[3]);
                }
            }

            // Parse progress
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
            if (code === 0) {
                event.reply('encode-complete', { outputPath });
            } else {
                event.reply('encode-error', { message: `FFmpeg exited with code ${code}` });
            }
        });
    });

    ipcMain.on('cancel-encode', () => {
        if (currentFfmpegProcess) {
            currentFfmpegProcess.kill();
        }
    });

    ipcMain.on('open-file', (event, path) => shell.openPath(path));
    ipcMain.on('open-folder', (event, path) => shell.showItemInFolder(path));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
