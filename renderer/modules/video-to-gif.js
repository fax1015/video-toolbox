// Video to GIF Module

import { get, showView, showPopup, updateTextContent, resetNav, toggleSidebar } from './ui-utils.js';
import * as state from './state.js';
import { addToQueue } from './queue.js';
import { processQueue, updateQueueStatusUI, updateQueueUI } from './queue.js';

import { timeStringToSeconds, secondsToTimeString, formatDisplayTime } from './trimmer.js';

let currentVideoPath = null;
let currentVideoMetadata = null;

let currentCrop = null;
let cropDrag = null;
const MIN_CROP_SIZE_PX = 8;

// GIF image-mode state
let gftMode = 'video'; // 'video' | 'images'
const GIF_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);
const GIF_VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm']);
const GIF_VIDEO_AND_IMAGE_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'];
let gftFrames = []; // [{ path, name, ext, sizeBytes, dateAdded, durationMs }]
let gftGlobalDelayMs = 83; // ~12fps
let gftTimelineDragState = null; // { index, startX, origDurationMs }
let gftFrameDragIndex = null;
let gftFrameIsDragging = false;
let gftFrameDragGhost = null;
let gftFrameCurrentDropIndex = -1;
let gftCarouselScrollBound = false;
let gftTimelineScrollBound = false;
let gftAutoScrollVelocity = 0;
let gftAutoScrollFrame = null;
const GFT_AUTO_SCROLL_EDGE = 48;

function gftStartAutoScroll(preview) {
    if (gftAutoScrollFrame || !preview) return;
    const step = () => {
        if (!gftAutoScrollVelocity) {
            gftAutoScrollFrame = null;
            return;
        }
        preview.scrollLeft += gftAutoScrollVelocity;
        gftAutoScrollFrame = requestAnimationFrame(step);
    };
    gftAutoScrollFrame = requestAnimationFrame(step);
}

function gftStopAutoScroll() {
    gftAutoScrollVelocity = 0;
    if (gftAutoScrollFrame) {
        cancelAnimationFrame(gftAutoScrollFrame);
        gftAutoScrollFrame = null;
    }
}

function gftHandleAutoScroll(event, preview, wrap) {
    if (!preview || !wrap) return;
    const bounds = wrap.getBoundingClientRect();
    const leftZone = bounds.left + GFT_AUTO_SCROLL_EDGE;
    const rightZone = bounds.right - GFT_AUTO_SCROLL_EDGE;

    if (event.clientX <= leftZone) {
        gftAutoScrollVelocity = -16;
        gftStartAutoScroll(preview);
    } else if (event.clientX >= rightZone) {
        gftAutoScrollVelocity = 16;
        gftStartAutoScroll(preview);
    } else {
        gftStopAutoScroll();
    }
}

function setupGftCarouselScroll() {
    if (gftCarouselScrollBound) return;
    const preview = get('gft-image-preview');
    if (!preview) return;
    gftCarouselScrollBound = true;
    preview.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        event.preventDefault();
        preview.scrollLeft += event.deltaY;
    }, { passive: false });
}

function setupGftTimelineScroll() {
    if (gftTimelineScrollBound) return;
    const timeline = get('gft-timeline');
    if (!timeline) return;
    gftTimelineScrollBound = true;
    timeline.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        event.preventDefault();
        timeline.scrollLeft += event.deltaY;
    }, { passive: false });
}
let vtgTrimDragging = null;
let vtgTrimDragStartX = 0;
let vtgTrimDragInitialStart = 0;
let vtgTrimDragInitialEnd = 0;
let vtgIsDraggingPlayhead = false;
let vtgPlayheadDragRaf = null;
let vtgFinalSeekOnMouseUp = null;

function getEffectiveVtgDurationSeconds() {
    const metaDuration = currentVideoMetadata?.duration_seconds;
    if (isFinite(metaDuration) && metaDuration > 0) return metaDuration;
    const videoEl = get('vtg-video-preview');
    const videoDuration = videoEl?.duration;
    if (isFinite(videoDuration) && videoDuration > 0) return videoDuration;
    return 0;
}

export function setupVideoToGifHandlers() {
    setupDropZone();
    setupDashboard();
}

export async function handleFileSelection(filePath) {
    await loadVideoToGifFile(filePath);
}

export function applyVideoToGifOptionsToUI(options) {
    if (!options) return;
    const fpsEl = get('vtg-fps');
    const widthEl = get('vtg-width');
    const speedEl = get('vtg-speed');
    const startEl = get('vtg-start');
    const endEl = get('vtg-end');

    if (fpsEl && options.fps) fpsEl.value = String(options.fps);
    if (widthEl && options.width) widthEl.value = String(options.width);
    if (speedEl && options.speed) speedEl.value = String(options.speed);

    const startSeconds = (options.start_seconds ?? options.startSeconds);
    const endSeconds = (options.end_seconds ?? options.endSeconds);
    if (startEl && startSeconds !== undefined && startSeconds !== null) {
        startEl.value = secondsToTimeString(Number(startSeconds) || 0);
    }
    if (endEl && endSeconds !== undefined && endSeconds !== null) {
        endEl.value = secondsToTimeString(Number(endSeconds) || 0);
    }

    const crop = options.crop;
    if (crop && typeof crop === 'object') {
        const w = Number(crop.w);
        const h = Number(crop.h);
        const x = Number(crop.x);
        const y = Number(crop.y);
        if (Number.isFinite(w) && Number.isFinite(h) && Number.isFinite(x) && Number.isFinite(y) && w > 0 && h > 0) {
            if (currentVideoMetadata?.width && currentVideoMetadata?.height) {
                currentCrop = clampCrop({ x, y, w, h }, currentVideoMetadata.width, currentVideoMetadata.height);
            } else {
                currentCrop = { x, y, w, h };
            }
        }
    } else {
        currentCrop = null;
    }

    clampTimeRangeInputs();
    updateCropInfoUI();
    requestAnimationFrame(() => renderCropRectFromCurrentCrop());
}

