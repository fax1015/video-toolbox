// Video Trimmer Module

import { get, showPopup, showView, updateTextContent } from './ui-utils.js';
import { resetNav } from './ui-utils.js';
import * as state from './state.js';
import { addToQueue, updateQueueUI } from './queue.js';

// Time conversion utilities
export function timeStringToSeconds(str) {
    if (!str || typeof str !== 'string') return 0;

    const [timePart, msPart] = str.trim().split('.');
    const parts = timePart.split(':').map(Number).filter(n => !isNaN(n));

    let totalSeconds = 0;
    if (parts.length === 3) totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) totalSeconds = parts[0] * 60 + parts[1];
    else if (parts.length === 1) totalSeconds = parts[0];

    if (msPart) {
        const cs = parseInt(msPart.padEnd(2, '0').substring(0, 2));
        if (!isNaN(cs)) {
            totalSeconds += cs / 100;
        }
    }

    return totalSeconds;
}

export function secondsToTimeString(sec) {
    sec = Math.max(0, sec);
    const totalCentiseconds = Math.floor(sec * 100);
    const centiseconds = totalCentiseconds % 100;
    const totalSeconds = Math.floor(sec);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':') + '.' + centiseconds.toString().padStart(2, '0');
}

export function formatDisplayTime(sec) {
    sec = Math.max(0, sec);
    const totalSeconds = Math.floor(sec);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Smart Seeker for smooth video scrubbing
const smartSeeker = {
    isSeeking: false,
    pendingTime: null,
    lastSeekTime: 0,
    SEEK_DEBOUNCE_MS: 16,

    seek: function (videoElement, time, force = false) {
        if (!videoElement) return;

        const now = performance.now();
        this.showPreview(time);

        if (force) {
            this.pendingTime = null;
            this.lastSeekTime = now;
            this.isSeeking = true;
            videoElement.currentTime = time;
            return;
        }

        if (this.isSeeking) {
            this.pendingTime = time;
            return;
        }

        const timeSinceLastSeek = now - this.lastSeekTime;
        if (timeSinceLastSeek < this.SEEK_DEBOUNCE_MS && this.pendingTime === null) {
            this.pendingTime = time;
            return;
        }

        this.lastSeekTime = now;
        this.isSeeking = true;
        this.pendingTime = null;

        if (videoElement.fastSeek) {
            videoElement.fastSeek(time);
        } else {
            videoElement.currentTime = time;
        }
    },

    onSeeked: function (videoElement) {
        this.isSeeking = false;

        if (this.pendingTime !== null) {
            const t = this.pendingTime;
            this.pendingTime = null;
            setTimeout(() => {
                this.seek(videoElement, t);
            }, 0);
        } else {
            requestAnimationFrame(() => this.hidePreview());
        }
    },

    reset: function () {
        this.isSeeking = false;
        this.pendingTime = null;
        this.lastSeekTime = 0;
        this.hidePreview();
        thumbnailCache.clear();
    },

    showPreview: function (time) {
        const scrubPreview = get('scrub-preview');
        const cachedData = thumbnailCache.get(state.trimFilePath);
        if (!cachedData || !scrubPreview) return;

        const frameIndex = Math.min(
            Math.max(0, Math.floor(time / cachedData.interval)),
            cachedData.count - 1
        );
        if (frameIndex < 0) return;

        const cols = cachedData.cols || 1;
        const rows = cachedData.rows || 1;

        const col = frameIndex % cols;
        const row = Math.floor(frameIndex / cols);

        const posX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
        const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;

        scrubPreview.style.backgroundPosition = `${posX}% ${posY}%`;
        scrubPreview.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
        scrubPreview.classList.remove('hidden');
    },

    hidePreview: function () {
        const scrubPreview = get('scrub-preview');
        if (scrubPreview) scrubPreview.classList.add('hidden');
    }
};

// Thumbnail cache
const thumbnailCache = {
    data: null,
    filePath: null,

    set: function (filePath, data) {
        if (this.filePath !== filePath) {
            this.clear();
        }
        this.filePath = filePath;
        this.data = data;
    },

    get: function (filePath) {
        if (this.filePath === filePath) {
            return this.data;
        }
        return null;
    },

    clear: function () {
        this.data = null;
        this.filePath = null;
        const scrubPreview = get('scrub-preview');
        if (scrubPreview) {
            scrubPreview.style.backgroundImage = '';
        }
    }
};


let trimDragging = null;
let trimDragStartX = 0;
let trimDragInitialStart = 0;
let trimDragInitialEnd = 0;
let isDraggingPlayhead = false;
let playheadDragRaf = null;
let finalSeekOnMouseUp = null;
let waveformMode = 'waveform';
const waveformOptions = {
    width: 800,
    height: 100,
    palette: 'accent'
};
const waveformCache = new Map();
let trimLoadingTimeout = null;
let trimLoadingToken = 0;
const TRIM_LOADING_MAX_MS = 6000;

function startTrimLoading() {
    trimLoadingToken += 1;
    const token = trimLoadingToken;
    const trimLoading = get('trim-loading');
    const trimDashboard = get('trim-dashboard');
    if (trimLoading) trimLoading.classList.remove('hidden');
    if (trimDashboard) trimDashboard.classList.add('trim-loading-active');
    if (trimLoadingTimeout) clearTimeout(trimLoadingTimeout);
    trimLoadingTimeout = setTimeout(() => {
        endTrimLoading(token);
    }, TRIM_LOADING_MAX_MS);
    return token;
}

function endTrimLoading(token) {
    if (token !== trimLoadingToken) return;
    const trimLoading = get('trim-loading');
    const trimDashboard = get('trim-dashboard');
    if (trimLoading) trimLoading.classList.add('hidden');
    if (trimDashboard) trimDashboard.classList.remove('trim-loading-active');
    if (trimLoadingTimeout) {
        clearTimeout(trimLoadingTimeout);
        trimLoadingTimeout = null;
    }
}

function updateWaveformModeUI() {
    const waveBtn = get('trim-waveform-mode-waveform');
    const specBtn = get('trim-waveform-mode-spectrogram');
    if (waveBtn) waveBtn.classList.toggle('active', waveformMode === 'waveform');
    if (specBtn) specBtn.classList.toggle('active', waveformMode === 'spectrogram');
}

function normalizeHexColor(color) {
    if (!color || typeof color !== 'string') return '63f1af';
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
        const hex = trimmed.slice(1);
        if (hex.length === 3) {
            return hex.split('').map((c) => c + c).join('');
        }
        if (hex.length === 6) return hex;
    }
    const match = trimmed.match(/rgba?\(([^)]+)\)/i);
    if (match) {
        const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
        if (parts.length >= 3) {
            const [r, g, b] = parts;
            if ([r, g, b].every((v) => Number.isFinite(v))) {
                return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
            }
        }
    }
    return '63f1af';
}

