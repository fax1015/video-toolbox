// Audio Extractor Module

import { get, showPopup, showView, resetProgress, resetNav, toggleSidebar, setupFileDropZone } from './ui-utils.js';
import * as state from './state.js';
import { addToQueue } from './queue.js';

let extractFilePath = null;
let audioToolMode = 'extract';
const AUDIO_FILE_FILTERS = [
    { name: 'Audio Files', extensions: ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus'] },
    { name: 'Media Files', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus'] }
];
const VIDEO_FILE_FILTERS = [
    { name: 'Video Files', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v'] },
    { name: 'Media Files', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus'] }
];
const BITRATE_STEPS = ['64k', '96k', '128k', '160k', '192k', '224k', '256k', '288k', '320k'];
const BITRATE_LABELS = ['64 kbps', '96 kbps', '128 kbps', '160 kbps', '192 kbps', '224 kbps', '256 kbps', '288 kbps', '320 kbps'];

function setAudioToolMode(mode) {
    audioToolMode = mode === 'convert' ? 'convert' : 'extract';
    const title = document.querySelector('#extract-audio-dashboard .panel-title');
    const actionBtn = get('extract-audio-btn');
    if (title) title.textContent = audioToolMode === 'convert' ? 'Audio Conversion' : 'Audio Output';
    if (actionBtn) {
        actionBtn.innerHTML = audioToolMode === 'convert' ? `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
            </svg>
            Convert Audio
        ` : `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
            </svg>
            Extract Audio
        `;
    }
}

function syncBitrateSliderFromSelect() {
    const select = get('extract-audio-bitrate');
    const slider = get('extract-audio-bitrate-slider');
    const valueEl = get('extract-audio-bitrate-value');
    if (!select || !slider) return;

    const index = Math.max(0, BITRATE_STEPS.indexOf(select.value));
    slider.value = String(index);
    if (valueEl) valueEl.textContent = BITRATE_LABELS[index] || select.options[select.selectedIndex]?.textContent || select.value;
}

function syncBitrateSelectFromSlider() {
    const select = get('extract-audio-bitrate');
    const slider = get('extract-audio-bitrate-slider');
    if (!select || !slider) return;

    const index = Math.max(0, Math.min(BITRATE_STEPS.length - 1, parseInt(slider.value, 10) || 0));
    const nextValue = BITRATE_STEPS[index];
    if (select.value !== nextValue) {
        select.value = nextValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        syncBitrateSliderFromSelect();
    }
}

export function updateExtractBitrateVisibility() {
    const extractAudioFormatSelect = get('extract-audio-format');
    const extractBitrateGroup = get('extract-bitrate-group');
    const mp3ModeGroup = get('extract-mp3-mode-group');
    const mp3ModeSelect = get('extract-mp3-mode');
    const mp3QualityGroup = get('extract-mp3-quality-group');
    const flacLevelGroup = get('extract-flac-level-group');
    if (!extractAudioFormatSelect || !extractBitrateGroup) return;
    const format = extractAudioFormatSelect.value;
    const isLossless = format === 'flac' || format === 'wav';
    const isMp3 = format === 'mp3';
    const mp3Mode = mp3ModeSelect ? mp3ModeSelect.value : 'cbr';
    const isMp3Vbr = isMp3 && mp3Mode === 'vbr';

    extractBitrateGroup.classList.toggle('hidden', isLossless || isMp3Vbr);
    if (mp3ModeGroup) mp3ModeGroup.classList.toggle('hidden', !isMp3);
    if (mp3QualityGroup) mp3QualityGroup.classList.toggle('hidden', !isMp3Vbr);
    if (flacLevelGroup) flacLevelGroup.classList.toggle('hidden', format !== 'flac');
}

export async function handleExtractFileSelection(filePath, options = {}) {
    if (options.toolMode) setAudioToolMode(options.toolMode);
    const extractFilenameEl = get('extract-filename');
    const extractFileIcon = get('extract-file-icon');
    const extractFileDuration = get('extract-file-duration');
    const extractAudioFormatSelect = get('extract-audio-format');
    const extractAudioBitrateSelect = get('extract-audio-bitrate');
    const extractSampleRateSelect = get('extract-audio-sample-rate');
    const extractMp3ModeSelect = get('extract-mp3-mode');
    const extractMp3QualitySelect = get('extract-mp3-quality');
    const extractFlacLevelSelect = get('extract-flac-level');

    const extractAddQueueBtn = get('extract-add-queue-btn');

    extractFilePath = filePath;
    const name = filePath.split(/[\\/]/).pop();
    const ext = name.split('.').pop().toUpperCase();
    if (extractFilenameEl) extractFilenameEl.textContent = name;
    if (extractFileIcon) extractFileIcon.textContent = ext;
    if (extractFileDuration) extractFileDuration.textContent = '...';
    // Note: showView() is called by the caller (main.js loadQueueItem) to avoid double animations

    if (extractAddQueueBtn) {
        extractAddQueueBtn.innerHTML = state.currentEditingQueueId === null ? `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Add to Queue
        ` : `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Update Item
        `;
    }

    if (extractAudioFormatSelect && options.format) {
        extractAudioFormatSelect.value = options.format;
    }
    if (extractAudioBitrateSelect && options.bitrate) {
        extractAudioBitrateSelect.value = options.bitrate;
        syncBitrateSliderFromSelect();
    }
    if (extractSampleRateSelect && (options.sample_rate || options.sampleRate)) {
        extractSampleRateSelect.value = options.sample_rate || options.sampleRate;
    }
    if (extractMp3ModeSelect && (options.mp3_mode || options.mp3Mode)) {
        extractMp3ModeSelect.value = options.mp3_mode || options.mp3Mode;
    }
    if (extractMp3QualitySelect && (options.mp3_quality || options.mp3Quality)) {
        extractMp3QualitySelect.value = options.mp3_quality || options.mp3Quality;
    }
    if (extractFlacLevelSelect && (options.flac_level || options.flacLevel)) {
        extractFlacLevelSelect.value = options.flac_level || options.flacLevel;
    }

    updateExtractBitrateVisibility();

    try {
        const metadata = await window.api.getMetadata(filePath);
        if (extractFileDuration) extractFileDuration.textContent = metadata.duration;
    } catch (e) {
        if (extractFileDuration) extractFileDuration.textContent = 'Unknown';
    }
}

function getExtractOptionsFromUI() {
    const extractAudioFormatSelect = get('extract-audio-format');
    const extractAudioBitrateSelect = get('extract-audio-bitrate');
    const extractSampleRateSelect = get('extract-audio-sample-rate');
    const extractMp3ModeSelect = get('extract-mp3-mode');
    const extractMp3QualitySelect = get('extract-mp3-quality');
    const extractFlacLevelSelect = get('extract-flac-level');

    const format = extractAudioFormatSelect ? extractAudioFormatSelect.value : 'mp3';
    const mp3Mode = extractMp3ModeSelect ? extractMp3ModeSelect.value : 'cbr';
    const sampleRate = extractSampleRateSelect ? extractSampleRateSelect.value : 'source';
    const mp3Quality = extractMp3QualitySelect ? extractMp3QualitySelect.value : '2';
    const flacLevel = extractFlacLevelSelect ? extractFlacLevelSelect.value : '5';

    let bitrate = null;
    if (format !== 'flac' && format !== 'wav') {
        if (!(format === 'mp3' && mp3Mode === 'vbr')) {
            bitrate = extractAudioBitrateSelect ? extractAudioBitrateSelect.value : '192k';
        }
    }

    return {
        input: extractFilePath,
        format,
        bitrate,
        sample_rate: sampleRate,
        mp3_mode: format === 'mp3' ? mp3Mode : null,
        mp3_quality: format === 'mp3' && mp3Mode === 'vbr' ? mp3Quality : null,
        flac_level: format === 'flac' ? flacLevel : null,
        output_folder: get('output-folder')?.value || '',
        overwrite_files: !!state.appSettings.overwriteFiles
    };
}

export function setupExtractAudioHandlers() {

    const extractAudioFormatSelect = get('extract-audio-format');

    const extractMp3ModeSelect = get('extract-mp3-mode');
    const extractAudioBitrateSelect = get('extract-audio-bitrate');
    const extractAudioBitrateSlider = get('extract-audio-bitrate-slider');
    const extractAddQueueBtn = get('extract-add-queue-btn');

    const extractAudioBtn = get('extract-audio-btn');
    const extractBackBtn = get('extract-back-btn');
    const extractAudioDropZone = get('extract-audio-drop-zone');
    const convertAudioDropZone = get('convert-audio-drop-zone');

    const progressTitle = get('progress-title');
    const progressFilename = get('progress-filename');
    const progressView = get('progress-view');
    const queueView = get('queue-view');
    const navExtractAudio = get('nav-extract-audio');
    const navConvertAudio = get('nav-convert-audio');
    const navQueue = get('nav-queue');

    if (extractAudioFormatSelect) {
        extractAudioFormatSelect.addEventListener('change', updateExtractBitrateVisibility);
    }
    if (extractAudioBitrateSelect) {
        extractAudioBitrateSelect.addEventListener('change', syncBitrateSliderFromSelect);
        syncBitrateSliderFromSelect();
    }
    if (extractAudioBitrateSlider) {
        extractAudioBitrateSlider.addEventListener('input', syncBitrateSelectFromSlider);
    }
    if (extractMp3ModeSelect) {
        extractMp3ModeSelect.addEventListener('change', updateExtractBitrateVisibility);
    }

    if (extractAudioDropZone) {
        setupFileDropZone(extractAudioDropZone, {
            onDrop: ([filePath]) => {
                if (!filePath) return;
                setAudioToolMode('extract');
                handleExtractFileSelection(filePath).then(() => {
                    showView(get('extract-audio-dashboard'));
                    resetNav();
                    if (navExtractAudio) navExtractAudio.classList.add('active');
                });
            },
            onEmptyDrop: () => showPopup('Could not read the dropped file path.')
        });
        extractAudioDropZone.addEventListener('click', async () => {
            const path = await window.api.selectFile({ filters: VIDEO_FILE_FILTERS, allowAll: true });
            if (path) {
                setAudioToolMode('extract');
                handleExtractFileSelection(path).then(() => {
                    showView(get('extract-audio-dashboard'));
                    resetNav();
                    if (navExtractAudio) navExtractAudio.classList.add('active');
                });
            }
        });
    }

    if (convertAudioDropZone) {
        setupFileDropZone(convertAudioDropZone, {
            onDrop: ([filePath]) => {
                if (!filePath) return;
                setAudioToolMode('convert');
                handleExtractFileSelection(filePath, { toolMode: 'convert' }).then(() => {
                    showView(get('extract-audio-dashboard'));
                    resetNav();
                    if (navConvertAudio) navConvertAudio.classList.add('active');
                });
            },
            onEmptyDrop: () => showPopup('Could not read the dropped file path.')
        });
        convertAudioDropZone.addEventListener('click', async () => {
            const path = await window.api.selectFile({ filters: AUDIO_FILE_FILTERS, allowAll: true });
            if (path) {
                setAudioToolMode('convert');
                handleExtractFileSelection(path, { toolMode: 'convert' }).then(() => {
                    showView(get('extract-audio-dashboard'));
                    resetNav();
                    if (navConvertAudio) navConvertAudio.classList.add('active');
                });
            }
        });
    }

    if (extractBackBtn) {
        extractBackBtn.addEventListener('click', () => {
            showView(audioToolMode === 'convert' ? convertAudioDropZone : extractAudioDropZone);
            const resetNav = () => {
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            };
            resetNav();
            if (audioToolMode === 'convert') {
                if (navConvertAudio) navConvertAudio.classList.add('active');
            } else if (navExtractAudio) navExtractAudio.classList.add('active');
        });
    }

    if (extractAddQueueBtn) {
        extractAddQueueBtn.addEventListener('click', () => {
            if (!extractFilePath) return;
            const options = getExtractOptionsFromUI();

            if (state.currentEditingQueueId !== null) {
                const item = state.encodingQueue.find(i => i.id === state.currentEditingQueueId);
                if (item && (item.taskType === 'extract' || item.taskType === 'convert-audio')) {
                    item.options = options;
                    if (item.status === 'failed' || item.status === 'pending') {
                        item.status = 'pending';
                        item.progress = 0;
                        item.error = null;
                    }
                    state.setCurrentEditingQueueId(null);
                }
            } else {
                addToQueue(options, audioToolMode === 'convert' ? 'convert-audio' : 'extract');
            }
            showView(queueView);
            const resetNav = () => {
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            };
            resetNav();
            if (navQueue) navQueue.classList.add('active');
        });
    }

    if (extractAudioBtn) {
        extractAudioBtn.addEventListener('click', () => {
            if (!extractFilePath) return;
            state.setExtracting(true);
            state.setConvertingAudio(audioToolMode === 'convert');
            state.setEncodingState(true);
            state.setCancelled(false);
            state.setLastActiveViewId(audioToolMode === 'convert' ? 'convertAudioDropZone' : 'extractAudioDropZone');
            if (progressTitle) progressTitle.textContent = audioToolMode === 'convert' ? 'Converting audio...' : 'Extracting audio...';
            if (progressFilename) progressFilename.textContent = extractFilePath.split(/[\\/]/).pop();
            resetProgress();
            showView(progressView);
            toggleSidebar(true);

            const options = getExtractOptionsFromUI();
            const startAudioTask = audioToolMode === 'convert' ? window.api.convertAudio : window.api.extractAudio;
            startAudioTask({
                ...options,
                work_priority: state.appSettings.workPriority || 'normal'
            }).catch(e => {
                if (window.api?.logError) window.api.logError('Audio task error:', e); else console.error('Audio task error:', e);
                state.setEncodingState(false);
                state.setExtracting(false);
                state.setConvertingAudio(false);
                const progressView = get('progress-view');
                if (progressView) progressView.classList.add('hidden');
                showPopup(`Error starting audio task: ${e}`);
            });
        });
    }
}

export function setExtractToolMode(mode) {
    setAudioToolMode(mode);
}

export function getExtractFilePath() {
    return extractFilePath;
}

export function setExtractFilePath(path) {
    extractFilePath = path;
}