function setupDropZone() {
    const dropZone = get('gif-tools-drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files || []).map(f => f.path);
        if (files.length === 0) return;
        const images = files.filter(p => gftIsImage(p));
        const video = files.find(p => gftIsVideo(p));
        if (images.length > 0 && !video) {
            gftHandleImageSelection(images);
        } else if (video) {
            handleFileSelection(video);
        }
    }, false);

    dropZone.addEventListener('click', async () => {
        const paths = await gftSelectVideoOrImageFiles();
        if (paths.length === 0) return;
        const images = paths.filter(p => gftIsImage(p));
        const video = paths.find(p => gftIsVideo(p));
        if (images.length > 0 && !video) {
            gftHandleImageSelection(images);
        } else if (video) {
            handleFileSelection(video);
        }
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}


async function loadVideoToGifFile(filePath) {
    currentVideoPath = filePath;
    currentVideoMetadata = null;
    currentCrop = null;
    cropDrag = null;

    const dropZone = get('gif-tools-drop-zone');
    const dashboard = get('gif-tools-dashboard');
    gftSetMode('video');
    gftClearFrames();
    if (dropZone) dropZone.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');

    const fileName = filePath.split(/[\\/]/).pop();
    const ext = fileName.split('.').pop().toUpperCase();
    updateTextContent(get('vtg-filename'), fileName);
    updateTextContent(get('vtg-file-icon'), ext);

    const cropRectEl = get('vtg-crop-rect');
    if (cropRectEl) cropRectEl.classList.add('hidden');

    const cropOverlay = get('vtg-crop-overlay');
    if (cropOverlay) cropOverlay.classList.add('disabled');

    updateCropInfoUI();

    const vtgStart = get('vtg-start');
    const vtgEnd = get('vtg-end');
    if (vtgStart) vtgStart.value = '00:00:00.00';
    if (vtgEnd) vtgEnd.value = '00:00:00.00';

    const videoEl = get('vtg-video-preview');
    if (videoEl) {
        const videoSrc = window.api.convertFileSrc(filePath);
        videoEl.src = videoSrc;
        videoEl.currentTime = 0;
        videoEl.playsInline = true;
        videoEl.preload = 'auto';
        videoEl.muted = true;
        videoEl.load();
    }

    const vtgVideoCurrentTime = get('vtg-video-current-time');
    if (vtgVideoCurrentTime) vtgVideoCurrentTime.textContent = '00:00';

    try {
        const metadata = await window.api.getMetadata(filePath);
        currentVideoMetadata = metadata;

        if (metadata.size_bytes) {
            const { formatBytes } = await import('./ui-utils.js');
            updateTextContent(get('vtg-filesize'), formatBytes(metadata.size_bytes));
        }
        if (metadata.duration_seconds) {
            const mins = Math.floor(metadata.duration_seconds / 60);
            const secs = Math.floor(metadata.duration_seconds % 60);
            updateTextContent(get('vtg-duration'), `${mins}:${secs.toString().padStart(2, '0')}`);
        }
        if (metadata.resolution) {
            updateTextContent(get('vtg-resolution'), metadata.resolution);
        }

        const durationSec = metadata.duration_seconds || 0;
        if (vtgEnd) vtgEnd.value = secondsToTimeString(durationSec);

        updateVtgTrimTimelineVisual();

        const previewContainer = get('vtg-video-preview-container');
        if (previewContainer && metadata.width && metadata.height) {
            const ratio = `${metadata.width} / ${metadata.height}`;
            previewContainer.style.aspectRatio = ratio;
        }

        requestAnimationFrame(() => renderCropRectFromCurrentCrop());
    } catch (err) {
        if (window.api?.logError) window.api.logError('Failed to parse metadata:', err); else console.error('Failed to parse metadata:', err);
    }
}

function setupDashboard() {
    const backBtn = get('vtg-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            currentVideoPath = null;
            currentVideoMetadata = null;
            currentCrop = null;
            cropDrag = null;
            gftClearFrames();
            get('gif-tools-dashboard').classList.add('hidden');
            get('gif-tools-drop-zone').classList.remove('hidden');
        });
    }

    const addImagesBtn = get('vtg-add-images-btn');
    if (addImagesBtn) {
        addImagesBtn.addEventListener('click', async () => {
            const paths = await gftSelectImageFiles();
            if (paths.length === 0) return;
            gftAppendFrames(paths);
        });
    }

    const cropResetBtn = get('vtg-crop-reset-btn');
    if (cropResetBtn) {
        cropResetBtn.addEventListener('click', () => {
            const cropOverlay = get('vtg-crop-overlay');
            if (currentCrop) {
                // Reset crop
                currentCrop = null;
                cropDrag = null;
                const cropRectEl = get('vtg-crop-rect');
                if (cropRectEl) cropRectEl.classList.add('hidden');
                updateCropInfoUI();
                // Disable crop overlay
                if (cropOverlay) cropOverlay.classList.add('disabled');
            } else {
                // Enable crop mode
                if (cropOverlay) cropOverlay.classList.remove('disabled');
            }
        });
    }

    const cropOverlay = get('vtg-crop-overlay');
    if (cropOverlay) {
        setupCropOverlayHandlers(cropOverlay);
    }

    const videoEl = get('vtg-video-preview');
    if (videoEl) {
        setupVtgVideoPreviewHandlers(videoEl);
    }

    setupVtgTrimTimelineHandlers();

    const startInput = get('vtg-start');
    const endInput = get('vtg-end');
    if (startInput) {
        startInput.addEventListener('change', () => {
            clampTimeRangeInputs();
            updateVtgTrimTimelineVisual();
        });
    }
    if (endInput) {
        endInput.addEventListener('change', () => {
            clampTimeRangeInputs();
            updateVtgTrimTimelineVisual();
        });
    }

    const addQueueBtn = get('vtg-add-queue-btn');
    if (addQueueBtn) {
        addQueueBtn.addEventListener('click', () => {
            if (gftMode === 'video' && !currentVideoPath) return;
            fireConversion(false);
        });
    }

    const convertBtn = get('vtg-convert-btn');
    if (convertBtn) {
        convertBtn.addEventListener('click', () => {
            if (gftMode === 'video' && !currentVideoPath) return;
            if (gftMode === 'images' && gftFrames.length === 0) return;
            fireConversion(true);
        });
    }

    setupGftGlobalTimingHandlers();
    setupGftSortHandlers();
    setupGftFrameCarouselDrag();
    setupGftCarouselScroll();
    setupGftTimelineScroll();
}

function fireConversion(startImmediately) {
    if (gftMode === 'images') {
        gftFireImageConversion();
        return;
    }

    const options = buildVideoToGifOptions();

    if (startImmediately) {
        state.setVideoToGifing(true);
        state.setEncodingState(true);

        const progressTitle = get('progress-title');
        const progressFilename = get('progress-filename');
        const progressView = get('progress-view');

        if (progressTitle) progressTitle.textContent = 'Converting to GIF...';
        if (progressFilename) progressFilename.textContent = currentVideoPath.split(/[\\/]/).pop();

        showView(progressView);
        toggleSidebar(true);
        state.setLastActiveViewId('gifToolsDropZone');

        // Clear values but do NOT show drop zone
        currentVideoPath = null;
        currentVideoMetadata = null;

        window.api.videoToGif(options).catch(e => {
            if (window.api?.logError) window.api.logError('Video to GIF error:', e); else console.error('Video to GIF error:', e);
            state.setEncodingState(false);
            state.setVideoToGifing(false);
            const progressView = get('progress-view');
            if (progressView) progressView.classList.add('hidden');
            showPopup(`Error starting GIF conversion: ${e}`);
        });
    } else {
        if (state.currentEditingQueueId !== null) {
            const item = state.encodingQueue.find(i => i.id === state.currentEditingQueueId);
            if (item && item.taskType === 'gif-tools') {
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
                updateQueueStatusUI();
            }
        } else {
            addToQueue(options, 'gif-tools');
            showPopup('Added to Queue', 3000);
        }

        const queueView = get('queue-view');
        const navQueue = get('nav-queue');
        showView(queueView);
        resetNav();
        if (navQueue) navQueue.classList.add('active');

        // Clear values and return to drop zone only for queue
        currentVideoPath = null;
        currentVideoMetadata = null;
        currentCrop = null;
        cropDrag = null;
        get('gif-tools-dashboard').classList.add('hidden');
        get('gif-tools-drop-zone').classList.remove('hidden');
    }
}

