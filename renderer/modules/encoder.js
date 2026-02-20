// Video Encoder Module

import { get, showPopup, showConfirm, showView, renderAudioTracks, renderSubtitleTracks, resetNav, animateAutoHeight } from './ui-utils.js';
import * as state from './state.js';
import { addToQueue, updateQueueUI, formatPresetName } from './queue.js';
import { BUILT_IN_PRESETS } from '../constants.js';

let isApplyingPreset = false;
const CUSTOM_PRESETS_KEY = 'custom_presets';

function loadCustomPresets() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || '{}');
    } catch (err) {
        console.warn('Failed to load custom presets:', err);
        return {};
    }
}

function saveCustomPresets(presets) {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

function getPresetSettingsFromUI() {
    const options = getOptionsFromUI();
    let baseCodec = options.codec || 'h264';
    if (baseCodec.includes('_')) baseCodec = baseCodec.split('_')[0];
    if (baseCodec === 'hevc') baseCodec = 'h265';

    return {
        format: options.format,
        codec: baseCodec,
        preset: options.preset,
        resolution: options.resolution,
        fps: options.fps,
        rateMode: options.rateMode,
        crf: options.crf,
        bitrate: options.bitrate,
        twoPass: options.twoPass,
        audioCodec: options.audioCodec,
        audioBitrate: options.audioBitrate
    };
}

function renderCustomPresetList(customPresets) {
    const list = get('custom-presets-list');
    if (!list) return;

    const names = Object.keys(customPresets);
    if (names.length === 0) {
        list.innerHTML = '<div class="preset-empty">No custom presets</div>';
        return;
    }

    list.innerHTML = names.map(name => `
        <div class="preset-item dropdown-item" data-custom-preset="${name}">
            ${name}
            <button class="preset-remove" type="button" data-delete-preset="${name}">×</button>
        </div>
    `).join('');

    list.querySelectorAll('[data-delete-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = btn.dataset.deletePreset;
            if (!key) return;
            delete customPresets[key];
            saveCustomPresets(customPresets);
            renderCustomPresetList(customPresets);
        });
    });
}

export function getEffectiveCodec() {
    const codecSelect = get('codec-select');
    const baseCodec = codecSelect ? codecSelect.value : 'h264';
    if (baseCodec === 'copy') return 'copy';

    let accel = state.appSettings.hwAccel;
    if (accel === 'auto') {
        accel = getAutoEncoder();
    }

    if (accel !== 'none') {
        if (baseCodec === 'h264') return `h264_${accel}`;
        if (baseCodec === 'h265') return `hevc_${accel}`;
    }
    return baseCodec;
}

function getAutoEncoder() {
    if (state.detectedEncoders.nvenc) return 'nvenc';
    if (state.detectedEncoders.amf) return 'amf';
    if (state.detectedEncoders.qsv) return 'qsv';
    return 'none';
}

export function getOptionsFromUI() {
    const formatSelect = get('format-select');
    const codecSelect = get('codec-select');
    const presetSelect = get('preset-select');
    const resolutionSelect = get('resolution-select');
    const fpsSelect = get('fps-select');
    const crfSlider = get('crf-slider');
    const vBitrateInput = get('v-bitrate');
    const twoPassCheckbox = get('two-pass');
    const audioSelect = get('audio-select');
    const audioBitrateSelect = get('audio-bitrate');
    const customFfmpegArgs = get('custom-ffmpeg-args');
    const outputFolderInput = get('output-folder');

    const rateMode = document.querySelector('input[name="rate-mode"]:checked')?.value || 'crf';

    return {
        input: state.currentFilePath,
        format: formatSelect ? formatSelect.value : state.appSettings.defaultFormat,
        codec: getEffectiveCodec(),
        preset: presetSelect ? presetSelect.value : 'medium',
        resolution: resolutionSelect ? resolutionSelect.value : 'source',
        fps: fpsSelect ? fpsSelect.value : 'source',
        rateMode: rateMode,
        crf: crfSlider ? parseInt(crfSlider.value) : 23,
        bitrate: vBitrateInput ? vBitrateInput.value : '2500',
        twoPass: twoPassCheckbox ? twoPassCheckbox.checked : false,
        audioCodec: audioSelect ? audioSelect.value : 'aac',
        audioBitrate: audioBitrateSelect ? audioBitrateSelect.value : '192k',
        audioTracks: [...state.audioTracks],
        subtitleTracks: [...state.subtitleTracks],
        chaptersFile: state.chaptersFile,
        outputSuffix: state.appSettings.outputSuffix,
        outputFolder: outputFolderInput ? outputFolderInput.value : '',
        customArgs: customFfmpegArgs ? customFfmpegArgs.value : '',
        workPriority: state.appSettings.workPriority || 'normal',
        threads: state.appSettings.cpuThreads || 0
    };
}

