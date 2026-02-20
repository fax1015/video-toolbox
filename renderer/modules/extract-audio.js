// Audio Extractor Module

import { get, showView, resetProgress, resetNav } from './ui-utils.js';
import * as state from './state.js';
import { addToQueue } from './queue.js';

let extractFilePath = null;

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
    const extractFilenameEl = get('extract-filename');
    const extractFileIcon = get('extract-file-icon');
    const extractFileDuration = get('extract-file-duration');
    const extractAudioFormatSelect = get('extract-audio-format');
    const extractAudioBitrateSelect = get('extract-audio-bitrate');
    const extractSampleRateSelect = get('extract-audio-sample-rate');
    const extractMp3ModeSelect = get('extract-mp3-mode');
    const extractMp3QualitySelect = get('extract-mp3-quality');
    const extractFlacLevelSelect = get('extract-flac-level');
    const extractAudioDashboard = get('extract-audio-dashboard');
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
    }
    if (extractSampleRateSelect && options.sampleRate) {
        extractSampleRateSelect.value = options.sampleRate;
    }
    if (extractMp3ModeSelect && options.mp3Mode) {
        extractMp3ModeSelect.value = options.mp3Mode;
    }
    if (extractMp3QualitySelect && options.mp3Quality) {
        extractMp3QualitySelect.value = options.mp3Quality;
    }
    if (extractFlacLevelSelect && options.flacLevel) {
        extractFlacLevelSelect.value = options.flacLevel;
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
        sampleRate,
        mp3Mode: format === 'mp3' ? mp3Mode : null,
        mp3Quality: format === 'mp3' && mp3Mode === 'vbr' ? mp3Quality : null,
        flacLevel: format === 'flac' ? flacLevel : null
    };
}

export function setupExtractAudioHandlers() {
    const extractFilenameEl = get('extract-filename');
    const extractFileIcon = get('extract-file-icon');
    const extractFileDuration = get('extract-file-duration');
    const extractAudioFormatSelect = get('extract-audio-format');
    const extractAudioBitrateSelect = get('extract-audio-bitrate');
    const extractMp3ModeSelect = get('extract-mp3-mode');
    const extractAddQueueBtn = get('extract-add-queue-btn');
    const extractBitrateGroup = get('extract-bitrate-group');
    const extractAudioBtn = get('extract-audio-btn');
    const extractBackBtn = get('extract-back-btn');
    const extractAudioDropZone = get('extract-audio-drop-zone');
    const extractAudioDashboard = get('extract-audio-dashboard');
    const progressTitle = get('progress-title');
    const progressFilename = get('progress-filename');
    const progressView = get('progress-view');
    const queueView = get('queue-view');
    const navExtractAudio = get('nav-extract-audio');
    const navQueue = get('nav-queue');

    if (extractAudioFormatSelect) {
        extractAudioFormatSelect.addEventListener('change', updateExtractBitrateVisibility);
    }
    if (extractMp3ModeSelect) {
        extractMp3ModeSelect.addEventListener('change', updateExtractBitrateVisibility);
    }

    if (extractAudioDropZone) {
        extractAudioDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            extractAudioDropZone.classList.add('drag-over');
        });
        extractAudioDropZone.addEventListener('dragleave', () => extractAudioDropZone.classList.remove('drag-over'));
        extractAudioDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            extractAudioDropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                handleExtractFileSelection(file.path).then(() => {
                    showView(get('extract-audio-dashboard'));
                    resetNav();
                    if (navExtractAudio) navExtractAudio.classList.add('active');
                });
            }
        });
        extractAudioDropZone.addEventListener('click', async () => {
            const path = await window.api.selectFile();
            if (path) {
                handleExtractFileSelection(path).then(() => {
                    showView(get('extract-audio-dashboard'));
                    resetNav();
                    if (navExtractAudio) navExtractAudio.classList.add('active');
                });
            }
        });
    }

    if (extractBackBtn) {
        extractBackBtn.addEventListener('click', () => {
            showView(extractAudioDropZone);
            const resetNav = () => {
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            };
            resetNav();
            if (navExtractAudio) navExtractAudio.classList.add('active');
        });
    }

    if (extractAddQueueBtn) {
        extractAddQueueBtn.addEventListener('click', () => {
            if (!extractFilePath) return;
            const options = getExtractOptionsFromUI();

            if (state.currentEditingQueueId !== null) {
                const item = state.encodingQueue.find(i => i.id === state.currentEditingQueueId);
                if (item && item.taskType === 'extract') {
                    item.options = options;
                    if (item.status === 'failed' || item.status === 'pending') {
                        item.status = 'pending';
                        item.progress = 0;
                        item.error = null;
                    }
                    state.setCurrentEditingQueueId(null);
                }
            } else {
                addToQueue(options, 'extract');
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
            if (progressTitle) progressTitle.textContent = 'Extracting audio...';
            if (progressFilename) progressFilename.textContent = extractFilePath.split(/[\\/]/).pop();
            resetProgress();
            showView(progressView);
            
            const toggleSidebar = (disabled) => {
                const navItems = document.querySelectorAll('.nav-item');
                navItems.forEach(btn => {
                    btn.classList.toggle('disabled', disabled);
                });
            };
            toggleSidebar(true);

            const options = getExtractOptionsFromUI();
            window.api.extractAudio({
                ...options,
                workPriority: state.appSettings.workPriority || 'normal'
            });
        });
    }
}

export function getExtractFilePath() {
    return extractFilePath;
}

export function setExtractFilePath(path) {
    extractFilePath = path;
}