function getAccentHex() {
    const accent = getComputedStyle(document.body).getPropertyValue('--accent-primary');
    return normalizeHexColor(accent);
}

function getWaveformCacheKey(filePath, mode, palette, width, height, accentHex) {
    return `${filePath}|${mode}|${palette}|${width}x${height}|${accentHex}`;
}

async function loadTrimWaveform(filePath) {
    const trimWaveformWrap = get('trim-waveform-wrap');
    const trimWaveformImg = get('trim-waveform-img');
    if (!trimWaveformWrap || !trimWaveformImg || !filePath) return;

    const requestMode = waveformMode;
    const accentHex = getAccentHex();
    const cacheKey = getWaveformCacheKey(
        filePath,
        requestMode,
        waveformOptions.palette,
        waveformOptions.width,
        waveformOptions.height,
        accentHex
    );
    trimWaveformWrap.dataset.mode = requestMode;
    trimWaveformWrap.classList.remove('has-waveform');
    trimWaveformImg.removeAttribute('src');

    const cached = waveformCache.get(cacheKey);
    if (cached) {
        if (window.api?.logInfo) window.api.logInfo('Using cached waveform, length:', cached.length); else console.log('Using cached waveform, length:', cached.length);
        trimWaveformImg.src = 'data:image/png;base64,' + cached;
        trimWaveformWrap.classList.add('has-waveform');
        return;
    }

    try {
        const waveformBase64 = await window.api.getAudioWaveform({
            filePath,
            mode: requestMode,
            width: waveformOptions.width,
            height: waveformOptions.height,
            palette: waveformOptions.palette,
            paletteColor: accentHex
        });

        if (window.api?.logInfo) window.api.logInfo('Waveform loaded successfully, mode:', requestMode, 'length:', waveformBase64?.length); else console.log('Waveform loaded successfully, mode:', requestMode, 'length:', waveformBase64?.length);

        if (waveformBase64 && state.trimFilePath === filePath && waveformMode === requestMode) {
            waveformCache.set(cacheKey, waveformBase64);
            trimWaveformImg.src = 'data:image/png;base64,' + waveformBase64;
            trimWaveformWrap.classList.add('has-waveform');

            // Ensure image is visible
            trimWaveformImg.style.display = 'block';
        }
    } catch (e) {
        if (window.api?.logError) window.api.logError('Waveform generation failed:', e); else console.error('Waveform generation failed:', e);
        if (window.api?.logError) window.api.logError('Waveform request params:', { filePath, mode: requestMode, width: waveformOptions.width, height: waveformOptions.height, palette: waveformOptions.palette, paletteColor: accentHex }); else console.error('Waveform request params:', { filePath, mode: requestMode, width: waveformOptions.width, height: waveformOptions.height, palette: waveformOptions.palette, paletteColor: accentHex });

        // Show error state in waveform container
        trimWaveformWrap.classList.remove('has-waveform');

        // Remove any existing error message
        const existingError = trimWaveformWrap.querySelector('.waveform-error');
        if (existingError) existingError.remove();

        // Add error message
        const errorMsg = document.createElement('div');
        errorMsg.className = 'waveform-error';
        errorMsg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font-size:12px;text-align:center;';
        errorMsg.textContent = 'Audio waveform unavailable';
        trimWaveformWrap.appendChild(errorMsg);

        // Still show the image container for debugging
        trimWaveformImg.style.display = 'block';
    }
}

async function preloadTrimWaveforms(filePath) {
    if (!filePath) return;
    const accentHex = getAccentHex();
    const modes = ['waveform', 'spectrogram'];
    await Promise.all(modes.map(async (mode) => {
        const cacheKey = getWaveformCacheKey(
            filePath,
            mode,
            waveformOptions.palette,
            waveformOptions.width,
            waveformOptions.height,
            accentHex
        );
        if (waveformCache.has(cacheKey)) return;
        try {
            const waveformBase64 = await window.api.getAudioWaveform({
                filePath,
                mode,
                width: waveformOptions.width,
                height: waveformOptions.height,
                palette: waveformOptions.palette,
                paletteColor: accentHex
            });
            if (waveformBase64 && state.trimFilePath === filePath) {
                waveformCache.set(cacheKey, waveformBase64);
            }
        } catch (e) {
            // Ignore preload failures
        }
    }));
}