function buildVideoToGifOptions() {
    const fpsEl = get('vtg-fps');
    const widthEl = get('vtg-width');
    const speedEl = get('vtg-speed');
    const startEl = get('vtg-start');
    const endEl = get('vtg-end');

    const fps = fpsEl ? parseInt(fpsEl.value) : 15;
    const width = widthEl ? parseInt(widthEl.value) : 480;
    const speed = speedEl ? parseFloat(speedEl.value) : 1;

    let startSeconds = startEl ? timeStringToSeconds(startEl.value) : 0;
    let endSeconds = endEl ? timeStringToSeconds(endEl.value) : 0;
    const duration = getEffectiveVtgDurationSeconds();
    if (duration > 0) {
        if (!isFinite(endSeconds) || endSeconds <= 0) endSeconds = duration;
        startSeconds = Math.max(0, Math.min(duration, startSeconds));
        endSeconds = Math.max(startSeconds, Math.min(duration, endSeconds));
    }

    const options = {
        input: currentVideoPath,
        fps,
        width,
        speed,
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        crop: currentCrop ? { ...currentCrop } : null,
        output_folder: get('output-folder')?.value || '',
        work_priority: state.appSettings.workPriority || 'normal'
    };

    if (!options.crop) delete options.crop;
    if (!isFinite(options.speed) || options.speed === 1) delete options.speed;
    if (!isFinite(options.start_seconds) || options.start_seconds <= 0) delete options.start_seconds;
    if (!isFinite(options.end_seconds) || duration > 0 && Math.abs(options.end_seconds - duration) < 0.001) delete options.end_seconds;

    return options;
}

function clampTimeRangeInputs() {
    const startEl = get('vtg-start');
    const endEl = get('vtg-end');
    if (!startEl || !endEl) return;
    const duration = getEffectiveVtgDurationSeconds();
    let startSeconds = timeStringToSeconds(startEl.value);
    let endSeconds = timeStringToSeconds(endEl.value);
    if (duration > 0) {
        startSeconds = Math.max(0, Math.min(duration, startSeconds));
        if (!isFinite(endSeconds) || endSeconds <= 0) endSeconds = duration;
        endSeconds = Math.max(startSeconds, Math.min(duration, endSeconds));
    } else {
        startSeconds = Math.max(0, startSeconds);
        endSeconds = Math.max(startSeconds, endSeconds);
    }
    startEl.value = secondsToTimeString(startSeconds);
    endEl.value = secondsToTimeString(endSeconds);
}

function getVtgTrimRangeSeconds() {
    const startEl = get('vtg-start');
    const endEl = get('vtg-end');
    const duration = getEffectiveVtgDurationSeconds();
    let startSeconds = startEl ? timeStringToSeconds(startEl.value) : 0;
    let endSeconds = endEl ? timeStringToSeconds(endEl.value) : 0;

    if (duration > 0) {
        startSeconds = Math.max(0, Math.min(duration, startSeconds));
        if (!isFinite(endSeconds) || endSeconds <= 0) endSeconds = duration;
        endSeconds = Math.max(startSeconds, Math.min(duration, endSeconds));
    } else {
        startSeconds = Math.max(0, startSeconds);
        endSeconds = Math.max(startSeconds, endSeconds);
    }

    return { duration, startSeconds, endSeconds };
}

function updateVtgTrimTimelineVisual() {
    const inactiveStart = get('vtg-trim-inactive-start');
    const inactiveEnd = get('vtg-trim-inactive-end');
    const activeSegment = get('vtg-trim-active-segment');
    const handleLeft = get('vtg-trim-handle-left');
    const handleRight = get('vtg-trim-handle-right');
    const playhead = get('vtg-trim-playhead');
    const videoEl = get('vtg-video-preview');

    const { duration, startSeconds, endSeconds } = getVtgTrimRangeSeconds();
    if (!duration || !inactiveStart || !inactiveEnd || !activeSegment || !handleLeft || !handleRight) return;

    const startPct = (startSeconds / duration) * 100;
    const endPct = (endSeconds / duration) * 100;
    const activePct = Math.max(0, endPct - startPct);

    inactiveStart.style.left = '0';
    inactiveStart.style.width = startPct + '%';

    activeSegment.style.left = startPct + '%';
    activeSegment.style.width = activePct + '%';

    inactiveEnd.style.left = endPct + '%';
    inactiveEnd.style.width = (100 - endPct) + '%';

    // Snap handles: right side of left handle to left of active, left side of right handle to right of active
    handleLeft.style.left = `calc(${startPct}% - 14px)`;
    handleRight.style.left = endPct + '%';

    // Ensure right handle never disappears: add minimal class if active segment is too small
    if (activeSegment) {
        activeSegment.classList.toggle('minimal', activePct < 2);
    }

    if (videoEl && playhead && isFinite(videoEl.currentTime)) {
        const pct = (videoEl.currentTime / duration) * 100;
        playhead.style.left = pct + '%';
    }
}

function syncVtgInputsFromSeconds(startSeconds, endSeconds) {
    const startEl = get('vtg-start');
    const endEl = get('vtg-end');
    if (startEl) startEl.value = secondsToTimeString(startSeconds);
    if (endEl) endEl.value = secondsToTimeString(endSeconds);
    updateVtgTrimTimelineVisual();
}