export function applyOptionsToUI(options) {
    if (!options) return;

    const formatSelect = get('format-select');
    const codecSelect = get('codec-select');
    const presetSelect = get('preset-select');
    const resolutionSelect = get('resolution-select');
    const fpsSelect = get('fps-select');
    const crfSlider = get('crf-slider');
    const crfValue = get('crf-value');
    const vBitrateInput = get('v-bitrate');
    const twoPassCheckbox = get('two-pass');
    const audioSelect = get('audio-select');
    const audioBitrateSelect = get('audio-bitrate');
    const customFfmpegArgs = get('custom-ffmpeg-args');
    const outputFolderInput = get('output-folder');

    isApplyingPreset = true;

    if (formatSelect && options.format) formatSelect.value = options.format;

    let baseCodec = options.codec || 'h264';
    if (baseCodec.includes('_')) baseCodec = baseCodec.split('_')[0];
    if (baseCodec === 'hevc') baseCodec = 'h265';
    if (codecSelect) codecSelect.value = baseCodec;

    if (presetSelect && options.preset) presetSelect.value = options.preset;
    if (resolutionSelect) resolutionSelect.value = options.resolution || 'source';
    if (fpsSelect) fpsSelect.value = options.fps || 'source';

    const rateMode = options.rateMode || 'crf';
    const rateInput = document.querySelector(`input[name="rate-mode"][value="${rateMode}"]`);
    if (rateInput) {
        rateInput.checked = true;
        rateInput.dispatchEvent(new Event('change'));
    }

    if (crfSlider && options.crf !== undefined && options.crf !== null) {
        crfSlider.value = options.crf;
        if (crfValue) crfValue.textContent = options.crf;
    }

    if (vBitrateInput && options.bitrate) vBitrateInput.value = options.bitrate;
    if (twoPassCheckbox) twoPassCheckbox.checked = !!options.twoPass;

    if (audioSelect && options.audioCodec) audioSelect.value = options.audioCodec;
    if (audioBitrateSelect && options.audioBitrate) audioBitrateSelect.value = options.audioBitrate;

    if (customFfmpegArgs) customFfmpegArgs.value = options.customArgs || '';
    if (outputFolderInput) outputFolderInput.value = options.outputFolder || '';

    state.setAudioTracks(options.audioTracks ? [...options.audioTracks] : []);
    state.setSubtitleTracks(options.subtitleTracks ? [...options.subtitleTracks] : []);
    state.setChaptersFile(options.chaptersFile || null);

    renderAudioTracks(state.audioTracks);
    renderSubtitleTracks(state.subtitleTracks);

    isApplyingPreset = false;
    updatePresetStatus();
}