async function resolveBitrateKbps(filePath, metadata) {
    const parsed = parseFloat(metadata?.bitrate) || 0;
    if (parsed > 0) return parsed;

    if (!window.api || !window.api.getMetadataFull) return 0;

    try {
        const full = await window.api.getMetadataFull(filePath);
        // Note: Tauri errors are thrown, not returned as objects with 'error' property
        // The check below is kept for robustness but errors are also caught by catch block
        if (!full) return 0;

        const formatBitrate = parseFloat(full.format?.bit_rate) || 0;
        if (formatBitrate > 0) return Math.round(formatBitrate / 1000);

        let streamBitrate = 0;
        const streams = Array.isArray(full.streams) ? full.streams : [];
        streams.forEach((stream) => {
            const br = parseFloat(stream.bit_rate) || 0;
            if (br > streamBitrate) streamBitrate = br;
        });
        if (streamBitrate > 0) return Math.round(streamBitrate / 1000);

        const sizeBytes = parseFloat(full.format?.size) || 0;
        const durationSec = parseFloat(full.format?.duration) || 0;
        if (sizeBytes > 0 && durationSec > 0) {
            const bitsPerSecond = (sizeBytes * 8) / durationSec;
            return Math.round(bitsPerSecond / 1000);
        }
    } catch (err) {
        if (window.api?.logWarn) window.api.logWarn('Failed to resolve bitrate:', err); else console.warn('Failed to resolve bitrate:', err);
    }

    return 0;
}

function updateTrimTimelineVisual() {
    const trimInactiveStart = get('trim-inactive-start');
    const trimInactiveEnd = get('trim-inactive-end');
    const trimRangeHandles = get('trim-range-handles');

    if (!state.trimDurationSeconds || !trimInactiveStart || !trimInactiveEnd || !trimRangeHandles) return;

    const startPct = (state.trimStartSeconds / state.trimDurationSeconds) * 100;
    const endPct = (state.trimEndSeconds / state.trimDurationSeconds) * 100;
    const activePct = endPct - startPct;

    trimInactiveStart.style.width = startPct + '%';
    trimRangeHandles.style.width = activePct + '%';
    trimInactiveEnd.style.width = (100 - endPct) + '%';
}

function syncTrimInputsFromVisual() {
    const trimStartInput = get('trim-start');
    const trimEndInput = get('trim-end');
    const trimmedDurationEl = get('trimmed-duration');
    const estimatedFileSizeEl = get('estimated-file-size');

    if (trimStartInput) trimStartInput.value = secondsToTimeString(state.trimStartSeconds);
    if (trimEndInput) trimEndInput.value = secondsToTimeString(state.trimEndSeconds);
    updateTrimTimelineVisual();

    const trimmedLengthSeconds = state.trimEndSeconds - state.trimStartSeconds;
    if (trimmedDurationEl) updateTextContent(trimmedDurationEl, secondsToTimeString(trimmedLengthSeconds));

    estimateTrimmedFileSize(trimmedLengthSeconds, estimatedFileSizeEl);
}