function setupVtgTrimTimelineHandlers() {
    const handleLeft = get('vtg-trim-handle-left');
    const handleRight = get('vtg-trim-handle-right');
    const activeSegment = get('vtg-trim-active-segment');
    const timeline = get('vtg-trim-timeline');
    const trackInner = get('vtg-trim-track-inner');
    const playhead = get('vtg-trim-playhead');
    const videoEl = get('vtg-video-preview');
    const timeEl = get('vtg-video-current-time');

    if (!timeline || !trackInner || !videoEl) return;

    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
    const downEvent = supportsPointer ? 'pointerdown' : 'mousedown';
    const moveEvent = supportsPointer ? 'pointermove' : 'mousemove';
    const upEvent = supportsPointer ? 'pointerup' : 'mouseup';

    function setCapture(el, e) {
        if (e?.pointerId !== undefined && el?.setPointerCapture) {
            try { el.setPointerCapture(e.pointerId); } catch { }
        }
    }

    function trackXToSeconds(clientX) {
        const { duration } = getVtgTrimRangeSeconds();
        if (!duration) return 0;
        const rect = trackInner.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return x * duration;
    }

    function timelineXToSeconds(clientX) {
        const { duration } = getVtgTrimRangeSeconds();
        if (!duration) return 0;
        const rect = trackInner.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return x * duration;
    }

    function setTimeLabel(sec) {
        if (!timeEl) return;
        timeEl.textContent = formatDisplayTime(sec);
    }

    function onTrimDragMove(e) {
        if (!vtgTrimDragging) return;
        const { duration, startSeconds, endSeconds } = getVtgTrimRangeSeconds();
        if (!duration) return;

        const sec = trackXToSeconds(e.clientX);
        let nextStart = startSeconds;
        let nextEnd = endSeconds;

        if (vtgTrimDragging === 'start') {
            nextStart = Math.max(0, Math.min(endSeconds - 0.01, sec));
        } else if (vtgTrimDragging === 'end') {
            nextEnd = Math.min(duration, Math.max(startSeconds + 0.01, sec));
        } else if (vtgTrimDragging === 'range') {
            const delta = (e.clientX - vtgTrimDragStartX) / trackInner.getBoundingClientRect().width * duration;
            nextStart = vtgTrimDragInitialStart + delta;
            nextEnd = vtgTrimDragInitialEnd + delta;
            if (nextStart < 0) {
                nextEnd -= nextStart;
                nextStart = 0;
            }
            if (nextEnd > duration) {
                nextStart -= (nextEnd - duration);
                nextEnd = duration;
            }
            nextStart = Math.max(0, nextStart);
            nextEnd = Math.min(duration, Math.max(nextStart + 0.01, nextEnd));
        }

        syncVtgInputsFromSeconds(nextStart, nextEnd);

        if (vtgTrimDragging === 'start') {
            videoEl.currentTime = nextStart;
            setTimeLabel(nextStart);
        } else if (vtgTrimDragging === 'end') {
            videoEl.currentTime = nextEnd;
            setTimeLabel(nextEnd);
        }
    }

    function onTrimDragEnd() {
        vtgTrimDragging = null;
        document.removeEventListener(moveEvent, onTrimDragMove);
        document.removeEventListener(upEvent, onTrimDragEnd);
    }

    function onPlayheadDragMove(e) {
        if (!vtgIsDraggingPlayhead) return;
        vtgFinalSeekOnMouseUp = e.clientX;
        if (vtgPlayheadDragRaf !== null) cancelAnimationFrame(vtgPlayheadDragRaf);
        vtgPlayheadDragRaf = requestAnimationFrame(() => {
            if (!vtgIsDraggingPlayhead) { vtgPlayheadDragRaf = null; return; }
            const time = timelineXToSeconds(e.clientX);
            if (isFinite(time)) {
                videoEl.currentTime = time;
                setTimeLabel(time);
                updateVtgTrimTimelineVisual();
            }
            vtgPlayheadDragRaf = null;
        });
    }

    function onPlayheadDragEnd() {
        if (vtgFinalSeekOnMouseUp !== null) {
            const time = timelineXToSeconds(vtgFinalSeekOnMouseUp);
            if (isFinite(time)) {
                videoEl.currentTime = time;
                setTimeLabel(time);
            }
        }
        vtgIsDraggingPlayhead = false;
        vtgFinalSeekOnMouseUp = null;
        if (vtgPlayheadDragRaf !== null) { cancelAnimationFrame(vtgPlayheadDragRaf); vtgPlayheadDragRaf = null; }
        document.removeEventListener(moveEvent, onPlayheadDragMove);
        document.removeEventListener(upEvent, onPlayheadDragEnd);
    }

    if (handleLeft) {
        handleLeft.addEventListener(downEvent, (e) => {
            e.preventDefault();
            e.stopPropagation();
            setCapture(handleLeft, e);
            vtgTrimDragging = 'start';
            videoEl.pause();
            document.addEventListener(moveEvent, onTrimDragMove);
            document.addEventListener(upEvent, onTrimDragEnd);
        });
    }

    if (handleRight) {
        handleRight.addEventListener(downEvent, (e) => {
            e.preventDefault();
            e.stopPropagation();
            setCapture(handleRight, e);
            vtgTrimDragging = 'end';
            videoEl.pause();
            document.addEventListener(moveEvent, onTrimDragMove);
            document.addEventListener(upEvent, onTrimDragEnd);
        });
    }

    if (activeSegment) {
        activeSegment.addEventListener(downEvent, (e) => {
            e.preventDefault();
            e.stopPropagation();
            setCapture(activeSegment, e);
            const { startSeconds, endSeconds } = getVtgTrimRangeSeconds();
            vtgTrimDragging = 'range';
            vtgTrimDragStartX = e.clientX;
            vtgTrimDragInitialStart = startSeconds;
            vtgTrimDragInitialEnd = endSeconds;
            videoEl.pause();
            document.addEventListener(moveEvent, onTrimDragMove);
            document.addEventListener(upEvent, onTrimDragEnd);
        });
    }

    if (timeline && playhead) {
        timeline.addEventListener(downEvent, (e) => {
            if (e.target.closest('.trim-handle') || e.target.closest('#vtg-trim-active-segment')) return;
            e.preventDefault();
            e.stopPropagation();
            setCapture(timeline, e);
            vtgIsDraggingPlayhead = true;
            videoEl.pause();
            const time = timelineXToSeconds(e.clientX);
            if (isFinite(time)) {
                videoEl.currentTime = time;
                setTimeLabel(time);
                vtgFinalSeekOnMouseUp = e.clientX;
                updateVtgTrimTimelineVisual();
            }
            document.addEventListener(moveEvent, onPlayheadDragMove);
            document.addEventListener(upEvent, onPlayheadDragEnd);
        });
    }
}

function setupVtgVideoPreviewHandlers(videoEl) {
    const container = get('vtg-video-preview-container');
    const playBtn = get('vtg-play-btn');
    const playBtnIcon = get('vtg-play-btn-icon');
    const pauseBtnIcon = get('vtg-pause-btn-icon');
    const overlay = get('vtg-video-overlay');
    const playIconShape = get('vtg-play-icon-shape');
    const pauseIconShape = get('vtg-pause-icon-shape');

    const timeEl = get('vtg-video-current-time');
    const muteBtn = get('vtg-mute-btn');
    const volumeSlider = get('vtg-volume-slider');
    const volumeIcon = get('vtg-volume-icon');
    const mutedIcon = get('vtg-muted-icon');

    let playPauseAnimTimeout = null;
    let lastVolume = 1;
    let playbackRaf = null;

    function startPlaybackLoop() {
        if (playbackRaf) return;
        const loop = () => {
            const t = isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
            if (timeEl) timeEl.textContent = formatDisplayTime(t);

            const { startSeconds, endSeconds, duration } = getVtgTrimRangeSeconds();
            if (duration > 0 && isFinite(endSeconds) && t > endSeconds) {
                videoEl.currentTime = startSeconds;
            }

            updateVtgTrimTimelineVisual();
            playbackRaf = requestAnimationFrame(loop);
        };
        playbackRaf = requestAnimationFrame(loop);
    }

    function stopPlaybackLoop() {
        if (playbackRaf) {
            cancelAnimationFrame(playbackRaf);
            playbackRaf = null;
        }
        updateVtgTrimTimelineVisual();
        const t = isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
        if (timeEl) timeEl.textContent = formatDisplayTime(t);
    }

    function showPlayPauseAnimation(isPlaying) {
        if (!overlay || !playIconShape || !pauseIconShape) return;
        playIconShape.classList.toggle('hidden', isPlaying);
        pauseIconShape.classList.toggle('hidden', !isPlaying);
        overlay.classList.remove('show-icon');
        void overlay.offsetWidth;
        overlay.classList.add('show-icon');
        if (playPauseAnimTimeout) clearTimeout(playPauseAnimTimeout);
        playPauseAnimTimeout = setTimeout(() => {
            overlay.classList.remove('show-icon');
        }, 600);
    }

    function updatePlayBtn() {
        if (!playBtnIcon || !pauseBtnIcon) return;
        const isPaused = videoEl.paused;
        playBtnIcon.classList.toggle('hidden', !isPaused);
        pauseBtnIcon.classList.toggle('hidden', isPaused);
    }

    function updateMuteIcon() {
        if (!volumeIcon || !mutedIcon) return;
        const isMuted = videoEl.muted || videoEl.volume === 0;
        volumeIcon.classList.toggle('hidden', isMuted);
        mutedIcon.classList.toggle('hidden', !isMuted);
    }

    function applyVolume(value, shouldMute) {
        const normalized = Math.max(0, Math.min(1, value));
        videoEl.volume = normalized;
        videoEl.muted = !!shouldMute || normalized === 0;
        if (volumeSlider) volumeSlider.value = normalized.toString();
        updateMuteIcon();
    }

    function toggleMuteFromIcon() {
        const isMuted = videoEl.muted || videoEl.volume === 0;
        if (isMuted) {
            applyVolume(lastVolume > 0 ? lastVolume : 1, false);
        } else {
            lastVolume = videoEl.volume > 0 ? videoEl.volume : lastVolume;
            applyVolume(0, true);
        }
    }

    const togglePlay = (e) => {
        if (e) {
            if (e.target.closest('.video-controls') || e.target.closest('.vtg-timeline-row') || e.target.closest('.vtg-crop-overlay')) return;
            e.stopPropagation();
        }
        if (videoEl.paused) {
            videoEl.play().catch(() => { });
            showPlayPauseAnimation(true);
        } else {
            videoEl.pause();
            showPlayPauseAnimation(false);
        }
    };

    if (container) container.addEventListener('click', togglePlay);
    if (overlay) overlay.addEventListener('click', togglePlay);
    if (playBtn) {
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlay();
        });
    }

    videoEl.addEventListener('play', () => {
        updatePlayBtn();
        startPlaybackLoop();
    });
    videoEl.addEventListener('pause', () => {
        updatePlayBtn();
        stopPlaybackLoop();
    });
    videoEl.addEventListener('loadedmetadata', () => {
        if (!currentVideoMetadata) currentVideoMetadata = {};

        if (!isFinite(currentVideoMetadata.duration_seconds) || currentVideoMetadata.duration_seconds <= 0) {
            const d = videoEl.duration;
            if (isFinite(d) && d > 0) currentVideoMetadata.duration_seconds = d;
        }
        if (!currentVideoMetadata.width || !currentVideoMetadata.height) {
            if (videoEl.videoWidth && videoEl.videoHeight) {
                currentVideoMetadata.width = videoEl.videoWidth;
                currentVideoMetadata.height = videoEl.videoHeight;
            }
        }

        const previewContainer = get('vtg-video-preview-container');
        if (previewContainer && currentVideoMetadata.width && currentVideoMetadata.height) {
            previewContainer.style.aspectRatio = `${currentVideoMetadata.width} / ${currentVideoMetadata.height}`;
        }

        const endEl = get('vtg-end');
        const duration = getEffectiveVtgDurationSeconds();
        if (endEl && duration > 0) {
            const currentEnd = timeStringToSeconds(endEl.value);
            if (!isFinite(currentEnd) || currentEnd <= 0) {
                endEl.value = secondsToTimeString(duration);
            }
        }

        clampTimeRangeInputs();
        updateVtgTrimTimelineVisual();
        renderCropRectFromCurrentCrop();
        updateCropInfoUI();
    });
    videoEl.addEventListener('timeupdate', () => {
        if (videoEl.paused) {
            const t = isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
            if (timeEl) timeEl.textContent = formatDisplayTime(t);

            const { startSeconds, endSeconds, duration } = getVtgTrimRangeSeconds();
            if (duration > 0 && isFinite(endSeconds) && t > endSeconds) {
                videoEl.currentTime = startSeconds;
            }

            updateVtgTrimTimelineVisual();
        }
    });

    videoEl.addEventListener('ended', () => {
        stopPlaybackLoop();
        const { startSeconds } = getVtgTrimRangeSeconds();
        videoEl.currentTime = startSeconds;
        updateVtgTrimTimelineVisual();
        updatePlayBtn();
    });

    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            const nextVolume = parseFloat(volumeSlider.value);
            if (nextVolume > 0) lastVolume = nextVolume;
            applyVolume(nextVolume, false);
        });
    }

    if (muteBtn) {
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

    updatePlayBtn();
    updateMuteIcon();
}