export async function handleFileSelection(filePath) {
    const filenameEl = get('filename');
    const fileIcon = get('file-icon');
    const resolutionEl = get('file-resolution');
    const durationEl = get('file-duration');
    const bitrateEl = get('file-bitrate');
    const dashboard = get('file-dashboard');
    const formatSelect = get('format-select');
    const addQueueBtn = get('add-queue-btn');
    const chaptersInfo = get('chapters-info');
    const chapterImportZone = get('chapter-import-zone');

    state.setCurrentFile(filePath);
    state.setCurrentEditingQueueId(null);
    state.setAudioTracks([{ isSource: true, name: 'Source Audio' }]);
    state.setSubtitleTracks([]);
    state.setChaptersFile(null);
    state.setCurrentPreset(null, null, false);

    renderAudioTracks(state.audioTracks);
    renderSubtitleTracks(state.subtitleTracks);

    if (chaptersInfo) chaptersInfo.classList.add('hidden');
    if (chapterImportZone) chapterImportZone.classList.remove('hidden');

    if (addQueueBtn) {
        addQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Add to Queue
        `;
    }

    const name = filePath.split(/[\\/]/).pop();
    const ext = name.split('.').pop().toUpperCase();

    if (filenameEl) filenameEl.textContent = name;
    if (fileIcon) fileIcon.textContent = ext;

    showView(dashboard);

    try {
        const metadata = await window.api.getMetadata(filePath);
        if (resolutionEl) resolutionEl.textContent = metadata.resolution;
        if (durationEl) durationEl.textContent = metadata.duration;
        if (bitrateEl) bitrateEl.textContent = metadata.bitrate;

        state.setCurrentFile(
            filePath,
            metadata.durationSeconds || 0,
            metadata.width || 0,
            metadata.height || 0,
            metadata.fps || 30
        );

        if (formatSelect && !state.currentEditingQueueId) {
            formatSelect.value = state.appSettings.defaultFormat;
        }

        // Update preset status and file size estimate
        updatePresetStatus();
    } catch (err) {
        console.error('Could not read metadata:', err);
        // Update file size display to show error state when metadata fails
        const estFileSizeEl = get('est-file-size');
        if (estFileSizeEl) estFileSizeEl.textContent = '--';
    }
}

export function updateEstFileSize() {
    const estFileSizeEl = get('est-file-size');
    const crfSlider = get('crf-slider');
    const codecSelect = get('codec-select');
    const presetSelect = get('preset-select');
    const resolutionSelect = get('resolution-select');
    const fpsSelect = get('fps-select');
    const vBitrateInput = get('v-bitrate');
    const audioSelect = get('audio-select');
    const audioBitrateSelect = get('audio-bitrate');

    if (!state.currentFileDurationSeconds || state.currentFileDurationSeconds <= 0) {
        if (estFileSizeEl) estFileSizeEl.textContent = '--';
        return;
    }

    const rateMode = document.querySelector('input[name="rate-mode"]:checked')?.value || 'crf';
    let headerText = '';
    let vBitrate = 0;

    if (rateMode === 'crf') {
        const crf = crfSlider ? parseInt(crfSlider.value) : 23;
        let width = state.currentFileWidth || 1920;
        let height = state.currentFileHeight || 1080;

        if (resolutionSelect && resolutionSelect.value !== 'source') {
            const resMap = {
                '480p': [854, 480],
                '720p': [1280, 720],
                '1080p': [1920, 1080],
                '1440p': [2560, 1440],
                '2160p': [3840, 2160]
            };
            if (resMap[resolutionSelect.value]) {
                [width, height] = resMap[resolutionSelect.value];
            }
        }

        let fps = state.currentFileFps || 30;
        if (fpsSelect && fpsSelect.value !== 'source') {
            fps = parseFloat(fpsSelect.value) || 30;
        }

        const pixelCount = width * height;
        const basePixels = 1920 * 1080;
        const baseFps = 30;
        const baseBitrate = 4000;

        const resFactor = pixelCount / basePixels;
        const fpsFactor = fps / baseFps;
        const crfFactor = Math.pow(2, (23 - crf) / 6);

        let codecFactor = 1.0;
        const codec = codecSelect ? codecSelect.value : 'h264';
        if (codec.includes('h265') || codec.includes('hevc')) codecFactor = 0.7;
        else if (codec.includes('vp9')) codecFactor = 0.7;
        else if (codec.includes('av1')) codecFactor = 0.6;

        let presetFactor = 1.0;
        if (presetSelect && presetSelect.value) {
            const presetMap = {
                'ultrafast': 1.4, 'superfast': 1.3, 'veryfast': 1.2, 'fast': 1.1,
                'medium': 1.0, 'slow': 0.95, 'slower': 0.9, 'veryslow': 0.85
            };
            if (presetMap[presetSelect.value]) presetFactor = presetMap[presetSelect.value];
        }

        vBitrate = baseBitrate * resFactor * fpsFactor * crfFactor * codecFactor * presetFactor;
        headerText = ' (Rough)';
    } else {
        if (vBitrateInput && vBitrateInput.value) {
            vBitrate = parseInt(vBitrateInput.value) || 0;
        }
    }

    let aBitrate = 0;
    const aCodec = audioSelect ? audioSelect.value : 'aac';
    if (aCodec === 'none') aBitrate = 0;
    else if (aCodec === 'copy') aBitrate = 192;
    else if (aCodec === 'pcm_s16le') aBitrate = 1536;
    else {
        if (audioBitrateSelect && audioBitrateSelect.value) {
            if (audioBitrateSelect.value === 'auto') aBitrate = 192;
            else aBitrate = parseInt(audioBitrateSelect.value.replace('k', '')) || 0;
        }
    }

    const totalBitrateKbps = vBitrate + aBitrate;
    const totalSizeBytes = (totalBitrateKbps * 1000 * state.currentFileDurationSeconds) / 8;
    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    if (estFileSizeEl) {
        if (totalSizeMB < 1000) {
            estFileSizeEl.textContent = `~${totalSizeMB.toFixed(1)} MB${headerText}`;
        } else {
            estFileSizeEl.textContent = `~${(totalSizeMB / 1024).toFixed(2)} GB${headerText}`;
        }
    }
}

export function updatePresetStatus() {
    const currentSettings = getOptionsFromUI();
    const presetSettings = state.currentPresetOriginalSettings;

    if (state.currentPresetUsed && presetSettings) {
        // Compare simplified versions of settings
        const simplifiedCurrent = JSON.stringify({
            format: currentSettings.format,
            codec: currentSettings.codec.split('_')[0].replace('hevc', 'h265'),
            preset: currentSettings.preset,
            resolution: currentSettings.resolution,
            crf: currentSettings.crf,
            audioCodec: currentSettings.audioCodec,
            audioBitrate: currentSettings.audioBitrate,
            fps: currentSettings.fps,
            twoPass: currentSettings.twoPass
        });

        const simplifiedPreset = JSON.stringify({
            format: presetSettings.format,
            codec: presetSettings.codec,
            preset: presetSettings.preset,
            resolution: presetSettings.resolution,
            crf: presetSettings.crf,
            audioCodec: presetSettings.audioCodec,
            audioBitrate: presetSettings.audioBitrate,
            fps: presetSettings.fps,
            twoPass: presetSettings.twoPass
        });

        const isModified = simplifiedCurrent !== simplifiedPreset;
        state.setCurrentPreset(state.currentPresetUsed, presetSettings, isModified);
    } else {
        // Find match among built-ins
        let match = null;
        for (const [name, settings] of Object.entries(BUILT_IN_PRESETS)) {
            // Simplified match logic
            if (currentSettings.format === settings.format &&
                currentSettings.preset === settings.preset &&
                currentSettings.resolution === settings.resolution &&
                currentSettings.crf === settings.crf) {
                match = name;
                break;
            }
        }
        if (match) {
            state.setCurrentPreset(match, BUILT_IN_PRESETS[match], false);
        } else {
            // Default to general-fast-720p instead of null
            const defaultPresetName = 'general-fast-720p';
            if (BUILT_IN_PRESETS[defaultPresetName]) {
                state.setCurrentPreset(defaultPresetName, BUILT_IN_PRESETS[defaultPresetName], true);
            } else {
                state.setCurrentPreset(null, null, true);
            }
        }
    }

    const currentPresetName = get('current-preset-name');
    if (currentPresetName) {
        let displayName = 'Default';
        if (state.currentPresetUsed) {
            displayName = formatPresetName(state.currentPresetUsed);
        }
        currentPresetName.textContent = displayName + (state.isCurrentSettingsModified ? '*' : '');
    }

    if (state.currentEditingQueueId !== null) {
        const item = state.encodingQueue.find(i => i.id === state.currentEditingQueueId);
        if (item && item.taskType === 'encode') {
            item.preset = state.currentPresetUsed || null;
            item.presetUsed = item.preset;
            item.isModified = state.isCurrentSettingsModified;
            if (item.status && item.state !== item.status) {
                item.state = item.status;
            }
            updateQueueUI();
        }
    }

    updateEstFileSize();
}

export function applyPreset(settings, name) {
    isApplyingPreset = true;

    const formatSelect = get('format-select');
    const codecSelect = get('codec-select');
    const presetSelect = get('preset-select');
    const resolutionSelect = get('resolution-select');
    const fpsSelect = get('fps-select');
    const crfSlider = get('crf-slider');
    const vBitrateInput = get('v-bitrate');
    const twoPassCheckbox = get('two-pass');
    const audioSelect = get('audio-select');
    const audioBitrateSelect = get('audio-bitrate');

    const setVal = (el, val) => {
        if (el) {
            el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    setVal(formatSelect, settings.format);
    setVal(codecSelect, settings.codec);
    setVal(presetSelect, settings.preset);
    if (settings.resolution) setVal(resolutionSelect, settings.resolution);
    if (settings.fps) setVal(fpsSelect, settings.fps);

    if (settings.rateMode) {
        const radio = document.querySelector(`input[name="rate-mode"][value="${settings.rateMode}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
        }
    }

    if (crfSlider) {
        crfSlider.value = settings.crf || 23;
        crfSlider.dispatchEvent(new Event('input'));
    }

    if (vBitrateInput && settings.bitrate) setVal(vBitrateInput, settings.bitrate);
    if (twoPassCheckbox) {
        twoPassCheckbox.checked = settings.twoPass || false;
        twoPassCheckbox.dispatchEvent(new Event('change'));
    }

    setVal(audioSelect, settings.audioCodec);
    if (settings.audioBitrate) {
        setVal(audioBitrateSelect, settings.audioBitrate === 'auto' ? '192k' : settings.audioBitrate);
    }

    state.setCurrentPreset(name, { ...settings }, false);

    isApplyingPreset = false;
    updatePresetStatus();
}