export async function loadTrimQueueItem(item) {
    if (!item || !item.options || !item.options.input) return;

    // Save the bitrate before loading to ensure it's preserved
    const savedBitrate = item.options.originalFileBitrate;

    await handleTrimFileSelection(item.options.input);

    // After loading, check if we got a bitrate from metadata
    // If not, or if saved bitrate is better, use the saved one
    if (savedBitrate !== undefined && savedBitrate !== null && savedBitrate > 0) {
        // Always use saved bitrate if available, as it's the original
        state.setOriginalFileBitrate(savedBitrate);
    }

    const startSeconds = Math.max(0, item.options.startSeconds ?? 0);
    const endSeconds = Math.min(
        state.trimDurationSeconds || startSeconds,
        Math.max(startSeconds + 1, item.options.endSeconds ?? state.trimDurationSeconds)
    );

    state.setTrimTime(state.trimDurationSeconds, startSeconds, endSeconds);

    // Force update of timeline and file size with correct bitrate and trim times
    updateTrimTimelineVisual();
    syncTrimInputsFromVisual();

    const trimAddQueueBtn = get('trim-add-queue-btn');
    if (trimAddQueueBtn) {
        trimAddQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Update Item
        `;
    }
}

function estimateTrimmedFileSize(trimmedLengthSeconds, estimatedFileSizeEl) {
    if (!estimatedFileSizeEl) return;

    if (!state.originalFileBitrate || trimmedLengthSeconds <= 0) {
        estimatedFileSizeEl.textContent = 'N/A';
        return;
    }

    const bitrateKbps = state.originalFileBitrate;
    if (bitrateKbps === 0) {
        estimatedFileSizeEl.textContent = 'N/A';
        return;
    }

    const estimatedBytes = (trimmedLengthSeconds * bitrateKbps * 1000) / 8;
    const estimatedMB = estimatedBytes / (1024 * 1024);

    if (estimatedMB > 1024) {
        estimatedFileSizeEl.textContent = `${(estimatedMB / 1024.0).toFixed(2)} GB`;
    } else {
        estimatedFileSizeEl.textContent = `${estimatedMB.toFixed(2)} MB`;
    }
}

export async function handleTrimFileSelection(filePath) {
    const trimFilenameEl = get('trim-filename');
    const trimFileIcon = get('trim-file-icon');
    const trimFileDuration = get('trim-file-duration');
    const trimWaveformWrap = get('trim-waveform-wrap');
    const trimWaveformImg = get('trim-waveform-img');

    const trimAddQueueBtn = get('trim-add-queue-btn');
    const trimStartInput = get('trim-start');
    const trimEndInput = get('trim-end');
    const trimmedDurationEl = get('trimmed-duration');
    const estimatedFileSizeEl = get('estimated-file-size');
    const trimVideoPreview = get('trim-video-preview');
    const videoPreviewContainer = get('video-preview-container');
    const videoCurrentTime = get('video-current-time');
    const trimPlayhead = get('trim-playhead');
    const loadingToken = startTrimLoading();

    // Preserve bitrate if same file is being reloaded
    const previousBitrate = (filePath === state.trimFilePath) ? state.originalFileBitrate : 0;

    smartSeeker.reset();
    state.setTrimFilePath(filePath);

    const name = filePath.split(/[\\\\/]/).pop();
    const ext = name.split('.').pop().toUpperCase();

    if (trimFilenameEl) trimFilenameEl.textContent = name;
    if (trimFileIcon) trimFileIcon.textContent = ext;
    if (trimFileDuration) trimFileDuration.textContent = '...';
    if (trimWaveformWrap) trimWaveformWrap.classList.remove('has-waveform');
    if (trimWaveformImg) trimWaveformImg.removeAttribute('src');

    // Note: showView() is called by the caller (main.js loadQueueItem) to avoid double animations

    if (state.currentEditingQueueId === null && trimAddQueueBtn) {
        trimAddQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Add to Queue
        `;
    }

    if (trimmedDurationEl) trimmedDurationEl.textContent = '00:00:00';
    if (estimatedFileSizeEl) estimatedFileSizeEl.textContent = 'Calculating...';

    if (trimVideoPreview) {
        // Use convertFileSrc for Tauri
        const videoSrc = window.api.convertFileSrc(filePath);
        if (window.api?.logInfo) window.api.logInfo('Setting video src:', videoSrc); else console.log('Setting video src:', videoSrc);

        // Configure video element
        trimVideoPreview.src = videoSrc;
        trimVideoPreview.currentTime = 0;
        trimVideoPreview.playsInline = true;
        trimVideoPreview.preload = 'auto';

        // Add error handling for video loading
        trimVideoPreview.onerror = function (e) {
            if (window.api?.logError) window.api.logError('Video preview load error:', e); else console.error('Video preview load error:', e);
            if (window.api?.logError) window.api.logError('Video src:', trimVideoPreview.src); else console.error('Video src:', trimVideoPreview.src);
            if (window.api?.logError) window.api.logError('Video error code:', trimVideoPreview.error?.code, trimVideoPreview.error?.message); else console.error('Video error code:', trimVideoPreview.error?.code, trimVideoPreview.error?.message);
        };

        trimVideoPreview.onloadeddata = function () {
            if (window.api?.logInfo) window.api.logInfo('Video preview loaded successfully, duration:', trimVideoPreview.duration); else console.log('Video preview loaded successfully, duration:', trimVideoPreview.duration);
        };

        // Try to load the video
        trimVideoPreview.load();
    }
    if (videoCurrentTime) videoCurrentTime.textContent = '00:00';
    if (trimPlayhead) trimPlayhead.style.left = '0%';

    try {
        const metadata = await window.api.getMetadata(filePath);
        const duration = metadata.durationSeconds || 0;
        state.setTrimTime(duration, 0, duration);

        // Use metadata bitrate, or a more reliable ffprobe fallback if needed
        const resolvedBitrate = await resolveBitrateKbps(filePath, metadata);
        state.setOriginalFileBitrate(resolvedBitrate || previousBitrate);

        if (trimFileDuration) trimFileDuration.textContent = metadata.duration;

        if (videoPreviewContainer && metadata.width && metadata.height) {
            videoPreviewContainer.style.aspectRatio = `${metadata.width} / ${metadata.height}`;
        }

        if (trimStartInput) trimStartInput.value = '00:00:00';
        if (trimEndInput) trimEndInput.value = secondsToTimeString(duration);

        updateTrimTimelineVisual();
        syncTrimInputsFromVisual();

        await loadTrimWaveform(filePath);
        preloadTrimWaveforms(filePath);
    } catch (e) {
        if (window.api?.logError) window.api.logError('Failed to load trim file:', e); else console.error('Failed to load trim file:', e);
        if (trimFileDuration) trimFileDuration.textContent = 'Unknown';
        state.setTrimTime(0, 0, 0);
        // Update estimated file size to show error state when metadata fails
        if (estimatedFileSizeEl) {
            estimatedFileSizeEl.textContent = 'N/A';
        }
        endTrimLoading(loadingToken);
    }

    // Generate thumbnails
    if (state.trimDurationSeconds > 0) {
        window.api.getVideoThumbnails({
            filePath,
            duration: state.trimDurationSeconds,
            count: 150
        }).then(data => {
            if (data && state.trimFilePath === filePath) {
                if (window.api?.logInfo) window.api.logInfo('Thumbnails loaded:', data.count, 'frames'); else console.log('Thumbnails loaded:', data.count, 'frames');
                thumbnailCache.set(filePath, data);
                filmstripData = data;

                const scrubPreview = get('scrub-preview');
                if (scrubPreview) {
                    scrubPreview.style.backgroundImage = `url(data:image/jpeg;base64,${data.data})`;
                    scrubPreview.style.backgroundSize = `auto 100%`;
                    scrubPreview.style.backgroundRepeat = 'no-repeat';
                }
            }
            endTrimLoading(loadingToken);
        }).catch(e => {
            if (window.api?.logError) window.api.logError('Thumbnail generation failed:', e); else console.error('Thumbnail generation failed:', e);
            thumbnailCache.clear();
            endTrimLoading(loadingToken);
        });
    } else {
        endTrimLoading(loadingToken);
    }
}

