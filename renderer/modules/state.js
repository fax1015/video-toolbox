// Shared State Management

// Audio/Subtitle tracks
export let audioTracks = [];
export let subtitleTracks = [];
export let chaptersFile = null;

export function setAudioTracks(tracks) {
    audioTracks = tracks;
}

export function setSubtitleTracks(tracks) {
    subtitleTracks = tracks;
}

export function setChaptersFile(file) {
    chaptersFile = file;
}

// File state
export let currentFilePath = null;
export let currentOutputPath = null;
export let currentFileDurationSeconds = 0;
export let currentFileWidth = 0;
export let currentFileHeight = 0;
export let currentFileFps = 0;

export function setCurrentFile(path, duration = 0, width = 0, height = 0, fps = 0) {
    currentFilePath = path;
    currentFileDurationSeconds = duration;
    currentFileWidth = width;
    currentFileHeight = height;
    currentFileFps = fps;
}

export function setCurrentOutputPath(path) {
    currentOutputPath = path;
}

// Encoding state
export let isEncoding = false;
export let isCancelled = false;
export let lastActiveViewId = null;
export let isExtracting = false;
export let isTrimming = false;
export let isVideoToGifing = false;
export let originalFileBitrate = 0;

export function setEncodingState(encoding) {
    isEncoding = encoding;
}

export function setCancelled(cancelled) {
    isCancelled = cancelled;
}

export function setLastActiveViewId(id) {
    lastActiveViewId = id;
}

export function setExtracting(extracting) {
    isExtracting = extracting;
}

export function setTrimming(trimming) {
    isTrimming = trimming;
}

export function setVideoToGifing(converting) {
    isVideoToGifing = converting;
}

export function setOriginalFileBitrate(bitrate) {
    originalFileBitrate = bitrate;
}

// Queue state
export let encodingQueue = [];
export let isQueueRunning = false;
export let currentlyEncodingItemId = null;
export let currentEditingQueueId = null;

export function setEncodingQueue(queue) {
    encodingQueue = queue;
}

export function setQueueRunning(running) {
    isQueueRunning = running;
}

export function setCurrentlyEncodingItemId(id) {
    currentlyEncodingItemId = id;
}

export function setCurrentEditingQueueId(id) {
    currentEditingQueueId = id;
}

// Preset state
export let currentPresetUsed = null;
export let currentPresetOriginalSettings = null;
export let isCurrentSettingsModified = false;

export function setCurrentPreset(name, settings, modified = false) {
    currentPresetUsed = name;
    currentPresetOriginalSettings = settings;
    isCurrentSettingsModified = modified;
}

// Trim state
export let extractFilePath = null;
export let trimFilePath = null;
export let trimDurationSeconds = 0;
export let trimStartSeconds = 0;
export let trimEndSeconds = 0;

export function setExtractFilePath(path) {
    extractFilePath = path;
}

export function setTrimFilePath(path) {
    trimFilePath = path;
}

export function setTrimTime(duration, start, end) {
    trimDurationSeconds = duration;
    trimStartSeconds = start;
    trimEndSeconds = end;
}

// Hardware detection
export let detectedEncoders = { nvenc: false, amf: false, qsv: false };

export function setDetectedEncoders(encoders) {
    detectedEncoders = encoders;
}

// Settings
export let appSettings = {};
export let isApplyingSettings = false;

export function setAppSettings(settings) {
    appSettings = settings;
}

export function setApplyingSettings(applying) {
    isApplyingSettings = applying;
}

// Custom presets
export let customPresets = {};
export let isCreatingPreset = false;

export function setCustomPresets(presets) {
    customPresets = presets;
}

export function setCreatingPreset(creating) {
    isCreatingPreset = creating;
}

// Download state
export let currentVideoInfo = null;
export let currentDownloadUrl = '';
export let selectedFormatId = null;
export let currentFormatTab = 'video';
export let isSyncingUI = false;
export let isFormatsExpanded = false;

export function setCurrentVideoInfo(info) {
    currentVideoInfo = info;
}

export function setCurrentDownloadUrl(url) {
    currentDownloadUrl = url;
}

export function setSelectedFormatId(id) {
    selectedFormatId = id;
}

export function setCurrentFormatTab(tab) {
    currentFormatTab = tab;
}

export function setSyncingUI(syncing) {
    isSyncingUI = syncing;
}

export function setFormatsExpanded(expanded) {
    isFormatsExpanded = expanded;
}