export async function handleFolderSelection(folderPath) {
    console.log('Folder selected:', folderPath);
    try {
        const files = await window.api.listFiles(folderPath);
        if (files.length === 0) {
            showPopup('No video files found in the selected folder.');
            return;
        }

        const confirmAdd = await showConfirm(`Found ${files.length} video files. Add them to queue with current settings?`);
        if (!confirmAdd) return;

        const formatSelect = get('format-select');
        const codecSelect = get('codec-select');
        const presetSelect = get('preset-select');
        const resolutionSelect = get('resolution-select');
        const fpsSelect = get('fps-select');
        const crfSlider = get('crf-slider');
        const vBitrateInput = get('v-bitrate');
        const twoPassCheckbox = get('two-pass');
        const audioSelect = get('audio-select');
        const audioBitrateSelect = get('audio-bitrate');
        const customFfmpegArgs = get('custom-ffmpeg-args');
        const outputFolderInput = get('output-folder');

        const rateMode = document.querySelector('input[name="rate-mode"]:checked')?.value || 'crf';
        const useNoAudio = audioSelect && audioSelect.value === 'none';
        const defaultAudioTracks = useNoAudio
            ? []
            : [{ isSource: true, name: 'Source Audio' }];
        const effectiveAudioTracks = state.audioTracks.length > 0
            ? [...state.audioTracks]
            : (state.currentFilePath ? [] : defaultAudioTracks);

        files.forEach(file => {
            const options = {
                input: file,
                format: state.appSettings.defaultFormat,
                codec: getEffectiveCodec(),
                preset: presetSelect ? presetSelect.value : 'medium',
                resolution: resolutionSelect ? resolutionSelect.value : 'source',
                fps: fpsSelect ? fpsSelect.value : 'source',
                rateMode: rateMode,
                crf: crfSlider ? parseInt(crfSlider.value) : 23,
                bitrate: vBitrateInput ? vBitrateInput.value : '2500',
                twoPass: twoPassCheckbox ? twoPassCheckbox.checked : false,
                audioCodec: audioSelect ? audioSelect.value : 'aac',
                audioBitrate: audioBitrateSelect ? audioBitrateSelect.value : '192k',
                audioTracks: effectiveAudioTracks,
                subtitleTracks: [...state.subtitleTracks],
                chaptersFile: null,
                outputSuffix: state.appSettings.outputSuffix,
                outputFolder: outputFolderInput ? outputFolderInput.value : '',
                customArgs: customFfmpegArgs ? customFfmpegArgs.value : ''
            };
            addToQueue(options);
        });

        const queueView = get('queue-view');
        const navQueue = get('nav-queue');
        showView(queueView);
        resetNav();
        if (navQueue) navQueue.classList.add('active');
    } catch (err) {
        console.error('Error handling folder:', err);
    }
}