export function setupTrimmerHandlers() {
    const trimDropZone = get('trim-drop-zone');
    const trimBackBtn = get('trim-back-btn');
    const trimAddQueueBtn = get('trim-add-queue-btn');
    const trimVideoBtn = get('trim-video-btn');
    const trimStartInput = get('trim-start');
    const trimEndInput = get('trim-end');
    const trimHandleLeft = get('trim-handle-left');
    const trimHandleRight = get('trim-handle-right');
    const trimActiveSegment = get('trim-active-segment');
    const trimTimeline = get('trim-timeline');
    const trimPlayhead = get('trim-playhead');
    const trimVideoPreview = get('trim-video-preview');
    const videoPreviewContainer = get('video-preview-container');
    const trimMuteBtn = get('trim-mute-btn');
    const trimVolumeSlider = get('trim-volume-slider');
    const navTrim = get('nav-trim');
    const trimWaveformModeWave = get('trim-waveform-mode-waveform');
    const trimWaveformModeSpectrogram = get('trim-waveform-mode-spectrogram');

    if (trimDropZone) {
        trimDropZone.addEventListener('dragover', (e) => { e.preventDefault(); trimDropZone.classList.add('drag-over'); });
        trimDropZone.addEventListener('dragleave', () => trimDropZone.classList.remove('drag-over'));
        trimDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            trimDropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                handleTrimFileSelection(file.path).then(() => {
                    showView(get('trim-dashboard'));
                    resetNav();
                    if (navTrim) navTrim.classList.add('active');
                });
            }
        });
        trimDropZone.addEventListener('click', async () => {
            const path = await window.api.selectFile();
            if (path) {
                handleTrimFileSelection(path).then(() => {
                    showView(get('trim-dashboard'));
                    resetNav();
                    if (navTrim) navTrim.classList.add('active');
                });
            }
        });
    }

    if (trimBackBtn) {
        trimBackBtn.addEventListener('click', () => {
            showView(trimDropZone);
            resetNav();
            if (navTrim) navTrim.classList.add('active');
        });
    }

    updateWaveformModeUI();

    function setWaveformMode(mode) {
        if (mode !== 'waveform' && mode !== 'spectrogram') return;
        if (waveformMode === mode) return;
        waveformMode = mode;
        updateWaveformModeUI();
        if (state.trimFilePath) loadTrimWaveform(state.trimFilePath);
    }

    if (trimWaveformModeWave) {
        trimWaveformModeWave.addEventListener('click', () => setWaveformMode('waveform'));
    }

    if (trimWaveformModeSpectrogram) {
        trimWaveformModeSpectrogram.addEventListener('click', () => setWaveformMode('spectrogram'));
    }

    if (trimStartInput) {
        trimStartInput.addEventListener('change', () => {
            const newStart = Math.max(0, Math.min(state.trimEndSeconds - 1, timeStringToSeconds(trimStartInput.value)));
            const newEnd = Math.max(newStart + 1, state.trimEndSeconds);
            state.setTrimTime(state.trimDurationSeconds, newStart, newEnd);
            syncTrimInputsFromVisual();
        });
    }

    if (trimEndInput) {
        trimEndInput.addEventListener('change', () => {
            const newEnd = Math.min(state.trimDurationSeconds, Math.max(state.trimStartSeconds + 1, timeStringToSeconds(trimEndInput.value)));
            const newStart = Math.min(state.trimStartSeconds, newEnd - 1);
            state.setTrimTime(state.trimDurationSeconds, newStart, newEnd);
            syncTrimInputsFromVisual();
        });
    }

    if (trimAddQueueBtn) {
        trimAddQueueBtn.addEventListener('click', () => {
            if (!state.trimFilePath || !state.trimDurationSeconds) return;
            if (state.trimDurationSeconds < 1) {
                showPopup('Video is too short to trim.');
                return;
            }

            const inputStart = trimStartInput ? timeStringToSeconds(trimStartInput.value) : state.trimStartSeconds;
            const inputEnd = trimEndInput ? timeStringToSeconds(trimEndInput.value) : state.trimEndSeconds;
            const clampedStart = Math.max(0, Math.min(inputEnd - 1, inputStart));
            const clampedEnd = Math.min(state.trimDurationSeconds, Math.max(clampedStart + 1, inputEnd));
            state.setTrimTime(state.trimDurationSeconds, clampedStart, clampedEnd);
            syncTrimInputsFromVisual();

            const outputFolderInput = get('output-folder');
            const options = {
                input: state.trimFilePath,
                startSeconds: state.trimStartSeconds,
                endSeconds: state.trimEndSeconds,
                outputFolder: outputFolderInput ? outputFolderInput.value : '',
                originalFileBitrate: state.originalFileBitrate || 0
            };

            if (state.currentEditingQueueId !== null) {
                const item = state.encodingQueue.find(i => i.id === state.currentEditingQueueId);
                if (item && item.taskType === 'trim') {
                    item.options = options;
                    item.name = options.input.split(/[\\/]/).pop();
                    if (item.status === 'failed' || item.status === 'pending') {
                        item.status = 'pending';
                        item.state = 'pending';
                        item.progress = 0;
                        item.error = null;
                    }
                    state.setCurrentEditingQueueId(null);
                    updateQueueUI();
                }
            } else {
                addToQueue(options, 'trim');
            }

            const queueView = get('queue-view');
            const navQueue = get('nav-queue');
            showView(queueView);
            resetNav();
            if (navQueue) navQueue.classList.add('active');
        });
    }

    if (trimVideoBtn) {
        trimVideoBtn.addEventListener('click', () => {
            if (!state.trimFilePath || !state.trimDurationSeconds) return;
            if (state.trimDurationSeconds < 1) {
                alert('Video is too short to trim.');
                return;
            }

            state.setTrimming(true);
            const progressTitle = get('progress-title');
            const progressFilename = get('progress-filename');
            const progressView = get('progress-view');
            const outputFolderInput = get('output-folder');

            if (progressTitle) progressTitle.textContent = 'Trimming video...';
            if (progressFilename) progressFilename.textContent = state.trimFilePath.split(/[\\/]/).pop();

            showView(progressView);
            state.setLastActiveViewId('trimDropZone');

            window.api.trimVideo({
                input: state.trimFilePath,
                startSeconds: state.trimStartSeconds,
                endSeconds: state.trimEndSeconds,
                outputFolder: outputFolderInput ? outputFolderInput.value : '',
                workPriority: state.appSettings.workPriority || 'normal'
            });
        });
    }

    // Trim handle dragging - simplified version
    if (trimHandleLeft || trimHandleRight || trimActiveSegment || trimTimeline) {
        setupTrimDragHandlers(trimHandleLeft, trimHandleRight, trimActiveSegment, trimTimeline, trimPlayhead, trimVideoPreview);
    }

    // Video preview controls
    if (trimVideoPreview) {
        setupVideoPreviewHandlers(trimVideoPreview, videoPreviewContainer, trimMuteBtn, trimVolumeSlider);
    }
}