function setupCropOverlayHandlers(overlayEl) {
    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
    const downEvent = supportsPointer ? 'pointerdown' : 'mousedown';
    const moveEvent = supportsPointer ? 'pointermove' : 'mousemove';
    const upEvent = supportsPointer ? 'pointerup' : 'mouseup';

    function getOverlayCoords(clientX, clientY) {
        const rect = overlayEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
        return { x, y, width: rect.width, height: rect.height };
    }

    function onDown(e) {
        if (!currentVideoMetadata?.width || !currentVideoMetadata?.height) return;
        e.preventDefault();
        e.stopPropagation();
        const { x, y, width, height } = getOverlayCoords(e.clientX, e.clientY);
        cropDrag = {
            startX: x,
            startY: y,
            curX: x,
            curY: y,
            overlayW: width,
            overlayH: height
        };

        if (e.pointerId !== undefined && overlayEl.setPointerCapture) {
            try { overlayEl.setPointerCapture(e.pointerId); } catch { }
        }
        document.addEventListener(moveEvent, onMove);
        document.addEventListener(upEvent, onUp);
    }

    function onMove(e) {
        if (!cropDrag) return;
        e.preventDefault();
        const { x, y } = getOverlayCoords(e.clientX, e.clientY);
        cropDrag.curX = x;
        cropDrag.curY = y;
        updateCropFromDrag();
    }

    function onUp(e) {
        if (!cropDrag) return;
        if (e?.preventDefault) e.preventDefault();
        updateCropFromDrag(true);
        cropDrag = null;
        document.removeEventListener(moveEvent, onMove);
        document.removeEventListener(upEvent, onUp);
    }

    function updateCropFromDrag(finalize = false) {
        if (!cropDrag || !currentVideoMetadata?.width || !currentVideoMetadata?.height) return;
        const x1 = Math.min(cropDrag.startX, cropDrag.curX);
        const y1 = Math.min(cropDrag.startY, cropDrag.curY);
        const x2 = Math.max(cropDrag.startX, cropDrag.curX);
        const y2 = Math.max(cropDrag.startY, cropDrag.curY);
        const w = x2 - x1;
        const h = y2 - y1;

        const cropRectEl = get('vtg-crop-rect');
        if (cropRectEl) {
            if (w < MIN_CROP_SIZE_PX || h < MIN_CROP_SIZE_PX) {
                cropRectEl.classList.add('hidden');
            } else {
                cropRectEl.classList.remove('hidden');
                cropRectEl.style.left = `${x1}px`;
                cropRectEl.style.top = `${y1}px`;
                cropRectEl.style.width = `${w}px`;
                cropRectEl.style.height = `${h}px`;
            }
        }

        if (w < MIN_CROP_SIZE_PX || h < MIN_CROP_SIZE_PX) {
            if (finalize) {
                currentCrop = null;
                updateCropInfoUI();
            }
            return;
        }

        const scaleX = currentVideoMetadata.width / cropDrag.overlayW;
        const scaleY = currentVideoMetadata.height / cropDrag.overlayH;
        const cropX = Math.round(x1 * scaleX);
        const cropY = Math.round(y1 * scaleY);
        const cropW = Math.round(w * scaleX);
        const cropH = Math.round(h * scaleY);

        currentCrop = clampCrop({ x: cropX, y: cropY, w: cropW, h: cropH }, currentVideoMetadata.width, currentVideoMetadata.height);
        updateCropInfoUI();
    }

    overlayEl.addEventListener(downEvent, onDown);
}

function clampCrop(crop, videoW, videoH) {
    const x = Math.max(0, Math.min(videoW - 1, crop.x));
    const y = Math.max(0, Math.min(videoH - 1, crop.y));
    const w = Math.max(1, Math.min(videoW - x, crop.w));
    const h = Math.max(1, Math.min(videoH - y, crop.h));
    return { x, y, w, h };
}

function updateCropInfoUI() {
    const cropInfo = get('vtg-crop-info');
    if (!cropInfo) return;
    if (!currentVideoMetadata?.width || !currentVideoMetadata?.height) {
        cropInfo.textContent = 'Crop unavailable';
        updateVtgCropButtonIcon();
        return;
    }
    if (!currentCrop) {
        cropInfo.textContent = 'Full Frame';
        updateVtgCropButtonIcon();
        return;
    }
    cropInfo.textContent = `${currentCrop.w}x${currentCrop.h} @ ${currentCrop.x},${currentCrop.y}`;
    updateVtgCropButtonIcon();
}