export function setupEncoderHandlers() {
    const dropZone = get('drop-zone');
    const folderDropZone = get('folder-drop-zone');
    const backBtn = get('back-btn');
    const convertBtn = get('convert-btn');
    const addQueueBtn = get('add-queue-btn');
    const addAudioBtn = get('add-audio-btn');
    const subtitleDropZone = get('subtitle-drop-zone');
    const chapterImportZone = get('chapter-import-zone');
    const removeChaptersBtn = get('remove-chapters-btn');

    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                console.log('File dropped:', file.path);
                handleFileSelection(file.path);
            }
        });

        dropZone.addEventListener('click', async () => {
            console.log('Drop zone clicked, opening dialog...');
            try {
                const filePath = await window.api.selectFile();
                if (filePath) {
                    console.log('File selected:', filePath);
                    handleFileSelection(filePath);
                }
            } catch (err) {
                console.error('Error selecting file:', err);
            }
        });
    }

    if (folderDropZone) {
        folderDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            folderDropZone.classList.add('drag-over');
        });

        folderDropZone.addEventListener('dragleave', () => {
            folderDropZone.classList.remove('drag-over');
        });

        folderDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            folderDropZone.classList.remove('drag-over');
            const folder = e.dataTransfer.files[0];
            if (folder) {
                handleFolderSelection(folder.path);
            }
        });

        folderDropZone.addEventListener('click', async () => {
            try {
                const folderPath = await window.api.selectFolder();
                if (folderPath) {
                    handleFolderSelection(folderPath);
                }
            } catch (err) {
                console.error('Error selecting folder:', err);
            }
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (state.currentEditingQueueId) {
                const queueView = get('queue-view');
                const navQueue = get('nav-queue');
                showView(queueView);
                resetNav();
                if (navQueue) navQueue.classList.add('active');
                state.setCurrentEditingQueueId(null);
            } else {
                showView(dropZone);
            }
        });
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', () => {
            if (!state.currentFilePath) return;

            state.setExtracting(false);
            state.setTrimming(false);

            const progressTitle = get('progress-title');
            const completeTitle = get('complete-title');
            const progressFilename = get('progress-filename');
            const progressView = get('progress-view');

            if (progressTitle) progressTitle.textContent = 'Encoding in Progress';
            if (completeTitle) completeTitle.textContent = 'Encoding Complete!';

            const options = getOptionsFromUI();

            if (progressFilename) progressFilename.textContent = state.currentFilePath.split(/[\\/]/).pop();

            showView(progressView);
            state.setEncodingState(true);
            state.setCancelled(false);

            window.api.startEncode(options);
        });
    }

    if (addQueueBtn) {
        addQueueBtn.addEventListener('click', () => {
            if (!state.currentFilePath) return;

            const options = getOptionsFromUI();

            if (state.currentEditingQueueId) {
                updateQueueItem(state.currentEditingQueueId, options);
                const queueView = get('queue-view');
                const navQueue = get('nav-queue');
                showView(queueView);
                resetNav();
                if (navQueue) navQueue.classList.add('active');
            } else {
                addToQueue(options);
                const navVideo = get('nav-video');
                showView(dropZone);
                resetNav();
                if (navVideo) navVideo.classList.add('active');
            }
        });
    }

    if (addAudioBtn) {
        addAudioBtn.addEventListener('click', async () => {
            const path = await window.api.selectFile();
            if (path) {
                state.audioTracks.push({ path, name: path.split(/[\\/]/).pop() });
                renderAudioTracks(state.audioTracks);
            }
        });
    }

    // Global window handlers
    window.removeAudioTrack = (index) => {
        const audioTrackList = get('audio-track-list');
        const trackItems = audioTrackList?.querySelectorAll('.track-item');
        const trackItem = trackItems?.[index];

        if (trackItem) {
            trackItem.classList.add('removing');
            // Delay the collapse to let the exit animation play first
            setTimeout(() => trackItem.classList.add('collapsing'), 100);

            trackItem.addEventListener('animationend', () => {
                state.audioTracks.splice(index, 1);
                trackItem.remove();

                // Update onclick indices for remaining items
                const remainingItems = audioTrackList.querySelectorAll('.track-item');
                remainingItems.forEach((item, i) => {
                    const btn = item.querySelector('.remove-btn');
                    if (btn) btn.setAttribute('onclick', `window.removeAudioTrack(${i})`);
                });

                // Show empty state if no tracks left
                if (state.audioTracks.length === 0) {
                    renderAudioTracks(state.audioTracks);
                }
            }, { once: true });
        } else {
            state.audioTracks.splice(index, 1);
            renderAudioTracks(state.audioTracks);
        }
    };

    window.removeSubtitleTrack = (index) => {
        const subtitleTrackList = get('subtitle-track-list');
        const trackItems = subtitleTrackList?.querySelectorAll('.track-item');
        const trackItem = trackItems?.[index];

        if (trackItem) {
            trackItem.classList.add('removing');
            // Delay the collapse to let the exit animation play first
            setTimeout(() => trackItem.classList.add('collapsing'), 100);

            trackItem.addEventListener('animationend', () => {
                state.subtitleTracks.splice(index, 1);
                trackItem.remove();

                // Update onclick indices for remaining items
                const remainingItems = subtitleTrackList.querySelectorAll('.track-item');
                remainingItems.forEach((item, i) => {
                    const btn = item.querySelector('.remove-btn');
                    if (btn) btn.setAttribute('onclick', `window.removeSubtitleTrack(${i})`);
                });
            }, { once: true });
        } else {
            state.subtitleTracks.splice(index, 1);
            renderSubtitleTracks(state.subtitleTracks);
        }
    };

    if (subtitleDropZone) {
        subtitleDropZone.addEventListener('click', async () => {
            const path = await window.api.selectFile();
            if (path) {
                state.subtitleTracks.push({ path, name: path.split(/[\\/]/).pop() });
                renderSubtitleTracks(state.subtitleTracks);
            }
        });

        subtitleDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            subtitleDropZone.classList.add('drag-over');
        });

        subtitleDropZone.addEventListener('dragleave', () => {
            subtitleDropZone.classList.remove('drag-over');
        });

        subtitleDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            subtitleDropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                state.subtitleTracks.push({ path: file.path, name: file.name });
                renderSubtitleTracks(state.subtitleTracks);
            }
        });
    }

    if (chapterImportZone) {
        chapterImportZone.addEventListener('click', async () => {
            const path = await window.api.selectFile();
            if (path) {
                handleChapterFile(path);
            }
        });

        chapterImportZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            chapterImportZone.classList.add('drag-over');
        });

        chapterImportZone.addEventListener('dragleave', () => {
            chapterImportZone.classList.remove('drag-over');
        });

        chapterImportZone.addEventListener('drop', (e) => {
            e.preventDefault();
            chapterImportZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                handleChapterFile(file.path);
            }
        });
    }

    if (removeChaptersBtn) {
        removeChaptersBtn.addEventListener('click', () => {
            const chaptersInfo = get('chapters-info');
            state.setChaptersFile(null);
            if (chaptersInfo) chaptersInfo.classList.add('hidden');
            if (chapterImportZone) chapterImportZone.classList.remove('hidden');
        });
    }

    const toggleAdvancedBtn = get('toggle-advanced-btn');
    const advancedPanel = get('advanced-panel');
    if (toggleAdvancedBtn && advancedPanel) {
        toggleAdvancedBtn.addEventListener('click', () => {
            const isHidden = advancedPanel.classList.toggle('hidden');
            toggleAdvancedBtn.setAttribute('aria-expanded', String(!isHidden));
        });
    }

    // Settings UI Handlers
    const encoderView = get('file-dashboard');
    if (encoderView) {
        encoderView.addEventListener('change', (e) => {
            if (isApplyingPreset) return; // Skip updates while applying preset

            const id = e.target.id;
            const name = e.target.name;

            if (name === 'rate-mode') {
                const crfContainer = get('crf-container');
                const bitrateContainer = get('bitrate-container');
                if (crfContainer && bitrateContainer) {
                    const panel = e.target.closest('.settings-panel');
                    animateAutoHeight(panel, () => {
                        if (e.target.value === 'crf') {
                            crfContainer.classList.remove('hidden');
                            bitrateContainer.classList.add('hidden');
                        } else {
                            crfContainer.classList.add('hidden');
                            bitrateContainer.classList.remove('hidden');
                        }
                    });
                    updatePresetStatus();
                }
                return;
            }

            const watchIds = [
                'format-select', 'codec-select', 'resolution-select', 'fps-select',
                'preset-select', 'audio-select', 'audio-bitrate', 'two-pass'
            ];
            if (watchIds.includes(id)) {
                updatePresetStatus();
            }
        });

        encoderView.addEventListener('input', (e) => {
            if (isApplyingPreset) return; // Skip updates while applying preset

            const id = e.target.id;
            if (id === 'crf-slider') {
                const val = get('crf-value');
                if (val) val.textContent = e.target.value;
                updatePresetStatus();
            }
            if (id === 'v-bitrate') {
                updatePresetStatus();
            }
        });
    }

    // Tab switching
    const settingsTabs = get('file-dashboard')?.querySelector('.settings-tabs');
    if (settingsTabs) {
        const tabButtons = settingsTabs.querySelectorAll('.tab-btn');
        const tabContents = get('file-dashboard')?.querySelectorAll('.tab-content') || [];
        const tabContainer = settingsTabs.closest('.settings-panel');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                animateAutoHeight(tabContainer, () => {
                    tabButtons.forEach(b => b.classList.toggle('active', b === btn));
                    tabContents.forEach(c => c.classList.toggle('hidden', c.id !== `tab-${tabName}`));
                });
            });
        });
    }

    // Preset menu toggle
    const presetMenuBtn = get('preset-menu-btn');
    const presetDropdown = get('preset-dropdown');
    if (presetMenuBtn && presetDropdown) {
        presetMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const container = presetMenuBtn.closest('.dropdown-container');
            if (container) {
                document.querySelectorAll('.dropdown-container.open').forEach(openContainer => {
                    if (openContainer !== container) openContainer.classList.remove('open');
                });
                container.classList.toggle('open');
            }
        });
    }

    if (presetDropdown) {
        const presetItems = presetDropdown.querySelectorAll('.preset-item.dropdown-item[data-preset]');
        presetItems.forEach(item => {
            const key = item.dataset.preset;
            const preset = BUILT_IN_PRESETS[key];
            if (preset && preset.label) {
                item.textContent = preset.label;
            }
        });

        presetDropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.preset-item.dropdown-item');
            if (!item) return;

            const presetKey = item.dataset.preset || item.dataset.customPreset;
            if (!presetKey) return;

            if (item.dataset.preset) {
                const settings = BUILT_IN_PRESETS[presetKey];
                if (settings) applyPreset(settings, presetKey);
            } else {
                let customPresets = {};
                try {
                    customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
                } catch (err) {
                    customPresets = {};
                }
                if (customPresets[presetKey]) applyPreset(customPresets[presetKey], presetKey);
            }

            const container = presetMenuBtn ? presetMenuBtn.closest('.dropdown-container') : null;
            if (container) container.classList.remove('open');
        });
    }

    const revertBtn = get('revert-video-btn');
    if (revertBtn) {
        revertBtn.addEventListener('click', async () => {
            const confirmReset = await showConfirm('Revert encoding settings for this video to defaults?');
            if (!confirmReset) return;

            // Reset audio tracks to default (source audio only)
            state.audioTracks.length = 0;
            state.audioTracks.push({ isSource: true, name: 'Source Audio' });
            renderAudioTracks(state.audioTracks);

            // Reset subtitle tracks
            state.subtitleTracks.length = 0;
            renderSubtitleTracks(state.subtitleTracks);

            // Reset chapters
            const chaptersInfo = get('chapters-info');
            const chapterImportZone = get('chapter-import-zone');
            state.setChaptersFile(null);
            if (chaptersInfo) chaptersInfo.classList.add('hidden');
            if (chapterImportZone) chapterImportZone.classList.remove('hidden');

            applyPreset(BUILT_IN_PRESETS['general-fast-720p'], 'Default');
        });
    }

    const savePresetBtn = get('save-preset-btn');
    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const list = get('custom-presets-list');
            if (!list) return;

            if (list.querySelector('#new-preset-form')) return;

            const form = document.createElement('div');
            form.id = 'new-preset-form';
            form.className = 'new-preset-form';
            form.innerHTML = `
                <div class="new-preset-input-wrap">
                    <input id="new-preset-input" type="text" placeholder="Preset name" autocomplete="off" />
                </div>
                <div class="new-preset-actions">
                    <button id="new-preset-save" type="button" class="primary-btn small">Save</button>
                    <button id="new-preset-cancel" type="button" class="secondary-btn small">Cancel</button>
                </div>
            `;

            list.prepend(form);

            const input = form.querySelector('#new-preset-input');
            const saveBtn = form.querySelector('#new-preset-save');
            const cancelBtn = form.querySelector('#new-preset-cancel');
            if (input) input.focus();

            const removeForm = () => form.remove();

            if (cancelBtn) {
                cancelBtn.addEventListener('click', (evt) => {
                    evt.stopPropagation();
                    removeForm();
                });
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', async (evt) => {
                    evt.stopPropagation();
                    const name = input ? input.value.trim() : '';
                    if (!name) {
                        showPopup('Please enter a preset name.');
                        return;
                    }

                    const customPresets = loadCustomPresets();
                    if (customPresets[name]) {
                        const confirmOverwrite = await showConfirm('Preset exists. Overwrite it?');
                        if (!confirmOverwrite) return;
                    }

                    const settings = getPresetSettingsFromUI();
                    customPresets[name] = settings;
                    saveCustomPresets(customPresets);
                    renderCustomPresetList(customPresets);
                    applyPreset(settings, name);
                    removeForm();
                });
            }
        });
    }

    renderCustomPresetList(loadCustomPresets());
}

