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
const os = require('os');

const FFMPEG_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(__dirname, 'bin', 'ffmpeg.exe');
let currentFfmpegProcess = null;

/**
 * Set process priority for FFmpeg based on user setting
 * @param {ChildProcess} process - The FFmpeg process
 * @param {string} priority - Priority level: 'idle', 'low', 'normal', 'high'
 */
function setProcessPriority(process, priority = 'normal') {
    if (!process || !process.pid) return;

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
            ffmpeg.stderr.on('data', (data) => output += data.toString());
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

    ipcMain.handle('get-audio-waveform', async (event, filePath) => {
        return new Promise((resolve) => {
            const args = [
                '-y', '-i', filePath,
                '-filter_complex', '[0:a]aformat=channel_layouts=mono,showwavespic=s=800x60:colors=0x63f1af',
                '-frames:v', '1', '-f', 'image2', 'pipe:1'
            ];
            const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            const chunks = [];
            ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
            ffmpeg.stderr.on('data', () => {});
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

    ipcMain.on('start-encode', (event, options) => {
        const {
            input, format, codec, preset, audioCodec, crf, audioBitrate,
            outputSuffix, fps, rateMode, bitrate, twoPass,
            audioTracks, subtitleTracks, chaptersFile, customArgs, outputFolder,
            resolution, workPriority
        } = options;

        const outputExt = format;
        const suffix = outputSuffix || '_encoded';
        const filename = input.split(/[\\/]/).pop().replace(/\.[^.]+$/, `${suffix}.${outputExt}`);
        
        let outputPath;
        if (outputFolder && outputFolder.trim() !== '') {
            // Use custom output folder
            outputPath = path.join(outputFolder, filename);
        } else {
            // Use same as source
            outputPath = input.replace(/\.[^.]+$/, `${suffix}.${outputExt}`);
        }

        // Construct input arguments
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

        // Mapping logic
        // Map original video (Input 0, Video 0)
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

        // Video settings
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

        // Audio codec
        if (audioCodec !== 'none') {
            if (audioCodec === 'copy') {
                args.push('-c:a', 'copy');
            } else {
                const aCodecMap = { 'aac': 'aac', 'opus': 'libopus' };
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

        // Advanced custom args
        if (customArgs) {
            const cArgs = customArgs.split(' ').filter(arg => arg.trim() !== '');
            args.push(...cArgs);
        }

        args.push(outputPath);

        console.log('Running FFmpeg with args:', args.join(' '));

        currentFfmpegProcess = spawn(FFMPEG_PATH, args);
        
        // Set process priority based on user setting
        setProcessPriority(currentFfmpegProcess, workPriority || 'normal');

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
        
        // Set process priority based on user setting
        setProcessPriority(currentFfmpegProcess, workPriority || 'normal');
        
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
        
        // Set process priority based on user setting
        setProcessPriority(currentFfmpegProcess, workPriority || 'normal');
        
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