function updateVtgCropButtonIcon() {
    const cropIcon = get('vtg-crop-btn-icon-crop');
    const resetIcon = get('vtg-crop-btn-icon-reset');
    const btn = get('vtg-crop-reset-btn');
    if (!cropIcon || !resetIcon || !btn) return;

    const hasCrop = !!currentCrop;
    cropIcon.classList.toggle('hidden', hasCrop);
    resetIcon.classList.toggle('hidden', !hasCrop);
    btn.title = hasCrop ? 'Reset Crop' : 'Crop';
}

function renderCropRectFromCurrentCrop() {
    const cropRectEl = get('vtg-crop-rect');
    const overlayEl = get('vtg-crop-overlay');
    if (!cropRectEl || !overlayEl) return;
    if (!currentCrop || !currentVideoMetadata?.width || !currentVideoMetadata?.height) {
        cropRectEl.classList.add('hidden');
        return;
    }

    const rect = overlayEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const scaleX = rect.width / currentVideoMetadata.width;
    const scaleY = rect.height / currentVideoMetadata.height;
    const left = currentCrop.x * scaleX;
    const top = currentCrop.y * scaleY;
    const width = currentCrop.w * scaleX;
    const height = currentCrop.h * scaleY;

    if (width < MIN_CROP_SIZE_PX || height < MIN_CROP_SIZE_PX) {
        cropRectEl.classList.add('hidden');
        return;
    }

    cropRectEl.classList.remove('hidden');
    cropRectEl.style.left = `${left}px`;
    cropRectEl.style.top = `${top}px`;
    cropRectEl.style.width = `${width}px`;
    cropRectEl.style.height = `${height}px`;
}

// ─── GIF Image-Mode Helpers ───────────────────────────────────────────────────

function gftIsImage(path) {
    if (!path) return false;
    const idx = path.toLowerCase().lastIndexOf('.');
    return idx !== -1 && GIF_IMAGE_EXTENSIONS.has(path.toLowerCase().slice(idx));
}

function gftIsVideo(path) {
    if (!path) return false;
    const idx = path.toLowerCase().lastIndexOf('.');
    return idx !== -1 && GIF_VIDEO_EXTENSIONS.has(path.toLowerCase().slice(idx));
}

async function gftSelectVideoOrImageFiles() {
    if (typeof window.api?.selectFiles === 'function') {
        try {
            const paths = await window.api.selectFiles({
                filters: [{ name: 'Video or Images', extensions: GIF_VIDEO_AND_IMAGE_EXTENSIONS }]
            });
            if (Array.isArray(paths) && paths.length > 0) return paths;
            if (Array.isArray(paths)) return [];
        } catch (err) {
            if (window.api?.logError) window.api.logError('selectFiles failed for GIF tools', err); else console.error('selectFiles failed for GIF tools', err);
            return await gftSelectSingleVideoOrImageFile();
        }
        return [];
    }
    return await gftSelectSingleVideoOrImageFile();
}

async function gftSelectImageFiles() {
    const imageExtensions = Array.from(GIF_IMAGE_EXTENSIONS).map(ext => ext.replace('.', ''));
    if (typeof window.api?.selectFiles === 'function') {
        try {
            const paths = await window.api.selectFiles({
                filters: [{ name: 'Images', extensions: imageExtensions }]
            });
            if (Array.isArray(paths) && paths.length > 0) return paths.filter(p => gftIsImage(p));
            if (Array.isArray(paths)) return [];
        } catch (err) {
            if (window.api?.logError) window.api.logError('selectFiles failed for GIF image picker', err); else console.error('selectFiles failed for GIF image picker', err);
            return await gftSelectSingleImageFile(imageExtensions);
        }
        return [];
    }
    return await gftSelectSingleImageFile(imageExtensions);
}

async function gftSelectSingleVideoOrImageFile() {
    try {
        const single = await window.api.selectFile({
            filters: [{ name: 'Video or Images', extensions: GIF_VIDEO_AND_IMAGE_EXTENSIONS }]
        });
        if (single) return [single];
    } catch (err) {
        if (window.api?.logError) window.api.logError('selectFile fallback failed for GIF tools', err); else console.error('selectFile fallback failed for GIF tools', err);
    }
    return [];
}

async function gftSelectSingleImageFile(imageExtensions) {
    try {
        const single = await window.api.selectFile({
            filters: [{ name: 'Images', extensions: imageExtensions }]
        });
        if (single && gftIsImage(single)) return [single];
    } catch (err) {
        if (window.api?.logError) window.api.logError('selectFile fallback failed for GIF image picker', err); else console.error('selectFile fallback failed for GIF image picker', err);
    }
    return [];
}

function gftSetMode(mode) {
    gftMode = mode;
    const videoPreviewPanel = get('gft-video-preview-panel');
    const videoTimePanel = get('gft-video-time-panel');
    const videoSpeedGroup = get('gft-video-speed-group');
    const imageEditorPanel = get('gft-image-editor-panel');
    const addQueueBtn = get('vtg-add-queue-btn');
    const addImagesBtn = get('vtg-add-images-btn');
    const modeLabel = get('gft-mode-label');

    const isVideo = mode === 'video';
    if (videoPreviewPanel) videoPreviewPanel.classList.toggle('hidden', !isVideo);
    if (videoTimePanel) videoTimePanel.classList.toggle('hidden', !isVideo);
    if (videoSpeedGroup) videoSpeedGroup.classList.toggle('hidden', !isVideo);
    if (imageEditorPanel) imageEditorPanel.classList.toggle('hidden', isVideo);
    if (addQueueBtn) addQueueBtn.classList.toggle('hidden', !isVideo);
    if (addImagesBtn) addImagesBtn.classList.toggle('hidden', isVideo);
    if (modeLabel) modeLabel.textContent = isVideo ? 'Video to GIF mode' : 'Image sequence to GIF mode';
}

function gftHandleImageSelection(paths) {
    if (!paths || paths.length === 0) return;
    const dropZone = get('gif-tools-drop-zone');
    const dashboard = get('gif-tools-dashboard');
    gftSetMode('images');
    if (dropZone) dropZone.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    gftAppendFrames(paths);
}

function gftAppendFrames(paths) {
    const existing = new Set(gftFrames.map(f => f.path));
    paths.forEach(path => {
        if (existing.has(path)) return;
        const name = path.split(/[\\/]/).pop();
        const extMatch = name.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : '';
        gftFrames.push({ path, name, ext, dateAdded: Date.now(), durationMs: gftGlobalDelayMs });
        existing.add(path);
    });
    gftRenderCarousel();
    gftRenderTimeline();
    gftUpdateImageCount();
}

function gftClearFrames(skipAnimation = true) {
    gftFrames = [];
    gftRenderCarousel(skipAnimation);
    gftRenderTimeline();
    gftUpdateImageCount();
}

function gftUpdateImageCount() {
    const countEl = get('gft-image-count');
    if (countEl) countEl.textContent = String(gftFrames.length);
    const emptyEl = get('gft-preview-empty');
    const hintEl = get('gft-reorder-hint');
    if (emptyEl) emptyEl.classList.toggle('hidden', gftFrames.length > 0);
    if (hintEl) hintEl.classList.toggle('hidden', gftFrames.length < 2);
}