function setupTrimDragHandlers(handleLeft, handleRight, activeSegment, timeline, playhead, videoPreview) {
    const trimTrack = get('trim-track');
    const videoCurrentTime = get('video-current-time');
    // Use module-level variables instead of redeclaring (fixes scope bug)
    isDraggingPlayhead = false;
    playheadDragRaf = null;
    finalSeekOnMouseUp = null;
    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
    const downEvent = supportsPointer ? 'pointerdown' : 'mousedown';
    const moveEvent = supportsPointer ? 'pointermove' : 'mousemove';
    const upEvent = supportsPointer ? 'pointerup' : 'mouseup';

    function trimTrackXToSeconds(clientX) {
        if (!trimTrack || !state.trimDurationSeconds) return 0;
        const rect = trimTrack.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return x * state.trimDurationSeconds;
    }

    function getTimelineTime(clientX) {
        if (!timeline || !state.trimDurationSeconds) return 0;
        const rect = timeline.getBoundingClientRect();
        let pct = (clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        return pct * state.trimDurationSeconds;
    }

    function updatePreviewTime(time) {
        if (!videoCurrentTime) return;
        updateTextContent(videoCurrentTime, formatDisplayTime(time));
    }

    function onTrimDragMove(e) {
        if (!trimDragging || !state.trimDurationSeconds || !trimTrack) return;
        const sec = trimTrackXToSeconds(e.clientX);
        let newStart = state.trimStartSeconds;
        let newEnd = state.trimEndSeconds;

        if (trimDragging === 'start') {
            newStart = Math.max(0, Math.min(state.trimEndSeconds - 1, sec));
            newEnd = Math.max(newStart + 1, state.trimEndSeconds);
        } else if (trimDragging === 'end') {
            newEnd = Math.min(state.trimDurationSeconds, Math.max(state.trimStartSeconds + 1, sec));
            newStart = Math.min(state.trimStartSeconds, newEnd - 1);
        } else if (trimDragging === 'range') {
            const delta = (e.clientX - trimDragStartX) / trimTrack.getBoundingClientRect().width * state.trimDurationSeconds;
            newStart = trimDragInitialStart + delta;
            newEnd = trimDragInitialEnd + delta;
            if (newStart < 0) {
                newEnd -= newStart;
                newStart = 0;
            }
            if (newEnd > state.trimDurationSeconds) {
                newStart -= (newEnd - state.trimDurationSeconds);
                newEnd = state.trimDurationSeconds;
            }
            newStart = Math.max(0, newStart);
            newEnd = Math.min(state.trimDurationSeconds, Math.max(newStart + 1, newEnd));
        }

        state.setTrimTime(state.trimDurationSeconds, newStart, newEnd);
        updateTrimTimelineVisual();
        syncTrimInputsFromVisual();

        if (videoPreview) {
            let targetTime = -1;
            if (trimDragging === 'start') targetTime = state.trimStartSeconds;
            else if (trimDragging === 'end') targetTime = state.trimEndSeconds;
            if (targetTime >= 0) {
                const pct = (targetTime / state.trimDurationSeconds) * 100;
                if (playhead) playhead.style.left = pct + '%';
                smartSeeker.seek(videoPreview, targetTime);
                updatePreviewTime(targetTime);
            }
        }
    }

    function onTrimDragEnd() {
        if (videoPreview) {
            let targetTime = -1;
            if (trimDragging === 'start') targetTime = state.trimStartSeconds;
            else if (trimDragging === 'end') targetTime = state.trimEndSeconds;
            if (targetTime >= 0) smartSeeker.seek(videoPreview, targetTime, true);
        }
        trimDragging = null;
        document.removeEventListener(moveEvent, onTrimDragMove);
        document.removeEventListener(upEvent, onTrimDragEnd);
    }

    function onPlayheadDragMove(e) {
        if (!isDraggingPlayhead) return;
        finalSeekOnMouseUp = e.clientX;
        if (playheadDragRaf !== null) cancelAnimationFrame(playheadDragRaf);
        playheadDragRaf = requestAnimationFrame(() => {
            if (!isDraggingPlayhead) { playheadDragRaf = null; return; }
            const time = getTimelineTime(e.clientX);
            if (isFinite(time)) {
                if (playhead && state.trimDurationSeconds) {
                    const pct = (time / state.trimDurationSeconds) * 100;
                    playhead.style.left = pct + '%';
                }
                smartSeeker.seek(videoPreview, time);
                updatePreviewTime(time);
            }
            playheadDragRaf = null;
        });
    }

    function onPlayheadDragEnd() {
        if (finalSeekOnMouseUp !== null && videoPreview) {
            const time = getTimelineTime(finalSeekOnMouseUp);
            if (isFinite(time)) {
                if (playhead && state.trimDurationSeconds) {
                    const pct = (time / state.trimDurationSeconds) * 100;
                    playhead.style.left = pct + '%';
                }
                smartSeeker.seek(videoPreview, time, true);
            }
        }
        isDraggingPlayhead = false;
        finalSeekOnMouseUp = null;
        if (playheadDragRaf !== null) { cancelAnimationFrame(playheadDragRaf); playheadDragRaf = null; }
        document.removeEventListener(moveEvent, onPlayheadDragMove);
        document.removeEventListener(upEvent, onPlayheadDragEnd);
    }

    if (handleLeft) {
        handleLeft.addEventListener(downEvent, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!state.trimDurationSeconds) return;
            if (supportsPointer && e.pointerId !== undefined) {
                try {
                    handleLeft.setPointerCapture(e.pointerId);
                } catch (err) {
                    if (window.api?.logWarn) window.api.logWarn('Failed to capture pointer on left handle', err); else console.warn('Failed to capture pointer on left handle', err);
                }
            }
            trimDragging = 'start';
            document.addEventListener(moveEvent, onTrimDragMove);
            document.addEventListener(upEvent, onTrimDragEnd);
        });
    }
    if (handleRight) {
        handleRight.addEventListener(downEvent, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!state.trimDurationSeconds) return;
            if (supportsPointer && e.pointerId !== undefined) {
                try {
                    handleRight.setPointerCapture(e.pointerId);
                } catch (err) {
                    if (window.api?.logWarn) window.api.logWarn('Failed to capture pointer on right handle', err); else console.warn('Failed to capture pointer on right handle', err);
                }
            }
            trimDragging = 'end';
            document.addEventListener(moveEvent, onTrimDragMove);
            document.addEventListener(upEvent, onTrimDragEnd);
        });
    }
    if (activeSegment) {
        activeSegment.addEventListener(downEvent, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!state.trimDurationSeconds) return;
            if (supportsPointer && e.pointerId !== undefined) {
                try {
                    activeSegment.setPointerCapture(e.pointerId);
                } catch (err) {
                    if (window.api?.logWarn) window.api.logWarn('Failed to capture pointer on active segment', err); else console.warn('Failed to capture pointer on active segment', err);
                }
            }
            trimDragging = 'range';
            trimDragStartX = e.clientX;
            trimDragInitialStart = state.trimStartSeconds;
            trimDragInitialEnd = state.trimEndSeconds;
            document.addEventListener(moveEvent, onTrimDragMove);
            document.addEventListener(upEvent, onTrimDragEnd);
        });
    }
    if (timeline && playhead && videoPreview) {
        timeline.addEventListener(downEvent, (e) => {
            if (e.target.closest('.trim-handle') || e.target.closest('.trim-active-segment') || e.target.closest('.trim-waveform-toolbar')) return;
            e.preventDefault();
            isDraggingPlayhead = true;
            const time = getTimelineTime(e.clientX);
            if (isFinite(time)) {
                if (playhead && state.trimDurationSeconds) {
                    const pct = (time / state.trimDurationSeconds) * 100;
                    playhead.style.left = pct + '%';
                }
                smartSeeker.seek(videoPreview, time);
                updatePreviewTime(time);
                finalSeekOnMouseUp = e.clientX;
            }

            document.addEventListener(moveEvent, onPlayheadDragMove);
            document.addEventListener(upEvent, onPlayheadDragEnd);
        });
    }
}
function setupVideoPreviewHandlers(videoPreview, container, muteBtn, volumeSlider) {
    const playhead = get('trim-playhead');
    const playBtn = get('trim-play-btn');
    const playBtnIcon = get('play-btn-icon');
    const pauseBtnIcon = get('pause-btn-icon');
    const videoCurrentTime = get('video-current-time');
    const volumeIcon = get('volume-icon');
    const mutedIcon = get('muted-icon');
    let playPauseAnimTimeout = null;
    const videoOverlay = get('video-overlay');
    const playIconShape = get('play-icon-shape');
    const pauseIconShape = get('pause-icon-shape');
    let lastVolume = 1;

    function showPlayPauseAnimation(isPlaying) {
        if (!videoOverlay || !playIconShape || !pauseIconShape) return;
        playIconShape.classList.toggle('hidden', isPlaying);
        pauseIconShape.classList.toggle('hidden', !isPlaying);
        videoOverlay.classList.remove('show-icon');
        void videoOverlay.offsetWidth;
        videoOverlay.classList.add('show-icon');
        if (playPauseAnimTimeout) clearTimeout(playPauseAnimTimeout);
        playPauseAnimTimeout = setTimeout(() => {
            videoOverlay.classList.remove('show-icon');
        }, 600);
    }

    function updatePlayhead() {
        if (!videoPreview || !playhead || !state.trimDurationSeconds) return;
        const pct = (videoPreview.currentTime / state.trimDurationSeconds) * 100;
        playhead.style.left = pct + '%';
    }

    function updateCurrentTime() {
        if (!videoCurrentTime || !videoPreview) return;
        const time = isFinite(videoPreview.currentTime) ? videoPreview.currentTime : 0;
        updateTextContent(videoCurrentTime, formatDisplayTime(time));
    }

    function updateMuteIcon() {
        if (!volumeIcon || !mutedIcon || !videoPreview) return;
        const isMuted = videoPreview.muted || videoPreview.volume === 0;
        volumeIcon.classList.toggle('hidden', isMuted);
        mutedIcon.classList.toggle('hidden', !isMuted);
    }

    function updateVolumeSliderBackground() {
        if (!volumeSlider) return;
        const value = (volumeSlider.value - volumeSlider.min) / (volumeSlider.max - volumeSlider.min) * 100;
        volumeSlider.style.background = `linear-gradient(to right, var(--accent-primary) ${value}%, rgba(255, 255, 255, 0.2) ${value}%)`;
    }

    function applyVolume(value, shouldMute) {
        if (!videoPreview) return;
        const normalized = Math.max(0, Math.min(1, value));
        videoPreview.volume = normalized;
        videoPreview.muted = !!shouldMute || normalized === 0;
        if (volumeSlider) volumeSlider.value = normalized.toString();
        updateMuteIcon();
        updateVolumeSliderBackground();
    }

    function toggleMuteFromIcon() {
        if (!videoPreview) return;
        const isMuted = videoPreview.muted || videoPreview.volume === 0;
        if (isMuted) {
            applyVolume(lastVolume > 0 ? lastVolume : 1, false);
        } else {
            lastVolume = videoPreview.volume > 0 ? videoPreview.volume : lastVolume;
            applyVolume(0, true);
        }
    }

    function updatePlayBtn() {
        if (!playBtnIcon || !pauseBtnIcon || !videoPreview) return;
        const isPaused = videoPreview.paused;
        playBtnIcon.classList.toggle('hidden', !isPaused);
        pauseBtnIcon.classList.toggle('hidden', isPaused);
    }

    const togglePlay = (e) => {
        if (e) {
            if (e.target.closest('.video-controls') || e.target.closest('.trim-timeline-wrap')) return;
            e.stopPropagation();
        }
        if (!videoPreview) return;
        if (videoPreview.paused) {
            videoPreview.play().catch(e => { if (window.api?.logError) window.api.logError('Play failed:', e); else console.error('Play failed:', e); });
            showPlayPauseAnimation(true);
        } else {
            videoPreview.pause();
            showPlayPauseAnimation(false);
        }
    };

    if (container) {
        container.addEventListener('click', togglePlay);
    }

    if (videoOverlay) {
        videoOverlay.addEventListener('click', togglePlay);
    }

    if (playBtn) {
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!videoPreview) return;
            if (videoPreview.paused) {
                videoPreview.play().catch(e => { if (window.api?.logError) window.api.logError('Play failed:', e); else console.error('Play failed:', e); });
            } else {
                videoPreview.pause();
            }
        });
    }

    if (videoPreview) {
        videoPreview.addEventListener('play', () => updatePlayBtn());
        videoPreview.addEventListener('pause', () => updatePlayBtn());
        videoPreview.addEventListener('timeupdate', () => {
            updatePlayhead();
            updateCurrentTime();
        });
        videoPreview.addEventListener('seeked', () => {
            smartSeeker.onSeeked(videoPreview);
            updateCurrentTime();
        });
        videoPreview.addEventListener('ended', () => {
            videoPreview.currentTime = state.trimStartSeconds;
            updatePlayhead();
            updateCurrentTime();
        });
    }

    if (volumeSlider && videoPreview) {
        updateVolumeSliderBackground();
        volumeSlider.addEventListener('input', () => {
            const nextVolume = parseFloat(volumeSlider.value);
            if (nextVolume > 0) lastVolume = nextVolume;
            applyVolume(nextVolume, false);
        });
    }

    if (muteBtn && videoPreview) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMuteFromIcon();
        });
    }

    if (volumeIcon) {
        volumeIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMuteFromIcon();
        });
    }

    if (mutedIcon) {
        mutedIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMuteFromIcon();
        });
    }
}