function handleChapterFile(path) {
    const chaptersFilename = get('chapters-filename');
    const chaptersInfo = get('chapters-info');
    const chapterImportZone = get('chapter-import-zone');

    state.setChaptersFile(path);
    if (chaptersFilename) chaptersFilename.textContent = path.split(/[\\/]/).pop();
    if (chaptersInfo) chaptersInfo.classList.remove('hidden');
    if (chapterImportZone) chapterImportZone.classList.add('hidden');
}

function updateQueueItem(id, options) {
    const index = state.encodingQueue.findIndex(item => item.id === id);
    if (index !== -1) {
        state.encodingQueue[index].options = options;
        state.encodingQueue[index].name = options.input.split(/[\\/]/).pop();
        state.encodingQueue[index].preset = state.currentPresetUsed || null;
        state.encodingQueue[index].presetUsed = state.encodingQueue[index].preset;
        state.encodingQueue[index].isModified = state.isCurrentSettingsModified;

        if (state.encodingQueue[index].status === 'completed' || state.encodingQueue[index].status === 'error') {
            state.encodingQueue[index].status = 'pending';
            state.encodingQueue[index].state = 'pending';
            state.encodingQueue[index].progress = 0;
        }

        updateQueueUI();
    }
    state.setCurrentEditingQueueId(null);
}