function gftRenderCarousel(skipAnimation = false) {
    const preview = get('gft-image-preview');
    if (!preview) return;

    const currentScroll = preview.scrollLeft;
    const fragment = document.createDocumentFragment();
    const itemMap = new Map();
    preview.querySelectorAll('.image-preview-item').forEach(el => {
        if (el.dataset.path) itemMap.set(el.dataset.path, el);
        el.classList.remove('removing', 'dragging');
        el.style.animation = 'none';
        el.style.opacity = '1';
        el.style.transform = 'none';
    });

    const createDropIndicator = (index) => {
        const indicator = document.createElement('div');
        indicator.className = 'image-drop-indicator';
        indicator.dataset.index = String(index);
        indicator.classList.remove('removing', 'drag-over');
        return indicator;
    };

    fragment.appendChild(createDropIndicator(0));

    gftFrames.forEach((frame, index) => {
        let item = itemMap.get(frame.path);
        const isNew = !item;

        if (isNew) {
            item = document.createElement('div');
            item.className = 'image-preview-item';
            item.dataset.path = frame.path;
            item.title = frame.name;

            const img = document.createElement('img');
            img.className = 'image-preview-thumb';
            img.src = window.api.convertFileSrc(frame.path);
            img.alt = frame.name;
            img.draggable = false;
            img.loading = 'lazy';
            img.decoding = 'async';

            const fallback = document.createElement('div');
            fallback.className = 'image-preview-fallback';
            fallback.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>${frame.name}</span>
            `;
            fallback.style.display = 'none';

            img.onerror = () => {
                if (window.api?.logError) window.api.logError('[GIFTools] Failed to load frame image:', frame.path); else console.error('[GIFTools] Failed to load frame image:', frame.path);
                img.style.display = 'none';
                fallback.style.display = 'flex';
            };

            const caption = document.createElement('div');
            caption.className = 'image-preview-caption';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'image-preview-remove';
            removeBtn.title = 'Remove frame';
            removeBtn.innerHTML = '&times;';

            item.appendChild(img);
            item.appendChild(fallback);
            item.appendChild(removeBtn);
            item.appendChild(caption);
        }

        const removeBtn = item.querySelector('.image-preview-remove');
        if (removeBtn) {
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                gftRemoveFrame(index);
            };
        }

        item.onmousedown = (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.image-preview-remove')) return;
            gftFrameDragIndex = index;
            const rect = item.getBoundingClientRect();
            const ghost = item.cloneNode(true);
            ghost.classList.add('drag-ghost');
            ghost.style.position = 'fixed';
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            ghost.style.left = `${e.clientX - rect.width / 2}px`;
            ghost.style.top = `${e.clientY - rect.height / 2}px`;
            ghost.style.pointerEvents = 'none';
            ghost.style.opacity = '0.75';
            ghost.style.zIndex = '9999';
            document.body.appendChild(ghost);
            gftFrameDragGhost = ghost;
            item.classList.add('dragging');
            preview.classList.add('is-dragging');
        };

        item.onclick = () => {
            if (gftFrameIsDragging) return;
            const currentIndex = Number.parseInt(item.dataset.index, 10);
            const frameInfo = gftFrames[currentIndex];
            if (frameInfo && window.api?.openImageViewer) {
                window.api.openImageViewer({ path: frameInfo.path, name: frameInfo.name });
            }
        };

        item.dataset.index = String(index);
        const captionEl = item.querySelector('.image-preview-caption');
        if (captionEl) captionEl.textContent = String(index + 1);

        if (isNew && !skipAnimation) {
            item.style.animationDelay = `${index * 40}ms`;
        } else {
            item.style.animation = 'none';
            item.style.opacity = '1';
            item.style.transform = 'none';
        }

        fragment.appendChild(item);
        fragment.appendChild(createDropIndicator(index + 1));
    });

    preview.replaceChildren(fragment);
    gftUpdateImageCount();

    requestAnimationFrame(() => {
        preview.scrollLeft = currentScroll;
    });
}

function gftRemoveFrame(index) {
    const preview = get('gft-image-preview');
    if (preview) {
        const itemEl = preview.children[index * 2 + 1];
        const nextIndicator = preview.children[index * 2 + 2];

        if (itemEl) {
            itemEl.classList.add('removing');
            if (nextIndicator) nextIndicator.classList.add('removing');

            setTimeout(() => {
                gftFrames = gftFrames.filter((_, idx) => idx !== index);
                gftRenderCarousel(true);
                gftRenderTimeline();
                gftUpdateImageCount();
            }, 350);
            return;
        }
    }

    gftFrames = gftFrames.filter((_, idx) => idx !== index);
    gftRenderCarousel(true);
    gftRenderTimeline();
    gftUpdateImageCount();
}

function setupGftFrameCarouselDrag() {
    document.addEventListener('mousemove', (e) => {
        if (gftFrameDragIndex === null || !gftFrameDragGhost) return;
        gftFrameIsDragging = true;
        gftFrameDragGhost.style.left = `${e.clientX - gftFrameDragGhost.offsetWidth / 2}px`;
        gftFrameDragGhost.style.top = `${e.clientY - gftFrameDragGhost.offsetHeight / 2}px`;

        const preview = get('gft-image-preview');
        if (!preview) return;
        const previewWrap = preview.closest('.image-preview-wrap');
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        let indicator = null;
        for (const el of elements) {
            if (el.classList.contains('image-drop-indicator')) { indicator = el; break; }
            if (el.classList.contains('image-preview-item') && !el.classList.contains('dragging')) {
                const rect = el.getBoundingClientRect();
                const isRight = (e.clientX - rect.left) > rect.width / 2;
                const idx = parseInt(el.dataset.index, 10);
                if (!isNaN(idx)) {
                    indicator = preview.querySelector(`.image-drop-indicator[data-index="${isRight ? idx + 1 : idx}"]`);
                    break;
                }
            }
        }
        preview.querySelectorAll('.image-drop-indicator.drag-over').forEach(el => {
            if (el !== indicator) el.classList.remove('drag-over');
        });
        if (indicator) {
            indicator.classList.add('drag-over');
            gftFrameCurrentDropIndex = parseInt(indicator.dataset.index, 10);
        } else {
            gftFrameCurrentDropIndex = -1;
        }

        gftHandleAutoScroll(e, preview, previewWrap);
    });

    document.addEventListener('mouseup', () => {
        if (gftFrameDragGhost) { gftFrameDragGhost.remove(); gftFrameDragGhost = null; }
        if (!gftFrameIsDragging || gftFrameDragIndex === null) {
            gftFrameDragIndex = null;
            gftFrameIsDragging = false;
            gftFrameCurrentDropIndex = -1;
            gftStopAutoScroll();
            return;
        }
        const preview = get('gft-image-preview');
        if (preview) {
            preview.querySelectorAll('.image-preview-item.dragging').forEach(el => el.classList.remove('dragging'));
            preview.classList.remove('is-dragging');
            preview.querySelectorAll('.image-drop-indicator.drag-over').forEach(el => el.classList.remove('drag-over'));
        }
        gftStopAutoScroll();
        const from = gftFrameDragIndex;
        const to = gftFrameCurrentDropIndex;
        if (!isNaN(from) && !isNaN(to) && to >= 0 && to !== from && to !== from + 1) {
            const updated = gftFrames.slice();
            const [moved] = updated.splice(from, 1);
            const finalTo = to > from ? to - 1 : to;
            updated.splice(finalTo, 0, moved);
            gftFrames = updated;
            gftRenderCarousel(true);
            gftRenderTimeline();
        }
        gftFrameDragIndex = null;
        gftFrameIsDragging = false;
        gftFrameCurrentDropIndex = -1;
    });
}

// ─── GIF Timeline (Premiere-like per-frame duration) ─────────────────────────

const GFT_TIMELINE_PX_PER_100MS = 12; // pixels per 100ms of frame duration
const GFT_MIN_FRAME_MS = 20;
const GFT_MAX_FRAME_MS = 10000;
const GFT_MIN_CLIP_PX = 44;
const GFT_BASE_DURATION_PX = Math.round((GFT_MIN_FRAME_MS / 100) * GFT_TIMELINE_PX_PER_100MS);

const gftDurationToClipWidth = (durationMs) => {
    const scaled = Math.round((durationMs / 100) * GFT_TIMELINE_PX_PER_100MS);
    return GFT_MIN_CLIP_PX + Math.max(0, scaled - GFT_BASE_DURATION_PX);
};

function gftRenderTimeline() {
    const track = get('gft-timeline-track');
    if (!track) return;
    track.innerHTML = '';

    if (gftFrames.length === 0) return;

    gftFrames.forEach((frame, index) => {
        const clipW = gftDurationToClipWidth(frame.durationMs);

        const clip = document.createElement('div');
        clip.className = 'gft-timeline-clip';
        clip.dataset.index = String(index);
        clip.style.width = clipW + 'px';
        clip.title = `Frame ${index + 1}: ${frame.durationMs}ms`;

        const thumb = document.createElement('img');
        thumb.src = window.api.convertFileSrc(frame.path);
        thumb.className = 'gft-timeline-thumb';
        thumb.draggable = false;

        const labelEl = document.createElement('span');
        labelEl.className = 'gft-timeline-label';
        labelEl.textContent = `${frame.durationMs}ms`;

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'gft-timeline-resize-handle';
        resizeHandle.title = 'Drag to change duration';

        clip.appendChild(thumb);
        clip.appendChild(labelEl);
        clip.appendChild(resizeHandle);
        track.appendChild(clip);

        // Resize drag
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            gftTimelineDragState = { index, startX: e.clientX, origDurationMs: frame.durationMs };

            function onMove(ev) {
                if (!gftTimelineDragState) return;
                const dx = ev.clientX - gftTimelineDragState.startX;
                const deltaMsRaw = (dx / GFT_TIMELINE_PX_PER_100MS) * 100;
                const newMs = Math.round(Math.max(GFT_MIN_FRAME_MS, Math.min(GFT_MAX_FRAME_MS, gftTimelineDragState.origDurationMs + deltaMsRaw)));
                gftFrames[gftTimelineDragState.index].durationMs = newMs;
                // Live update just this clip width and label
                const newW = gftDurationToClipWidth(newMs);
                clip.style.width = newW + 'px';
                labelEl.textContent = `${newMs}ms`;
                clip.title = `Frame ${index + 1}: ${newMs}ms`;
            }

            function onUp() {
                gftTimelineDragState = null;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

// ─── GIF Global Timing Controls ──────────────────────────────────────────────

function setupGftGlobalTimingHandlers() {
    const fpsInput = get('gft-global-fps');
    const delayInput = get('gft-global-delay-ms');

    if (fpsInput) {
        fpsInput.addEventListener('input', () => {
            const fps = Math.max(1, Math.min(60, parseInt(fpsInput.value) || 12));
            const ms = Math.round(1000 / fps);
            gftGlobalDelayMs = ms;
            if (delayInput) delayInput.value = String(ms);
            gftApplyGlobalDelay(ms);
        });
    }

    if (delayInput) {
        delayInput.addEventListener('input', () => {
            const ms = Math.max(10, Math.min(5000, parseInt(delayInput.value) || 83));
            gftGlobalDelayMs = ms;
            const fps = Math.round(1000 / ms);
            if (fpsInput) fpsInput.value = String(fps);
            gftApplyGlobalDelay(ms);
        });
    }
}

function gftApplyGlobalDelay(ms) {
    gftFrames.forEach(f => { f.durationMs = ms; });
    gftRenderTimeline();
}

// ─── GIF Sort Handlers ────────────────────────────────────────────────────────

function setupGftSortHandlers() {
    const sortContainer = get('gft-sort-container');
    const sortBtn = get('gft-sort-btn');
    if (!sortContainer || !sortBtn) return;

    sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.dropdown-container.open').forEach(d => {
            if (d !== sortContainer) d.classList.remove('open');
        });
        sortContainer.classList.toggle('open');
    });

    sortContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item || !item.dataset.sort) return;
        gftSortFrames(item.dataset.sort);
        sortContainer.classList.remove('open');
    });

    window.addEventListener('click', () => sortContainer.classList.remove('open'));
}

function gftSortFrames(criteria) {
    if (gftFrames.length === 0) return;
    const sorted = gftFrames.slice();
    switch (criteria) {
        case 'name-asc': sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); break;
        case 'name-desc': sorted.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })); break;
        case 'added-asc': sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0)); break;
        case 'added-desc': sorted.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)); break;
    }
    gftFrames = sorted;
    gftRenderCarousel(true);
    gftRenderTimeline();
}

// ─── GIF Image Conversion ─────────────────────────────────────────────────────

async function gftFireImageConversion() {
    if (gftFrames.length === 0) {
        showPopup('Add at least one image frame first.');
        return;
    }

    const firstName = gftFrames[0].name.replace(/\.[^.]+$/, '');
    let outputPath = await window.api.saveFile({
        title: 'Save GIF',
        defaultName: `${firstName}.gif`,
        filters: [{ name: 'GIF', extensions: ['gif'] }]
    });
    if (!outputPath) return;
    if (!outputPath.toLowerCase().endsWith('.gif')) outputPath += '.gif';

    const convertBtn = get('vtg-convert-btn');
    const convertBtnHtml = convertBtn ? convertBtn.innerHTML : '';
    if (convertBtn) {
        convertBtn.disabled = true;
        convertBtn.innerHTML = `<span class="loader-shell" data-loader data-loader-size="18"></span> Converting...`;
        const { renderLoaders } = await import('./ui-utils.js');
        renderLoaders({ selector: '#vtg-convert-btn [data-loader]' });
    }

    try {
        state.setLastActiveViewId('gifToolsDropZone');
        const result = await window.api.imageToGif({
            image_paths: gftFrames.map(f => f.path),
            frame_durations_ms: gftFrames.map(f => f.durationMs),
            output_path: outputPath,
            width: parseInt(get('vtg-width')?.value || '480'),
        });

        if (!result) {
            showPopup('Failed to create GIF.');
            return;
        }

        gftClearFrames();
        const dropZone = get('gif-tools-drop-zone');
        const dashboard = get('gif-tools-dashboard');
        if (dropZone && dashboard) {
            dashboard.classList.add('hidden');
            dropZone.classList.remove('hidden');
        }

        const completeTitle = get('complete-title');
        const outputPathEl = get('output-path');
        const completeView = get('complete-view');
        const newEncodeBtn = get('new-encode-btn');

        if (completeTitle) completeTitle.textContent = 'GIF Created!';
        if (newEncodeBtn) newEncodeBtn.textContent = 'Create Another GIF';
        if (outputPathEl) outputPathEl.textContent = result;
        state.setCurrentOutputPath(result);
        showView(completeView);
    } catch (err) {
        showPopup(`Failed to create GIF: ${err?.message || err}`);
    } finally {
        if (convertBtn) {
            convertBtn.disabled = false;
            convertBtn.innerHTML = convertBtnHtml;
        }
    }
}
