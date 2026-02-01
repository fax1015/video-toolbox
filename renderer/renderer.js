document.addEventListener('DOMContentLoaded', () => {
    console.log('Renderer initialized');

    const get = (id) => {
        const el = document.getElementById(id);
        if (!el) console.warn(`Element with ID "${id}" not found`);
        return el;
    };

    const dropZone = get('drop-zone');
    const folderDropZone = get('folder-drop-zone');
    const extractAudioDropZone = get('extract-audio-drop-zone');
    const extractAudioDashboard = get('extract-audio-dashboard');
    const trimDropZone = get('trim-drop-zone');
    const trimDashboard = get('trim-dashboard');
    const dashboard = get('file-dashboard');
    const progressView = get('progress-view');
    const completeView = get('complete-view');
    const settingsView = get('settings-view');
    const queueView = get('queue-view');

    const filenameEl = get('filename');
    const resolutionEl = get('file-resolution');
    const durationEl = get('file-duration');
    const bitrateEl = get('file-bitrate');
    const fileIcon = get('file-icon');

    const backBtn = get('back-btn');
    const settingsBackBtn = get('settings-back-btn');
    const convertBtn = get('convert-btn');
    const cancelBtn = get('cancel-btn');

    const formatSelect = get('format-select');
    const codecSelect = get('codec-select');
    const presetSelect = get('preset-select');
    const audioSelect = get('audio-select');
    const crfSlider = get('crf-slider');
    const crfValue = get('crf-value');
    const audioBitrateSelect = get('audio-bitrate');

    const progressPercent = get('progress-percent');
    const progressRing = get('progress-ring');
    const progressTitle = get('progress-title');
    const timeElapsed = get('time-elapsed');
    const encodeSpeed = get('encode-speed');
    const progressFilename = get('progress-filename');
    const timePosition = get('time-position');
    const completeTitle = get('complete-title');

    const outputPathEl = get('output-path');
    const openFileBtn = get('open-file-btn');
    const openFolderBtn = get('open-folder-btn');
    const newEncodeBtn = get('new-encode-btn');

    const navVideo = get('nav-video');
    const navFolder = get('nav-folder');
    const navTrim = get('nav-trim');
    const navExtractAudio = get('nav-extract-audio');
    const navSettings = get('nav-settings');
    const navQueue = get('nav-queue');

    const addQueueBtn = get('add-queue-btn');
    const queueList = get('queue-list');
    const queueBadge = get('queue-badge');
    const clearQueueBtn = get('clear-queue-btn');
    const startQueueBtn = get('start-queue-btn');
    const queueAddBtn = get('queue-add-btn');

    const hwAccelSelect = get('hw-accel');
    const outputSuffixInput = get('output-suffix');
    const defaultFormatSelect = get('default-format');
    const themeSelectAttr = get('theme-select');
    const accentColorSelect = get('accent-color-select');
    const workPrioritySelect = get('work-priority-select');
    const outputFolderInput = get('output-folder');
    const selectOutputFolderBtn = get('select-output-folder-btn');
    const overwriteFilesCheckbox = get('overwrite-files');
    const notifyOnCompleteCheckbox = get('notify-on-complete');
    const hwAutoTag = get('hw-auto-tag');

    const toggleAdvancedBtn = get('toggle-advanced-btn');
    const advancedPanel = get('advanced-panel');
    const customFfmpegArgs = get('custom-ffmpeg-args');

    const revertVideoBtn = get('revert-video-btn');

    const startQueueIcon = get('start-queue-icon');
    const pauseQueueIcon = get('pause-queue-icon');
    const pauseQueueIcon2 = get('pause-queue-icon-2');
    const startQueueText = get('start-queue-text');

    const presetMenuBtn = get('preset-menu-btn');
    const presetDropdown = get('preset-dropdown');
    const currentPresetName = get('current-preset-name');
    const customPresetsList = get('custom-presets-list');
    const savePresetBtn = get('save-preset-btn');

    const resolutionSelect = get('resolution-select');
    const fpsSelect = get('fps-select');
    const vBitrateInput = get('v-bitrate');
    const twoPassCheckbox = get('two-pass');
    const crfContainer = get('crf-container');
    const bitrateContainer = get('bitrate-container');
    const addAudioBtn = get('add-audio-btn');
    const audioTrackList = get('audio-track-list');
    const addSubtitleBtn = get('add-subtitle-btn');
    const subtitleTrackList = get('subtitle-track-list');
    const chapterImportZone = get('chapter-import-zone');
    const chaptersInfo = get('chapters-info');
    const chaptersFilename = get('chapters-filename');
    const removeChaptersBtn = get('remove-chapters-btn');

    let audioTracks = [];
    let subtitleTracks = [];
    let chaptersFile = null;

    let currentFilePath = null;
    let currentOutputPath = null;
    let isEncoding = false;
    let lastActiveViewId = null;
    let isCancelled = false;
    let encodingQueue = [];
    let isQueueRunning = false;
    let currentlyEncodingItemId = null;
    let currentEditingQueueId = null;
    let currentPresetUsed = null;
    let currentPresetOriginalSettings = null;
    let isCurrentSettingsModified = false;
    let extractFilePath = null;
    let trimFilePath = null;
    let trimDurationSeconds = 0;
    let trimStartSeconds = 0;
    let trimEndSeconds = 0;
    let isExtracting = false;
    let isTrimming = false;
    let originalFileBitrate = 0;

    const trimmedDurationEl = get('trimmed-duration');
    const estimatedFileSizeEl = get('estimated-file-size');


    const APP_SETTINGS_KEY = 'video_toolbox_settings';
    let appSettings = {
        hwAccel: 'auto',
        outputSuffix: '_encoded',
        defaultFormat: 'mp4',
        theme: 'dark',
        accentColor: 'green',
        workPriority: 'normal',
        outputFolder: '',
        overwriteFiles: false,
        notifyOnComplete: true
    };

    let detectedEncoders = { nvenc: false, amf: false, qsv: false };

    function loadSettings() {
        const saved = localStorage.getItem(APP_SETTINGS_KEY);
        if (saved) {
            try {
                appSettings = { ...appSettings, ...JSON.parse(saved) };
            } catch (e) { console.error('Error parsing settings', e); }
        }
        applySettings();
    }

    function saveSettings() {
        if (hwAccelSelect) {
            const selected = hwAccelSelect.value;
            if (selected === 'auto') {
                appSettings.hwAccel = 'auto';
            } else {
                const resolved = getAutoEncoder();
                if (appSettings.hwAccel === 'auto' && selected === resolved) {
                    appSettings.hwAccel = 'auto';
                } else {
                    appSettings.hwAccel = selected;
                }
            }
        }
        if (outputSuffixInput) appSettings.outputSuffix = outputSuffixInput.value;
        if (defaultFormatSelect) appSettings.defaultFormat = defaultFormatSelect.value;
        if (themeSelectAttr) appSettings.theme = themeSelectAttr.value;
        if (accentColorSelect) appSettings.accentColor = accentColorSelect.value;
        if (workPrioritySelect) appSettings.workPriority = workPrioritySelect.value;
        if (outputFolderInput) appSettings.outputFolder = outputFolderInput.value;
        if (overwriteFilesCheckbox) appSettings.overwriteFiles = overwriteFilesCheckbox.checked;
        if (notifyOnCompleteCheckbox) appSettings.notifyOnComplete = notifyOnCompleteCheckbox.checked;

        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings));
        applySettings();
    }

    function applySettings() {
        if (hwAccelSelect) {
            if (appSettings.hwAccel === 'auto') {
                const resolved = getAutoEncoder();
                hwAccelSelect.value = resolved !== 'none' ? resolved : 'none';
                hwAccelSelect.dataset.auto = 'true';
            } else {
                hwAccelSelect.value = appSettings.hwAccel;
                delete hwAccelSelect.dataset.auto;
            }
        }
        if (outputSuffixInput) outputSuffixInput.value = appSettings.outputSuffix;
        if (defaultFormatSelect) defaultFormatSelect.value = appSettings.defaultFormat;
        if (themeSelectAttr) themeSelectAttr.value = appSettings.theme;
        if (accentColorSelect) accentColorSelect.value = appSettings.accentColor;
        if (workPrioritySelect) workPrioritySelect.value = appSettings.workPriority;
        if (outputFolderInput) outputFolderInput.value = appSettings.outputFolder;
        if (overwriteFilesCheckbox) overwriteFilesCheckbox.checked = appSettings.overwriteFiles;
        if (notifyOnCompleteCheckbox) notifyOnCompleteCheckbox.checked = appSettings.notifyOnComplete;


        document.body.classList.remove('oled-theme', 'light-theme');
        if (appSettings.theme === 'oled') document.body.classList.add('oled-theme');
        if (appSettings.theme === 'light') document.body.classList.add('light-theme');


        applyAccentColor();


        updateHardwareAutoTag();


        if (formatSelect && !currentEditingQueueId) {
            formatSelect.value = appSettings.defaultFormat;
        }
    }

    async function detectHardware() {
        try {
            detectedEncoders = await electron.getEncoders();
            console.log('Detected encoders:', detectedEncoders);

            if (appSettings.hwAccel === 'auto' && hwAccelSelect) {
                const resolved = getAutoEncoder();
                hwAccelSelect.value = resolved !== 'none' ? resolved : 'none';
                hwAccelSelect.dataset.auto = 'true';
            }
            updateHardwareAutoTag();
        } catch (e) {
            console.error('Error detecting hardware:', e);
        }
    }


    function resetVideoDefaults() {
        if (!confirm('Revert encoding settings for this video to defaults?')) return;

        if (formatSelect) formatSelect.value = appSettings.defaultFormat || 'mp4';
        if (codecSelect) codecSelect.value = 'h264';
        if (presetSelect) presetSelect.value = 'medium';
        if (resolutionSelect) resolutionSelect.value = 'source';
        if (fpsSelect) fpsSelect.value = 'source';

        const crfRadio = document.querySelector('input[name="rate-mode"][value="crf"]');
        if (crfRadio) {
            crfRadio.checked = true;
            crfRadio.dispatchEvent(new Event('change'));
        }

        if (crfSlider) {
            crfSlider.value = 23;
            if (crfValue) crfValue.textContent = '23';
        }
        if (vBitrateInput) vBitrateInput.value = '2500';
        if (twoPassCheckbox) twoPassCheckbox.checked = false;
        if (audioSelect) audioSelect.value = 'aac';
        if (audioBitrateSelect) audioBitrateSelect.value = '192k';
        if (customFfmpegArgs) customFfmpegArgs.value = '';


        if (currentFilePath) {
            audioTracks = [{ isSource: true, name: 'Source Audio' }];
        } else {
            audioTracks = [];
        }
        subtitleTracks = [];
        chaptersFile = null;

        renderAudioTracks();
        renderSubtitleTracks();
        if (chaptersInfo) chaptersInfo.classList.add('hidden');
        if (chapterImportZone) chapterImportZone.classList.remove('hidden');
    }

    function updateHardwareAutoTag() {
        if (!hwAutoTag) return;
        if (appSettings.hwAccel === 'auto') {
            const selected = getAutoEncoder();
            hwAutoTag.textContent = selected === 'none' ? '(none found)' : `(selected: ${selected.toUpperCase()})`;
            hwAutoTag.classList.remove('hidden');
        } else {
            hwAutoTag.classList.add('hidden');
        }
    }

    function getAutoEncoder() {
        if (detectedEncoders.nvenc) return 'nvenc';
        if (detectedEncoders.amf) return 'amf';
        if (detectedEncoders.qsv) return 'qsv';
        return 'none';
    }

    function applyAccentColor() {
        const colors = {
            green: { primary: '#52d698', secondary: '#51d497', glow: 'rgba(99, 241, 189, 0.05)' },
            blue: { primary: '#60a5fa', secondary: '#3b82f6', glow: 'rgba(96, 165, 250, 0.05)' },
            purple: { primary: '#a78bfa', secondary: '#8b5cf6', glow: 'rgba(167, 139, 250, 0.05)' },
            pink: { primary: '#f472b6', secondary: '#ec4899', glow: 'rgba(244, 114, 182, 0.05)' },
            orange: { primary: '#fb923c', secondary: '#f97316', glow: 'rgba(251, 146, 60, 0.05)' },
            red: { primary: '#f87171', secondary: '#ef4444', glow: 'rgba(248, 113, 113, 0.05)' },
            cyan: { primary: '#22d3ee', secondary: '#06b6d4', glow: 'rgba(34, 211, 238, 0.05)' }
        };

        const color = colors[appSettings.accentColor] || colors.green;
        document.documentElement.style.setProperty('--accent-primary', color.primary);
        document.documentElement.style.setProperty('--accent-secondary', color.secondary);
        document.documentElement.style.setProperty('--accent-glow', color.glow);
    }

    detectHardware();
    loadSettings();


    const changeElements = [outputSuffixInput, defaultFormatSelect, themeSelectAttr, accentColorSelect, workPrioritySelect, overwriteFilesCheckbox, notifyOnCompleteCheckbox, outputFolderInput];
    if (hwAccelSelect) {
        hwAccelSelect.addEventListener('change', () => {

            delete hwAccelSelect.dataset.auto;
            saveSettings();
        });
    }
    changeElements.forEach(el => { if (el) el.addEventListener('change', saveSettings); });

    if (revertVideoBtn) revertVideoBtn.addEventListener('click', resetVideoDefaults);

    const revertOutputFolderBtn = get('revert-output-folder-btn');
    if (revertOutputFolderBtn) {
        revertOutputFolderBtn.addEventListener('click', () => {
            if (outputFolderInput) {
                outputFolderInput.value = '';
                saveSettings();
            }
        });
    }

    if (selectOutputFolderBtn) {
        selectOutputFolderBtn.addEventListener('click', async () => {
            const path = await electron.selectFolder();
            if (path) {
                outputFolderInput.value = path;
                saveSettings();
            }
        });
    }

    if (toggleAdvancedBtn) {
        toggleAdvancedBtn.addEventListener('click', () => {
            advancedPanel.classList.toggle('hidden');
            toggleAdvancedBtn.querySelector('svg').style.transform = advancedPanel.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }


    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            tabButtons.forEach(b => b.classList.toggle('active', b === btn));
            tabContents.forEach(c => c.classList.toggle('hidden', c.id !== `tab-${tabName}`));
        });
    });


    const rateModeRadios = document.querySelectorAll('input[name="rate-mode"]');
    if (rateModeRadios) {
        rateModeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const mode = radio.value;
                if (crfContainer) crfContainer.classList.toggle('hidden', mode !== 'crf');
                if (bitrateContainer) bitrateContainer.classList.toggle('hidden', mode !== 'bitrate');
            });
        });
    }


    if (addAudioBtn) {
        addAudioBtn.addEventListener('click', async () => {
            const path = await electron.selectFile();
            if (path) {
                audioTracks.push({ path, name: path.split(/[\\/]/).pop() });
                renderAudioTracks();
            }
        });
    }

    window.removeAudioTrack = (index) => {
        audioTracks.splice(index, 1);
        renderAudioTracks();
    };

    function renderAudioTracks() {
        if (!audioTrackList) return;

        if (audioTracks.length === 0) {
            audioTrackList.innerHTML = `
                <div class="empty-state-small">
                    <p style="color: var(--error); font-size: 0.8rem; margin: 10px 0; text-align: center;">
                        ⚠️ All audio tracks removed. Output will have no audio.
                    </p>
                </div>
            `;
            if (audioSelect) audioSelect.disabled = true;
            if (audioBitrateSelect) audioBitrateSelect.disabled = true;
        } else {
            audioTrackList.innerHTML = audioTracks.map((track, index) => `
                <div class="track-item">
                    <div class="track-item-info">
                        <span class="track-title">${track.name}</span>
                        <span class="track-meta">${track.isSource ? 'Original Track' : 'External Audio'}</span>
                    </div>
                    <button class="remove-btn" onclick="window.removeAudioTrack(${index})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `).join('');
            if (audioSelect) audioSelect.disabled = false;
            if (audioBitrateSelect) audioBitrateSelect.disabled = false;
        }
    }


    if (addSubtitleBtn) {
        addSubtitleBtn.addEventListener('click', async () => {
            const path = await electron.selectFile();
            if (path) {
                subtitleTracks.push({ path, name: path.split(/[\\/]/).pop() });
                renderSubtitleTracks();
            }
        });
    }

    window.removeSubtitleTrack = (index) => {
        subtitleTracks.splice(index, 1);
        renderSubtitleTracks();
    };

    function renderSubtitleTracks() {
        if (!subtitleTrackList) return;
        subtitleTrackList.innerHTML = subtitleTracks.map((track, index) => `
            <div class="track-item">
                <div class="track-item-info">
                    <span class="track-title">${track.name}</span>
                    <span class="track-meta">External Subtitle</span>
                </div>
                <button class="remove-btn" onclick="window.removeSubtitleTrack(${index})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');
    }


    if (chapterImportZone) {
        chapterImportZone.addEventListener('click', async () => {
            const path = await electron.selectFile();
            if (path) {
                chaptersFile = path;
                if (chaptersFilename) chaptersFilename.textContent = path.split(/[\\/]/).pop();
                if (chaptersInfo) chaptersInfo.classList.remove('hidden');
                if (chapterImportZone) chapterImportZone.classList.add('hidden');
            }
        });
    }

    if (removeChaptersBtn) {
        removeChaptersBtn.addEventListener('click', () => {
            chaptersFile = null;
            if (chaptersInfo) chaptersInfo.classList.add('hidden');
            if (chapterImportZone) chapterImportZone.classList.remove('hidden');
        });
    }


    if (!window.electron) {
        console.error('Electron bridge not found! Check preload script configuration.');
        return;
    }

    const { electron } = window;


    function showView(view) {
        if (!view) return;
        [dropZone, folderDropZone, extractAudioDropZone, extractAudioDashboard, trimDropZone, trimDashboard, dashboard, progressView, completeView, settingsView, queueView].forEach(v => {
            if (v) v.classList.add('hidden');
        });
        view.classList.remove('hidden');
    }

    function toggleSidebar(disabled) {
        [navVideo, navFolder, navTrim, navExtractAudio, navSettings, navQueue].forEach(btn => {
            if (btn) btn.classList.toggle('disabled', disabled);
        });
    }

    function resetProgress() {
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressRing) progressRing.style.strokeDashoffset = 502;
        if (timeElapsed) timeElapsed.textContent = '00:00:00';
        if (timePosition) timePosition.textContent = '00:00:00';
        if (encodeSpeed) encodeSpeed.textContent = '0.00x';
    }


    function resetNav() {
        if (navVideo) navVideo.classList.remove('active');
        if (navFolder) navFolder.classList.remove('active');
        if (navTrim) navTrim.classList.remove('active');
        if (navExtractAudio) navExtractAudio.classList.remove('active');
        if (navSettings) navSettings.classList.remove('active');
        if (navQueue) navQueue.classList.remove('active');
    }

    if (navVideo) {
        navVideo.addEventListener('click', () => {
            console.log('Nav: Video clicked');
            resetNav();
            navVideo.classList.add('active');
            showView(dropZone);
        });
    }

    if (navFolder) {
        navFolder.addEventListener('click', () => {
            console.log('Nav: Folder clicked');
            resetNav();
            navFolder.classList.add('active');
            showView(folderDropZone);
        });
    }

    if (navQueue) {
        navQueue.addEventListener('click', () => {
            console.log('Nav: Queue clicked');
            resetNav();
            navQueue.classList.add('active');
            showView(queueView);
            renderQueue();
        });
    }

    if (navTrim) {
        navTrim.addEventListener('click', () => {
            resetNav();
            navTrim.classList.add('active');
            showView(trimDropZone);
        });
    }
    if (navExtractAudio) {
        navExtractAudio.addEventListener('click', () => {
            resetNav();
            navExtractAudio.classList.add('active');
            showView(extractAudioDropZone);
        });
    }
    if (navSettings) {
        navSettings.addEventListener('click', () => {
            console.log('Nav: Settings clicked');
            resetNav();
            navSettings.classList.add('active');
            showView(settingsView);
        });
    }




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
                const filePath = await electron.selectFile();
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
                const folderPath = await electron.selectFolder();
                if (folderPath) {
                    handleFolderSelection(folderPath);
                }
            } catch (err) {
                console.error('Error selecting folder:', err);
            }
        });
    }

    // --- Extract Audio ---
    const extractFilenameEl = get('extract-filename');
    const extractFileIcon = get('extract-file-icon');
    const extractFileDuration = get('extract-file-duration');
    const extractAudioFormatSelect = get('extract-audio-format');
    const extractAudioBitrateSelect = get('extract-audio-bitrate');
    const extractAddQueueBtn = get('extract-add-queue-btn');
    const extractBitrateGroup = get('extract-bitrate-group');
    const extractAudioBtn = get('extract-audio-btn');
    const extractBackBtn = get('extract-back-btn');

    function updateExtractBitrateVisibility() {
        if (!extractAudioFormatSelect || !extractBitrateGroup) return;
        const format = extractAudioFormatSelect.value;
        extractBitrateGroup.classList.toggle('hidden', format === 'flac' || format === 'wav');
    }
    if (extractAudioFormatSelect) {
        extractAudioFormatSelect.addEventListener('change', updateExtractBitrateVisibility);
    }

    async function handleExtractFileSelection(filePath) {
        extractFilePath = filePath;
        const name = filePath.split(/[\\/]/).pop();
        const ext = name.split('.').pop().toUpperCase();
        if (extractFilenameEl) extractFilenameEl.textContent = name;
        if (extractFileIcon) extractFileIcon.textContent = ext;
        if (extractFileDuration) extractFileDuration.textContent = '...';
        showView(extractAudioDashboard);
        updateExtractBitrateVisibility();
        try {
            const metadata = await electron.getMetadata(filePath);
            if (extractFileDuration) extractFileDuration.textContent = metadata.duration;
        } catch (e) { if (extractFileDuration) extractFileDuration.textContent = 'Unknown'; }
    }

    if (extractAudioDropZone) {
        extractAudioDropZone.addEventListener('dragover', (e) => { e.preventDefault(); extractAudioDropZone.classList.add('drag-over'); });
        extractAudioDropZone.addEventListener('dragleave', () => extractAudioDropZone.classList.remove('drag-over'));
        extractAudioDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            extractAudioDropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleExtractFileSelection(file.path);
        });
        extractAudioDropZone.addEventListener('click', async () => {
            const path = await electron.selectFile();
            if (path) handleExtractFileSelection(path);
        });
    }
    if (extractBackBtn) extractBackBtn.addEventListener('click', () => { showView(extractAudioDropZone); resetNav(); navExtractAudio.classList.add('active'); });
    if (extractAddQueueBtn) {
        extractAddQueueBtn.addEventListener('click', () => {
            if (!extractFilePath) return;
            const format = extractAudioFormatSelect ? extractAudioFormatSelect.value : 'mp3';
            const bitrate = (format === 'flac' || format === 'wav') ? null : (extractAudioBitrateSelect ? extractAudioBitrateSelect.value : '192k');
            addToQueue({ input: extractFilePath, format, bitrate }, 'extract');
            showView(queueView);
            resetNav();
            navQueue.classList.add('active');
        });
    }
    if (extractAudioBtn) {
        extractAudioBtn.addEventListener('click', () => {
            if (!extractFilePath) return;
            isExtracting = true;
            if (progressTitle) progressTitle.textContent = 'Extracting audio...';
            if (progressFilename) progressFilename.textContent = extractFilePath.split(/[\\/]/).pop();
            resetProgress();
            showView(progressView);
            toggleSidebar(true);
            lastActiveViewId = 'extractAudioDropZone';
            const format = extractAudioFormatSelect ? extractAudioFormatSelect.value : 'mp3';
            const bitrate = (format === 'flac' || format === 'wav') ? null : (extractAudioBitrateSelect ? extractAudioBitrateSelect.value : '192k');
            electron.extractAudio({
                input: extractFilePath,
                format,
                bitrate,
                workPriority: appSettings.workPriority || 'normal'
            });
        });
    }

    // --- Trim Video ---
    const trimFilenameEl = get('trim-filename');
    const trimFileIcon = get('trim-file-icon');
    const trimFileDuration = get('trim-file-duration');
    const trimStartInput = get('trim-start');
    const trimEndInput = get('trim-end');
    const trimTimeline = get('trim-timeline');
    const trimTrack = get('trim-track');
    const trimInactiveStart = get('trim-inactive-start');
    const trimRangeHandles = get('trim-range-handles');
    const trimActiveSegment = get('trim-active-segment');
    const trimInactiveEnd = get('trim-inactive-end');
    const trimHandleLeft = get('trim-handle-left');
    const trimHandleRight = get('trim-handle-right');
    const trimWaveformWrap = get('trim-waveform-wrap');
    const trimWaveformImg = get('trim-waveform-img');
    const trimVideoBtn = get('trim-video-btn');
    const trimAddQueueBtn = get('trim-add-queue-btn');
    const trimBackBtn = get('trim-back-btn');

    // Video preview elements
    const trimVideoPreview = get('trim-video-preview');
    const videoPreviewContainer = get('video-preview-container');
    const videoOverlay = get('video-overlay');
    const playIconShape = get('play-icon-shape');
    const pauseIconShape = get('pause-icon-shape');
    const videoCurrentTime = get('video-current-time');
    const trimMuteBtn = get('trim-mute-btn');
    const volumeIcon = get('volume-icon');
    const mutedIcon = get('muted-icon');
    const trimVolumeSlider = get('trim-volume-slider');
    const trimPlayhead = get('trim-playhead');

    function timeStringToSeconds(str) {
        if (!str || typeof str !== 'string') return 0;

        // Check if there's a decimal/milliseconds part
        const [timePart, msPart] = str.trim().split('.');
        const parts = timePart.split(':').map(Number).filter(n => !isNaN(n));

        let totalSeconds = 0;
        if (parts.length === 3) totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else if (parts.length === 2) totalSeconds = parts[0] * 60 + parts[1];
        else if (parts.length === 1) totalSeconds = parts[0];

        // Add milliseconds/centiseconds if present
        if (msPart) {
            const cs = parseInt(msPart.padEnd(2, '0').substring(0, 2));
            if (!isNaN(cs)) {
                totalSeconds += cs / 100;
            }
        }

        return totalSeconds;
    }

    function secondsToTimeString(sec) {
        sec = Math.max(0, sec);
        const totalCentiseconds = Math.floor(sec * 100);
        const centiseconds = totalCentiseconds % 100;
        const totalSeconds = Math.floor(sec);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':') + '.' + centiseconds.toString().padStart(2, '0');
    }

    // Simplified time display: drops hours if 0, drops milliseconds
    function formatDisplayTime(sec) {
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

    function updateTrimTimelineVisual() {
        if (!trimDurationSeconds || !trimInactiveStart || !trimInactiveEnd || !trimRangeHandles) return;
        const startPct = (trimStartSeconds / trimDurationSeconds) * 100;
        const endPct = (trimEndSeconds / trimDurationSeconds) * 100;
        const activePct = endPct - startPct;
        trimInactiveStart.style.width = startPct + '%';
        trimRangeHandles.style.width = activePct + '%';
        trimInactiveEnd.style.width = (100 - endPct) + '%';
    }

    async function handleTrimFileSelection(filePath) {
        trimFilePath = filePath;
        const name = filePath.split(/[\\\\/]/).pop();
        const ext = name.split('.').pop().toUpperCase();
        if (trimFilenameEl) trimFilenameEl.textContent = name;
        if (trimFileIcon) trimFileIcon.textContent = ext;
        if (trimFileDuration) trimFileDuration.textContent = '...';
        if (trimWaveformWrap) trimWaveformWrap.classList.remove('has-waveform');
        if (trimWaveformImg) trimWaveformImg.removeAttribute('src');
        showView(trimDashboard);
        // Reset trimmed duration and estimated file size
        if (trimmedDurationEl) trimmedDurationEl.textContent = '00:00:00';
        if (estimatedFileSizeEl) estimatedFileSizeEl.textContent = 'Calculating...';

        // Set up video preview
        if (trimVideoPreview) {
            trimVideoPreview.src = filePath;
            trimVideoPreview.currentTime = 0;
        }
        if (videoCurrentTime) videoCurrentTime.textContent = '00:00';
        if (trimPlayhead) trimPlayhead.style.left = '0%';

        try {
            const metadata = await electron.getMetadata(filePath);
            trimDurationSeconds = metadata.durationSeconds || 0;
            if (trimFileDuration) trimFileDuration.textContent = metadata.duration;
            originalFileBitrate = parseFloat(metadata.bitrate) || 0; // Store bitrate in Kbps
            trimStartSeconds = 0;
            trimEndSeconds = trimDurationSeconds;
            if (trimStartInput) trimStartInput.value = '00:00:00';
            if (trimEndInput) trimEndInput.value = secondsToTimeString(trimDurationSeconds);
            updateTrimTimelineVisual();
            // Call syncTrimInputsFromVisual to update the new elements
            syncTrimInputsFromVisual();
            try {
                const waveformBase64 = await electron.getAudioWaveform(filePath);
                if (waveformBase64 && trimWaveformImg && trimWaveformWrap) {
                    trimWaveformImg.src = 'data:image/png;base64,' + waveformBase64;
                    trimWaveformWrap.classList.add('has-waveform');
                }
            } catch (e) { /* no waveform if no audio */ }
        } catch (e) {
            if (trimFileDuration) trimFileDuration.textContent = 'Unknown';
            trimDurationSeconds = 0;
        }
    }

    function syncTrimInputsFromVisual() {
        if (trimStartInput) trimStartInput.value = secondsToTimeString(trimStartSeconds);
        if (trimEndInput) trimEndInput.value = secondsToTimeString(trimEndSeconds);
        updateTrimTimelineVisual();

        // Calculate and display trimmed duration
        const trimmedLengthSeconds = trimEndSeconds - trimStartSeconds;
        if (trimmedDurationEl) trimmedDurationEl.textContent = secondsToTimeString(trimmedLengthSeconds);

        // Estimate file size
        estimateTrimmedFileSize(trimmedLengthSeconds);
    }

    function estimateTrimmedFileSize(trimmedLengthSeconds) {
        if (!estimatedFileSizeEl || !originalFileBitrate || trimmedLengthSeconds <= 0) {
            if (estimatedFileSizeEl) estimatedFileSizeEl.textContent = 'N/A';
            return;
        }

        const bitrateKbps = originalFileBitrate; // already in Kbps from metadata.bitrate
        if (bitrateKbps === 0) {
            if (estimatedFileSizeEl) estimatedFileSizeEl.textContent = 'N/A';
            return;
        }

        const estimatedBytes = (trimmedLengthSeconds * bitrateKbps * 1024) / 8; // bits to bytes
        const estimatedMB = estimatedBytes / (1024 * 1024);

        if (estimatedMB > 1024) {
            estimatedFileSizeEl.textContent = `${(estimatedMB / 1024.0).toFixed(2)} GB`;
        } else {
            estimatedFileSizeEl.textContent = `${estimatedMB.toFixed(2)} MB`;
        }
    }
    if (trimStartInput) {
        trimStartInput.addEventListener('change', () => {
            trimStartSeconds = Math.max(0, Math.min(trimEndSeconds - 1, timeStringToSeconds(trimStartInput.value)));
            trimEndSeconds = Math.max(trimStartSeconds + 1, trimEndSeconds);
            syncTrimInputsFromVisual();
        });
    }
    if (trimEndInput) {
        trimEndInput.addEventListener('change', () => {
            trimEndSeconds = Math.min(trimDurationSeconds, Math.max(trimStartSeconds + 1, timeStringToSeconds(trimEndInput.value)));
            trimStartSeconds = Math.min(trimStartSeconds, trimEndSeconds - 1);
            syncTrimInputsFromVisual();
        });
    }

    let trimDragging = null;
    let trimDragStartX = 0;
    let trimDragInitialStart = 0;
    let trimDragInitialEnd = 0;

    function trimTrackXToSeconds(clientX) {
        if (!trimTrack || !trimDurationSeconds) return 0;
        const rect = trimTrack.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return x * trimDurationSeconds;
    }

    function onTrimDragMove(e) {
        if (!trimDragging || !trimDurationSeconds || !trimTrack) return;
        const sec = trimTrackXToSeconds(e.clientX);
        if (trimDragging === 'start') {
            trimStartSeconds = Math.max(0, Math.min(trimEndSeconds - 1, sec));
            trimEndSeconds = Math.max(trimStartSeconds + 1, trimEndSeconds);
        } else if (trimDragging === 'end') {
            trimEndSeconds = Math.min(trimDurationSeconds, Math.max(trimStartSeconds + 1, sec));
            trimStartSeconds = Math.min(trimStartSeconds, trimEndSeconds - 1);
        } else if (trimDragging === 'range') {
            const delta = (e.clientX - trimDragStartX) / trimTrack.getBoundingClientRect().width * trimDurationSeconds;
            let newStart = trimDragInitialStart + delta;
            let newEnd = trimDragInitialEnd + delta;
            if (newStart < 0) {
                newEnd -= newStart;
                newStart = 0;
            }
            if (newEnd > trimDurationSeconds) {
                newStart -= (newEnd - trimDurationSeconds);
                newEnd = trimDurationSeconds;
            }
            newStart = Math.max(0, newStart);
            newEnd = Math.min(trimDurationSeconds, Math.max(newStart + 1, newEnd));
            trimStartSeconds = newStart;
            trimEndSeconds = newEnd;
        }
        syncTrimInputsFromVisual();

        // Auto-move video timestamp when handles are dragged
        if (trimVideoPreview) {
            let targetTime = -1;
            if (trimDragging === 'start') {
                targetTime = trimStartSeconds;
            } else if (trimDragging === 'end') {
                targetTime = trimEndSeconds;
            }

            if (targetTime >= 0) {
                // Optimistic UI update
                if (trimPlayhead && trimDurationSeconds) {
                    const pct = (targetTime / trimDurationSeconds) * 100;
                    trimPlayhead.style.left = pct + '%';
                }
                if (videoCurrentTime) {
                    const current = formatDisplayTime(targetTime);
                    const total = formatDisplayTime(trimDurationSeconds);
                    videoCurrentTime.textContent = `${current} / ${total}`;
                }
                trimVideoPreview.currentTime = targetTime;
            }
        }
    }

    function onTrimDragEnd() {
        trimDragging = null;
        document.removeEventListener('mousemove', onTrimDragMove);
        document.removeEventListener('mouseup', onTrimDragEnd);
    }

    if (trimHandleLeft) {
        trimHandleLeft.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent timeline seek
            if (!trimDurationSeconds) return;
            trimDragging = 'start';
            document.addEventListener('mousemove', onTrimDragMove);
            document.addEventListener('mouseup', onTrimDragEnd);
        });
    }
    if (trimHandleRight) {
        trimHandleRight.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent timeline seek
            if (!trimDurationSeconds) return;
            trimDragging = 'end';
            document.addEventListener('mousemove', onTrimDragMove);
            document.addEventListener('mouseup', onTrimDragEnd);
        });
    }
    if (trimActiveSegment) {
        trimActiveSegment.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent timeline seek
            if (!trimDurationSeconds) return;
            trimDragging = 'range';
            trimDragStartX = e.clientX;
            trimDragInitialStart = trimStartSeconds;
            trimDragInitialEnd = trimEndSeconds;
            document.addEventListener('mousemove', onTrimDragMove);
            document.addEventListener('mouseup', onTrimDragEnd);
        });
    }

    // --- Playhead Dragging & Seeking ---
    let isDraggingPlayhead = false;

    function getTimelineTime(clientX) {
        if (!trimTimeline || !trimDurationSeconds) return 0;
        const rect = trimTimeline.getBoundingClientRect();
        let pct = (clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        return pct * trimDurationSeconds;
    }

    let isPlayheadDragPending = false;
    let lastDragClientX = 0;

    function onPlayheadDragMove(e) {
        if (!isDraggingPlayhead) return;
        lastDragClientX = e.clientX;

        if (!isPlayheadDragPending) {
            isPlayheadDragPending = true;
            requestAnimationFrame(() => {
                if (!isDraggingPlayhead) {
                    isPlayheadDragPending = false;
                    return;
                }

                const time = getTimelineTime(lastDragClientX);
                if (isFinite(time)) {
                    // Optimistic UI update
                    if (trimPlayhead && trimDurationSeconds) {
                        const pct = (time / trimDurationSeconds) * 100;
                        trimPlayhead.style.left = pct + '%';
                    }
                    if (videoCurrentTime) {
                        const current = formatDisplayTime(time);
                        const total = formatDisplayTime(trimDurationSeconds);
                        videoCurrentTime.textContent = `${current} / ${total}`;
                    }

                    // Video seek
                    trimVideoPreview.currentTime = time;
                }
                isPlayheadDragPending = false;
            });
        }
    }

    function onPlayheadDragEnd() {
        isDraggingPlayhead = false;
        document.removeEventListener('mousemove', onPlayheadDragMove);
        document.removeEventListener('mouseup', onPlayheadDragEnd);
    }

    if (trimTimeline && trimPlayhead && trimVideoPreview) {
        trimTimeline.addEventListener('mousedown', (e) => {
            // Check if we are interacting with handles or range dragging
            if (e.target.closest('.trim-handle') || e.target.closest('.trim-active-segment')) return;

            // If clicking playhead, or inactive parts, or the timeline background (waveform)
            e.preventDefault();
            isDraggingPlayhead = true;

            // Immediate seek to click position
            const time = getTimelineTime(e.clientX);
            if (isFinite(time)) {
                // Optimistic UI update
                if (trimPlayhead && trimDurationSeconds) {
                    const pct = (time / trimDurationSeconds) * 100;
                    trimPlayhead.style.left = pct + '%';
                }
                if (videoCurrentTime) {
                    const current = formatDisplayTime(time);
                    const total = formatDisplayTime(trimDurationSeconds);
                    videoCurrentTime.textContent = `${current} / ${total}`;
                }
                trimVideoPreview.currentTime = time;
            }

            document.addEventListener('mousemove', onPlayheadDragMove);
            document.addEventListener('mouseup', onPlayheadDragEnd);
        });
    }

    if (trimDropZone) {
        trimDropZone.addEventListener('dragover', (e) => { e.preventDefault(); trimDropZone.classList.add('drag-over'); });
        trimDropZone.addEventListener('dragleave', () => trimDropZone.classList.remove('drag-over'));
        trimDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            trimDropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleTrimFileSelection(file.path);
        });
        trimDropZone.addEventListener('click', async () => {
            const path = await electron.selectFile();
            if (path) handleTrimFileSelection(path);
        });
    }
    if (trimBackBtn) trimBackBtn.addEventListener('click', () => { showView(trimDropZone); resetNav(); navTrim.classList.add('active'); });
    if (trimAddQueueBtn) {
        trimAddQueueBtn.addEventListener('click', () => {
            if (!trimFilePath || !trimDurationSeconds) return;
            if (trimDurationSeconds < 1) {
                alert('Video is too short to trim.');
                return;
            }
            trimStartSeconds = Math.max(0, timeStringToSeconds(trimStartInput ? trimStartInput.value : '0'));
            trimEndSeconds = Math.min(trimDurationSeconds, Math.max(trimStartSeconds + 1, timeStringToSeconds(trimEndInput ? trimEndInput.value : '0')));
            addToQueue({
                input: trimFilePath,
                startSeconds: trimStartSeconds,
                endSeconds: trimEndSeconds,
                outputFolder: outputFolderInput ? outputFolderInput.value : ''
            }, 'trim');
            showView(queueView);
            resetNav();
            navQueue.classList.add('active');
        });
    }
    if (trimVideoBtn) {
        trimVideoBtn.addEventListener('click', () => {
            if (!trimFilePath || !trimDurationSeconds) return;
            if (trimDurationSeconds < 1) {
                alert('Video is too short to trim.');
                return;
            }
            trimStartSeconds = Math.max(0, timeStringToSeconds(trimStartInput ? trimStartInput.value : '0'));
            trimEndSeconds = Math.min(trimDurationSeconds, Math.max(trimStartSeconds + 1, timeStringToSeconds(trimEndInput ? trimEndInput.value : '0')));
            isTrimming = true;
            if (progressTitle) progressTitle.textContent = 'Trimming video...';
            if (progressFilename) progressFilename.textContent = trimFilePath.split(/[\\/]/).pop();
            resetProgress();
            showView(progressView);
            toggleSidebar(true);
            lastActiveViewId = 'trimDropZone';
            electron.trimVideo({
                input: trimFilePath,
                startSeconds: trimStartSeconds,
                endSeconds: trimEndSeconds,
                outputFolder: outputFolderInput ? outputFolderInput.value : '',
                workPriority: appSettings.workPriority || 'normal'
            });
        });
    }

    // --- Video Preview Controls ---
    let playPauseAnimTimeout = null;

    function showPlayPauseAnimation(isPlaying) {
        if (!videoOverlay || !playIconShape || !pauseIconShape) return;
        // Show correct icon
        playIconShape.classList.toggle('hidden', isPlaying);
        pauseIconShape.classList.toggle('hidden', !isPlaying);
        // Trigger animation
        videoOverlay.classList.remove('show-icon');
        void videoOverlay.offsetWidth; // Force reflow
        videoOverlay.classList.add('show-icon');
        if (playPauseAnimTimeout) clearTimeout(playPauseAnimTimeout);
        playPauseAnimTimeout = setTimeout(() => {
            videoOverlay.classList.remove('show-icon');
        }, 600);
    }

    function updatePlayhead() {
        if (!trimVideoPreview || !trimPlayhead || !trimDurationSeconds) return;
        const pct = (trimVideoPreview.currentTime / trimDurationSeconds) * 100;
        trimPlayhead.style.left = pct + '%';
    }

    function updateVideoTimeDisplay() {
        if (!trimVideoPreview || !videoCurrentTime) return;
        const current = formatDisplayTime(trimVideoPreview.currentTime);
        const total = formatDisplayTime(trimDurationSeconds);
        videoCurrentTime.textContent = `${current} / ${total}`;
    }

    // Click on video to play/pause
    if (videoPreviewContainer) {
        videoPreviewContainer.addEventListener('click', (e) => {
            // Don't toggle if clicking on controls
            if (e.target.closest('.video-controls')) return;
            if (!trimVideoPreview) return;
            if (trimVideoPreview.paused) {
                trimVideoPreview.play();
                showPlayPauseAnimation(true);
            } else {
                trimVideoPreview.pause();
                showPlayPauseAnimation(false);
            }
        });
    }

    // Time update for playhead and timestamp
    if (trimVideoPreview) {
        trimVideoPreview.addEventListener('timeupdate', () => {
            updatePlayhead();
            updateVideoTimeDisplay();
        });

        trimVideoPreview.addEventListener('loadedmetadata', () => {
            updateVideoTimeDisplay();
        });

        trimVideoPreview.addEventListener('ended', () => {
            // Optionally reset to start of trim
            trimVideoPreview.currentTime = trimStartSeconds;
            updatePlayhead();
            updateVideoTimeDisplay();
        });
    }

    // Volume slider
    function updateVolumeSliderBackground() {
        if (!trimVolumeSlider) return;
        const value = (trimVolumeSlider.value - trimVolumeSlider.min) / (trimVolumeSlider.max - trimVolumeSlider.min) * 100;
        trimVolumeSlider.style.background = `linear-gradient(to right, var(--accent-primary) ${value}%, rgba(255, 255, 255, 0.2) ${value}%)`;
    }

    if (trimVolumeSlider && trimVideoPreview) {
        // Init background
        updateVolumeSliderBackground();

        trimVolumeSlider.addEventListener('input', () => {
            trimVideoPreview.volume = parseFloat(trimVolumeSlider.value);
            if (trimVideoPreview.volume > 0 && trimVideoPreview.muted) {
                trimVideoPreview.muted = false;
                updateMuteIcon();
            }
            updateVolumeSliderBackground();
        });
    }

    function updateMuteIcon() {
        if (!volumeIcon || !mutedIcon || !trimVideoPreview) return;
        const isMuted = trimVideoPreview.muted || trimVideoPreview.volume === 0;
        volumeIcon.classList.toggle('hidden', isMuted);
        mutedIcon.classList.toggle('hidden', !isMuted);
    }

    // Mute button
    if (trimMuteBtn && trimVideoPreview) {
        trimMuteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            trimVideoPreview.muted = !trimVideoPreview.muted;
            updateMuteIcon();
        });
    }

    async function handleFolderSelection(folderPath) {
        console.log('Folder selected:', folderPath);
        try {
            const files = await electron.listFiles(folderPath);
            if (files.length === 0) {
                alert('No video files found in the selected folder.');
                return;
            }

            const confirmAdd = confirm(`Found ${files.length} video files. Add them to queue with current settings?`);
            if (!confirmAdd) return;

            files.forEach(file => {
                const rateMode = document.querySelector('input[name="rate-mode"]:checked')?.value || 'crf';
                const options = {
                    input: file,
                    format: appSettings.defaultFormat,
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
                    audioTracks: [],
                    subtitleTracks: [],
                    chaptersFile: null,
                    outputSuffix: appSettings.outputSuffix,
                    outputFolder: outputFolderInput ? outputFolderInput.value : '',
                    customArgs: customFfmpegArgs ? customFfmpegArgs.value : ''
                };
                addToQueue(options);
            });

            showView(queueView);
            resetNav();
            navQueue.classList.add('active');
        } catch (err) {
            console.error('Error handling folder:', err);
        }
    }

    async function handleFileSelection(filePath) {
        currentFilePath = filePath;
        currentEditingQueueId = null;
        audioTracks = [];
        subtitleTracks = [];
        chaptersFile = null;
        currentPresetUsed = null;
        isCurrentSettingsModified = false;
        renderAudioTracks();
        renderSubtitleTracks();
        if (chaptersInfo) chaptersInfo.classList.add('hidden');
        if (chapterImportZone) chapterImportZone.classList.remove('hidden');

        if (addQueueBtn) addQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Add to Queue
        `;

        const name = filePath.split(/[\\/]/).pop();
        const ext = name.split('.').pop().toUpperCase();

        if (filenameEl) filenameEl.textContent = name;
        if (fileIcon) fileIcon.textContent = ext;

        showView(dashboard);


        try {
            const metadata = await electron.getMetadata(filePath);
            if (resolutionEl) resolutionEl.textContent = metadata.resolution;
            if (durationEl) durationEl.textContent = metadata.duration;
            if (bitrateEl) bitrateEl.textContent = metadata.bitrate;


            audioTracks = [{ isSource: true, name: 'Source Audio' }];
            renderAudioTracks();


            if (formatSelect && !currentEditingQueueId) {
                formatSelect.value = appSettings.defaultFormat;
            }

            updatePresetStatus();
        } catch (err) {
            console.warn('Could not read metadata:', err);
        }
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (currentEditingQueueId) {
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
                currentEditingQueueId = null;
            } else {
                showView(dropZone);
            }
        });
    }
    if (settingsBackBtn) settingsBackBtn.addEventListener('click', () => {
        resetNav();
        navVideo.classList.add('active');
        showView(dropZone);
    });

    if (crfSlider) {
        crfSlider.addEventListener('input', () => {
            if (crfValue) crfValue.textContent = crfSlider.value;
            updatePresetStatus();
        });
    }

    // Track preset status when key settings change
    const settingElements = [formatSelect, codecSelect, presetSelect, resolutionSelect, audioSelect, audioBitrateSelect, fpsSelect, vBitrateInput, twoPassCheckbox];
    settingElements.forEach(el => {
        if (el) {
            el.addEventListener('change', updatePresetStatus);
        }
    });

    const rateRadios = document.querySelectorAll('input[name="rate-mode"]');
    rateRadios.forEach(radio => {
        radio.addEventListener('change', updatePresetStatus);
    });

    function getOptionsFromUI() {
        const rateMode = document.querySelector('input[name="rate-mode"]:checked')?.value || 'crf';
        return {
            input: currentFilePath,
            format: formatSelect ? formatSelect.value : appSettings.defaultFormat,
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
            audioTracks: [...audioTracks],
            subtitleTracks: [...subtitleTracks],
            chaptersFile: chaptersFile,
            outputSuffix: appSettings.outputSuffix,
            outputFolder: outputFolderInput ? outputFolderInput.value : '',
            customArgs: customFfmpegArgs ? customFfmpegArgs.value : '',
            workPriority: appSettings.workPriority || 'normal'
        };
    }

    if (convertBtn) {
        convertBtn.addEventListener('click', () => {
            if (!currentFilePath) return;
            isExtracting = false;
            isTrimming = false;
            if (progressTitle) progressTitle.textContent = 'Encoding in Progress';
            if (completeTitle) completeTitle.textContent = 'Encoding Complete!';
            const options = getOptionsFromUI();

            if (progressFilename) progressFilename.textContent = currentFilePath.split(/[\\/]/).pop();
            resetProgress();
            showView(progressView);
            isEncoding = true;
            isCancelled = false;
            toggleSidebar(true);
            electron.startEncode(options);
        });
    }

    function getEffectiveCodec() {
        const baseCodec = codecSelect ? codecSelect.value : 'h264';
        if (baseCodec === 'copy') return 'copy';

        let accel = appSettings.hwAccel;
        if (accel === 'auto') {
            accel = getAutoEncoder();
        }

        if (accel !== 'none') {
            if (baseCodec === 'h264') return `h264_${accel}`;
            if (baseCodec === 'h265') return `hevc_${accel}`;
        }
        return baseCodec;
    }

    if (addQueueBtn) {
        addQueueBtn.addEventListener('click', () => {
            if (!currentFilePath) return;

            const options = getOptionsFromUI();


            if (currentEditingQueueId) {
                updateQueueItem(currentEditingQueueId, options);
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
            } else {
                addToQueue(options);
                showView(dropZone);
                resetNav();
                navVideo.classList.add('active');
            }
        });
    }

    function updateQueueItem(id, options) {
        const index = encodingQueue.findIndex(item => item.id === id);
        if (index !== -1) {
            encodingQueue[index].options = options;
            encodingQueue[index].name = options.input.split(/[\\/]/).pop();
            encodingQueue[index].presetUsed = currentPresetUsed;
            encodingQueue[index].isModified = isCurrentSettingsModified;

            if (encodingQueue[index].status === 'completed' || encodingQueue[index].status === 'error') {
                encodingQueue[index].status = 'pending';
                encodingQueue[index].progress = 0;
            }
            updateQueueUI();
        }
        currentEditingQueueId = null;
    }

    async function loadQueueItemToDashboard(id) {
        const item = encodingQueue.find(i => i.id === id);
        if (!item) return;

        currentEditingQueueId = id;
        currentFilePath = item.options.input;


        const name = item.options.input.split(/[\\/]/).pop();
        const ext = name.split('.').pop().toUpperCase();

        if (filenameEl) filenameEl.textContent = name;
        if (fileIcon) fileIcon.textContent = ext;


        if (formatSelect) formatSelect.value = item.options.format;

        let baseCodec = item.options.codec;
        if (baseCodec.includes('_')) {
            baseCodec = baseCodec.split('_')[0];
            if (baseCodec === 'hevc') baseCodec = 'h265';
        }
        if (codecSelect) codecSelect.value = baseCodec;
        if (presetSelect) presetSelect.value = item.options.preset;
        if (resolutionSelect) resolutionSelect.value = item.options.resolution || 'source';
        if (audioSelect) audioSelect.value = item.options.audioCodec;
        if (crfSlider) {
            crfSlider.value = item.options.crf;
            if (crfValue) crfValue.textContent = item.options.crf;
        }
        if (audioBitrateSelect) audioBitrateSelect.value = item.options.audioBitrate;


        audioTracks = item.options.audioTracks ? [...item.options.audioTracks] : [];
        subtitleTracks = item.options.subtitleTracks ? [...item.options.subtitleTracks] : [];
        chaptersFile = item.options.chaptersFile || null;

        renderAudioTracks();
        renderSubtitleTracks();

        if (chaptersFile) {
            if (chaptersFilename) chaptersFilename.textContent = chaptersFile.split(/[\\/]/).pop();
            if (chaptersInfo) chaptersInfo.classList.remove('hidden');
            if (chapterImportZone) chapterImportZone.classList.add('hidden');
        } else {
            if (chaptersInfo) chaptersInfo.classList.add('hidden');
            if (chapterImportZone) chapterImportZone.classList.remove('hidden');
        }

        if (addQueueBtn) addQueueBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Update Item
        `;

        showView(dashboard);

        updatePresetStatus();


        try {
            const metadata = await electron.getMetadata(item.options.input);
            if (resolutionEl) resolutionEl.textContent = metadata.resolution;
            if (durationEl) durationEl.textContent = metadata.duration;
            if (bitrateEl) bitrateEl.textContent = metadata.bitrate;
        } catch (err) {
            console.warn('Could not read metadata:', err);
        }
    }

    if (queueAddBtn) {
        queueAddBtn.addEventListener('click', async () => {
            try {
                const filePath = await electron.selectFile();
                if (filePath) {
                    const options = getOptionsFromUI();
                    options.input = filePath;
                    addToQueue(options);
                }
            } catch (err) {
                console.error('Error adding to queue:', err);
            }
        });
    }


    const BUILT_IN_PRESETS = {
        'fast-480p': { format: 'mp4', codec: 'h264', preset: 'veryfast', crf: 28, resolution: '480p', audioCodec: 'aac', audioBitrate: '96k', fps: 'source', twoPass: false },
        'fast-720p': { format: 'mp4', codec: 'h264', preset: 'veryfast', crf: 24, resolution: '720p', audioCodec: 'aac', audioBitrate: '128k', fps: 'source', twoPass: false },
        'fast-1080p': { format: 'mp4', codec: 'h264', preset: 'veryfast', crf: 23, resolution: '1080p', audioCodec: 'aac', audioBitrate: '128k', fps: 'source', twoPass: false },
        'hq-720p': { format: 'mp4', codec: 'h264', preset: 'slow', crf: 20, resolution: '720p', audioCodec: 'aac', audioBitrate: '192k', fps: 'source', twoPass: false },
        'hq-1080p': { format: 'mp4', codec: 'h264', preset: 'slow', crf: 18, resolution: '1080p', audioCodec: 'aac', audioBitrate: '192k', fps: 'source', twoPass: false },
        'super-hq-1080p': { format: 'mp4', codec: 'h264', preset: 'slower', crf: 16, resolution: '1080p', audioCodec: 'aac', audioBitrate: '256k', fps: 'source', twoPass: false },
        'anime': { format: 'mp4', codec: 'h264', preset: 'medium', crf: 20, resolution: 'source', audioCodec: 'aac', audioBitrate: '128k', fps: 'source', twoPass: false },
        'film': { format: 'mp4', codec: 'h264', preset: 'slow', crf: 19, resolution: 'source', audioCodec: 'aac', audioBitrate: '192k', fps: 'source', twoPass: false },
        'iphone': { format: 'mp4', codec: 'h264', preset: 'medium', crf: 22, resolution: '720p', audioCodec: 'aac', audioBitrate: '128k', fps: 'source', twoPass: false },
        'ipad': { format: 'mp4', codec: 'h264', preset: 'medium', crf: 21, resolution: '1080p', audioCodec: 'aac', audioBitrate: '128k', fps: 'source', twoPass: false },
        'android': { format: 'mp4', codec: 'h264', preset: 'medium', crf: 22, resolution: '1080p', audioCodec: 'aac', audioBitrate: '128k', fps: 'source', twoPass: false },
        'streaming': { format: 'mp4', codec: 'h264', preset: 'medium', crf: 25, resolution: '720p', audioCodec: 'aac', audioBitrate: '128k', fps: 'source', twoPass: false },
        'archive': { format: 'mkv', codec: 'h265', preset: 'slower', crf: 15, resolution: 'source', audioCodec: 'opus', audioBitrate: '192k', fps: 'source', twoPass: false },
        'discord': { format: 'mp4', codec: 'h264', preset: 'medium', crf: 28, resolution: '720p', audioCodec: 'aac', audioBitrate: '96k', fps: 'source', twoPass: false },
        'hevc-mkv': { format: 'mkv', codec: 'h265', preset: 'medium', crf: 24, resolution: 'source', audioCodec: 'opus', audioBitrate: '128k', fps: 'source', twoPass: false }
    };

    let customPresets = {};
    let isCreatingPreset = false;


    function loadCustomPresets() {
        const saved = localStorage.getItem('custom_presets');
        if (saved) {
            try { customPresets = JSON.parse(saved); } catch (e) { console.error('Error loading custom presets', e); }
        }
        renderPresetMenu();
    }


    function saveCustomPreset(name, settings) {
        customPresets[name] = settings;
        localStorage.setItem('custom_presets', JSON.stringify(customPresets));


        if (currentPresetName) currentPresetName.textContent = name;
        applyPreset(settings, name);


        isCreatingPreset = false;
        renderPresetMenu();
    }


    function deleteCustomPreset(name) {



        delete customPresets[name];
        localStorage.setItem('custom_presets', JSON.stringify(customPresets));


        isCreatingPreset = false;
        renderPresetMenu();


        if (presetDropdown) presetDropdown.classList.remove('hidden');
        setTimeout(() => {
            const input = document.getElementById('new-preset-input');
            if (input) {
                try { input.focus(); input.select(); } catch (e) { /* ignore */ }
            }
        }, 0);
    }


    function getPresetSettingsFromUI() {
        return {
            format: formatSelect ? formatSelect.value : 'mp4',
            codec: codecSelect ? codecSelect.value : 'h264',
            preset: presetSelect ? presetSelect.value : 'medium',
            resolution: resolutionSelect ? resolutionSelect.value : 'source',
            crf: crfSlider ? parseInt(crfSlider.value) : 23,
            audioCodec: audioSelect ? audioSelect.value : 'aac',
            audioBitrate: audioBitrateSelect ? audioBitrateSelect.value : '192k',
            fps: fpsSelect ? fpsSelect.value : 'source',
            twoPass: twoPassCheckbox ? twoPassCheckbox.checked : false
        };
    }


    function renderPresetMenu() {
        if (!customPresetsList) return;


        const keys = Object.keys(customPresets);


        const formHtml = isCreatingPreset ? `
            <div id="new-preset-form" class="new-preset-form">
                <div class="new-preset-input-wrap">
                    <input id="new-preset-input" type="text" placeholder="Preset name" autocomplete="off" />
                    <button id="new-preset-save" class="preset-action-btn" title="Save">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="preset-divider"></div>
        ` : '';


        let listHtml = '';
        if (keys.length === 0) {
            listHtml = '<div class="preset-empty">No custom presets</div>';
        } else {
            listHtml = keys.map(name => `
                <div class="preset-item" data-custom-preset="${name}">
                    <span class="preset-name">${name}</span>
                    <button class="preset-remove" type="button" data-delete-preset="${name}">×</button>
                </div>
            `).join('');
        }


        customPresetsList.innerHTML = formHtml + listHtml;




        if (isCreatingPreset) {
            const inputEl = document.getElementById('new-preset-input');
            const saveBtnEl = document.getElementById('new-preset-save');

            if (inputEl) {

                inputEl.onclick = (e) => e.stopPropagation();
                inputEl.onmousedown = (e) => e.stopPropagation();

                inputEl.onkeydown = (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && saveBtnEl) saveBtnEl.click();
                    if (e.key === 'Escape') hideNewPresetForm();
                };


                setTimeout(() => {
                    try { inputEl.focus(); inputEl.select(); } catch (err) { /* ignore */ }
                }, 0);
            }

            if (saveBtnEl) {

                saveBtnEl.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    const name = (inputEl && inputEl.value) ? inputEl.value.trim() : '';
                    if (!name) return alert('Please enter a name');
                    if (customPresets[name] && !confirm('Overwrite existing preset?')) return;

                    try {
                        const settings = getPresetSettingsFromUI();
                        saveCustomPreset(name, settings);
                    } catch (err) {
                        console.error(err);
                        alert('Error saving preset');
                    }
                };
            }
        }


        const deleteBtns = customPresetsList.querySelectorAll('.preset-remove');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const name = btn.dataset.deletePreset;
                deleteCustomPreset(name);
            });
        });


        const items = customPresetsList.querySelectorAll('.preset-item');
        items.forEach(item => {
            item.addEventListener('click', (e) => {

                if (e.target.closest('.preset-remove')) return;

                const name = item.dataset.customPreset;
                if (customPresets[name]) {
                    applyPreset(customPresets[name], name);
                    if (presetDropdown) presetDropdown.classList.add('hidden');
                }
            });
        });
    }


    function showNewPresetForm() {
        isCreatingPreset = true;
        renderPresetMenu();
    }

    function hideNewPresetForm() {
        isCreatingPreset = false;
        renderPresetMenu();
    }




    if (presetMenuBtn) {
        presetMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            presetDropdown.classList.toggle('hidden');

        });
    }


    document.addEventListener('click', (e) => {
        if (!presetDropdown || presetDropdown.classList.contains('hidden')) return;


        if (presetDropdown.contains(e.target) || (presetMenuBtn && presetMenuBtn.contains(e.target))) {
            return;
        }


        presetDropdown.classList.add('hidden');
        if (isCreatingPreset) hideNewPresetForm();
    });


    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showNewPresetForm();
        });
    }

    function checkIfSettingsMatchPreset(presetSettings) {
        const current = getPresetSettingsFromUI();
        return JSON.stringify(current) === JSON.stringify(presetSettings);
    }

    function updatePresetStatus() {
        // Check if current settings match the originally applied preset
        if (currentPresetUsed && currentPresetOriginalSettings) {
            // Compare current settings with original preset settings
            const currentSettings = getPresetSettingsFromUI();
            isCurrentSettingsModified = JSON.stringify(currentSettings) !== JSON.stringify(currentPresetOriginalSettings);
        } else {
            // No preset is currently applied, so check if settings match any preset
            let matchedPreset = null;
            let isModified = false;
            let matchedSettings = null;

            // Check built-in presets
            for (const [name, settings] of Object.entries(BUILT_IN_PRESETS)) {
                if (checkIfSettingsMatchPreset(settings)) {
                    matchedPreset = name;
                    isModified = false;
                    matchedSettings = settings;
                    break;
                }
            }

            // Check custom presets if no match found
            if (!matchedPreset) {
                for (const [name, settings] of Object.entries(customPresets)) {
                    if (checkIfSettingsMatchPreset(settings)) {
                        matchedPreset = name;
                        isModified = false;
                        matchedSettings = settings;
                        break;
                    }
                }
            }

            // If no preset matched, mark as modified
            if (!matchedPreset) {
                isModified = true;
            }

            currentPresetUsed = matchedPreset;
            currentPresetOriginalSettings = matchedSettings;
            isCurrentSettingsModified = isModified;
        }
    }


    function applyPreset(settings, name) {
        console.log(`Applying preset: ${name}`, settings);

        if (formatSelect) formatSelect.value = settings.format;
        if (codecSelect) codecSelect.value = settings.codec;
        if (presetSelect) presetSelect.value = settings.preset;
        if (resolutionSelect && settings.resolution) resolutionSelect.value = settings.resolution;
        if (fpsSelect && settings.fps) fpsSelect.value = settings.fps;


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

        if (vBitrateInput && settings.bitrate) vBitrateInput.value = settings.bitrate;
        if (twoPassCheckbox) twoPassCheckbox.checked = settings.twoPass || false;

        if (audioSelect) audioSelect.value = settings.audioCodec;
        if (audioBitrateSelect) audioBitrateSelect.value = settings.audioBitrate;

        if (currentPresetName) currentPresetName.textContent = name;

        // Store the original preset settings for tracking modifications
        currentPresetUsed = name;
        currentPresetOriginalSettings = { ...settings };
        isCurrentSettingsModified = false;

        updatePresetStatus();
    }


    if (presetDropdown) {
        const builtIns = presetDropdown.querySelectorAll('.preset-item[data-preset]');
        builtIns.forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.preset;
                if (BUILT_IN_PRESETS[id]) {
                    applyPreset(BUILT_IN_PRESETS[id], item.textContent);
                    presetDropdown.classList.add('hidden');
                }
            });
        });
    }

    loadCustomPresets();

    function addToQueue(options, taskType = 'encode') {
        const id = Date.now();
        const name = options.input ? options.input.split(/[\\/]/).pop() : 'Unknown';
        encodingQueue.push({
            id,
            options,
            taskType,
            status: 'pending',
            progress: 0,
            name,
            presetUsed: taskType === 'encode' ? currentPresetUsed : null,
            isModified: taskType === 'encode' ? isCurrentSettingsModified : false
        });
        updateQueueUI();
    }

    function updateQueueUI() {
        if (queueBadge) {
            const pendingCount = encodingQueue.filter(item => item.status !== 'completed').length;
            queueBadge.textContent = pendingCount;
            queueBadge.classList.toggle('hidden', pendingCount === 0);
        }
        renderQueue();
    }

    function renderQueue(isProgressUpdate = false) {
        if (!queueList) return;

        if (encodingQueue.length === 0) {
            queueList.innerHTML = '<div class="empty-queue-msg">Queue is empty</div>';
            return;
        }

        if (isProgressUpdate && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                const itemEl = queueList.querySelector(`[data-id="${item.id}"]`);
                if (itemEl) {
                    const statusEl = itemEl.querySelector('.queue-item-status');
                    const progressEl = itemEl.querySelector('.queue-progress-bar');
                    if (statusEl) statusEl.textContent = `Encoding... ${item.progress}%`;
                    if (progressEl) progressEl.style.width = `${item.progress}%`;
                    itemEl.classList.add('active');
                    return;
                }
            }
        }

        function formatPresetName(name) {
            // Special cases and formatting for preset names
            const specialCases = {
                'hq': 'HQ',
                'super-hq': 'Super HQ',
                'iphone': 'iPhone',
                'ipad': 'iPad',
                'hevc': 'HEVC'
            };

            let formatted = name;
            // Check for special cases first
            for (const [key, value] of Object.entries(specialCases)) {
                if (formatted.startsWith(key)) {
                    formatted = formatted.replace(key, value);
                }
            }

            // Capitalize remaining words separated by hyphens
            formatted = formatted.split('-').map(word => {
                // Skip if already formatted (all caps or special case)
                if (word === word.toUpperCase() && word.length > 1) return word;
                return word.charAt(0).toUpperCase() + word.slice(1);
            }).join(' ');

            return formatted;
        }

        function getTaskLabel(item) {
            if (item.taskType === 'trim') return 'Trim';
            if (item.taskType === 'extract') return 'Extract audio';
            return 'Encode';
        }

        queueList.innerHTML = encodingQueue.map((item) => {
            let statusText = item.status;
            if (item.status === 'pending' || item.status === 'failed') {
                const taskLabel = getTaskLabel(item);
                if (item.taskType === 'encode') {
                    let presetInfo = '';
                    if (item.presetUsed) {
                        if (item.isModified) presetInfo = 'Custom';
                        else presetInfo = formatPresetName(item.presetUsed);
                    } else if (item.isModified) presetInfo = 'Custom';
                    else presetInfo = 'Default';
                    statusText = `${item.status} · ${taskLabel} · ${presetInfo}`;
                } else {
                    statusText = `${item.status} · ${taskLabel}`;
                }
            }
            const encodingStatus = item.status === 'encoding'
                ? (item.taskType === 'trim' ? `Trimming... ${item.progress}%` : item.taskType === 'extract' ? `Extracting... ${item.progress}%` : `Encoding... ${item.progress}%`)
                : null;

            return `
            <div class="queue-item ${item.id === currentlyEncodingItemId ? 'active' : ''} ${item.status === 'completed' ? 'completed' : ''}" 
                 data-id="${item.id}" 
                 data-task-type="${item.taskType || 'encode'}"
                 onclick="window.loadQueueItem(${item.id})">
                <div class="queue-item-info">
                    <div class="queue-item-name">${item.name}</div>
                    <div class="queue-item-status">${encodingStatus !== null ? encodingStatus : statusText}</div>
                </div>
                ${item.status === 'encoding' || item.status === 'completed' ? `
                <div class="queue-item-progress">
                    <div class="queue-progress-bar" style="width: ${item.progress}%"></div>
                </div>
                ` : ''}
                <button class="queue-item-remove" onclick="event.stopPropagation(); window.removeQueueItem(${item.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            `;
        }).join('');
    }

    window.loadQueueItem = (id) => {
        if (isQueueRunning) {
            alert('Cannot edit queue items while the queue is running.');
            return;
        }
        const item = encodingQueue.find(i => i.id === id);
        if (item && item.status === 'completed') {
            return;
        }
        if (item && (item.taskType === 'trim' || item.taskType === 'extract')) {
            return;
        }
        loadQueueItemToDashboard(id);
    };

    window.removeQueueItem = (id) => {
        const index = encodingQueue.findIndex(item => item.id === id);
        if (index !== -1) {
            if (id === currentlyEncodingItemId) {
                electron.cancelEncode();
                currentlyEncodingItemId = null;
                // Reset status and progress for the cancelled running task
                const item = encodingQueue[index];
                if (item) {
                    item.status = 'pending';
                    item.progress = 0;
                }
                toggleSidebar(false); // Enable sidebar after cancelling a running task
            } else {
                // If the task is not running, just remove it from the queue
                encodingQueue.splice(index, 1);
            }
            updateQueueUI();
            if (encodingQueue.length === 0) {
                isQueueRunning = false;
                updateQueueStatusUI();
                toggleSidebar(false);
            }
        }
    };

    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', () => {
            if (encodingQueue.length === 0) return;

            const confirmClear = confirm('Are you sure you want to clear all items from the queue?');
            if (!confirmClear) return;

            if (isQueueRunning) electron.cancelEncode();
            encodingQueue = [];
            currentlyEncodingItemId = null;
            isQueueRunning = false;
            updateQueueUI();
            updateQueueStatusUI();
            toggleSidebar(false);
        });
    }
    if (startQueueBtn) {
        startQueueBtn.addEventListener('click', () => {
            if (encodingQueue.length === 0) return;

            if (isQueueRunning) {

                isQueueRunning = false;

                if (currentlyEncodingItemId !== null) {
                    const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
                    if (item && item.status === 'encoding') {
                        item.status = 'pending';
                        item.progress = 0;
                    }
                    electron.cancelEncode();
                    currentlyEncodingItemId = null;
                    toggleSidebar(false);
                }
                updateQueueStatusUI();
                updateQueueUI();
            } else {

                isQueueRunning = true;
                updateQueueStatusUI();
                processQueue();
            }
        });
    }

    function updateQueueStatusUI() {
        if (!startQueueBtn) return;
        if (isQueueRunning) {
            startQueueIcon.classList.add('hidden');
            pauseQueueIcon.classList.remove('hidden');
            pauseQueueIcon2.classList.remove('hidden');
            startQueueText.textContent = 'Pause Queue';
        } else {
            startQueueIcon.classList.remove('hidden');
            pauseQueueIcon.classList.add('hidden');
            pauseQueueIcon2.classList.add('hidden');
            const hasStarted = encodingQueue.some(item => item.status === 'completed');
            startQueueText.textContent = hasStarted ? 'Resume Queue' : 'Start Queue';
        }
    }

    function processQueue() {
        if (!isQueueRunning) return;


        const nextItem = encodingQueue.find(item => item.status === 'pending');

        if (!nextItem) {
            isQueueRunning = false;
            currentlyEncodingItemId = null;

            if (encodingQueue.some(i => i.status === 'completed')) {
                alert('Queue processing complete!');
            }
            updateQueueUI();
            updateQueueStatusUI();
            toggleSidebar(false);
            return;
        }

        nextItem.status = 'encoding';
        currentlyEncodingItemId = nextItem.id;
        isEncoding = true;
        isCancelled = false;
        toggleSidebar(true);
        updateQueueUI();
        updateQueueStatusUI();

        if (nextItem.taskType === 'trim') {
            if (progressTitle) progressTitle.textContent = 'Trimming video...';
            if (progressFilename) progressFilename.textContent = nextItem.name;
            resetProgress();
            electron.trimVideo(nextItem.options);
        } else if (nextItem.taskType === 'extract') {
            if (progressTitle) progressTitle.textContent = 'Extracting audio...';
            if (progressFilename) progressFilename.textContent = nextItem.name;
            resetProgress();
            electron.extractAudio(nextItem.options);
        } else {
            if (progressTitle) progressTitle.textContent = 'Encoding in Progress';
            if (progressFilename) progressFilename.textContent = nextItem.name;
            resetProgress();
            electron.startEncode(nextItem.options);
        }
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            const wasQueueRunning = isQueueRunning;
            isCancelled = true;
            electron.cancelEncode();
            isEncoding = false;
            isQueueRunning = false;


            if (wasQueueRunning && currentlyEncodingItemId !== null) {
                const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
                if (item) {
                    item.status = 'pending';
                    item.progress = 0;
                }
            }

            currentlyEncodingItemId = null;
            toggleSidebar(false);

            if (encodingQueue.length > 0) {
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
                updateQueueStatusUI();
                updateQueueUI();
            } else {
                showView(dashboard);
            }
        });
    }


    electron.onProgress((data) => {
        if (isQueueRunning && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                item.progress = data.percent;
                renderQueue(true);
            }
        } else {
            if (progressPercent) progressPercent.textContent = `${data.percent}%`;
            if (progressRing) {
                const offset = 502 - (data.percent / 100) * 502;
                progressRing.style.strokeDashoffset = offset;
            }
            if (timeElapsed) timeElapsed.textContent = data.time;
            if (timePosition) timePosition.textContent = data.time;
            if (encodeSpeed) encodeSpeed.textContent = data.speed;
        }
    });

    electron.onComplete((data) => {
        isEncoding = false;
        const wasExtracting = isExtracting;
        const wasTrimming = isTrimming;
        isExtracting = false;
        isTrimming = false;
        if (completeTitle) {
            if (wasExtracting) completeTitle.textContent = 'Extraction Complete!';
            else if (wasTrimming) completeTitle.textContent = 'Trim Complete!';
            else completeTitle.textContent = 'Encoding Complete!';
        }
        if (appSettings.notifyOnComplete) {
            const action = wasExtracting ? 'Extraction' : (wasTrimming ? 'Trim' : 'Encoding');
            new Notification(action + ' Complete', {
                body: `File saved to: ${data.outputPath}`
            });
        }

        if (isQueueRunning && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                item.status = 'completed';
                item.progress = 100;
            }
            updateQueueUI();
            setTimeout(processQueue, 500);
        } else {
            if (outputPathEl) outputPathEl.textContent = data.outputPath;
            currentOutputPath = data.outputPath;
            showView(completeView);
            toggleSidebar(false);
        }
    });

    electron.onError((data) => {
        isEncoding = false;
        isExtracting = false;
        isTrimming = false;
        if (progressTitle) progressTitle.textContent = 'Encoding in Progress';
        alert(`Error: ${data.message}`);
        if (isQueueRunning && currentlyEncodingItemId !== null) {
            const item = encodingQueue.find(i => i.id === currentlyEncodingItemId);
            if (item) {
                item.status = 'error';
            }
            updateQueueUI();
            isQueueRunning = false;
            updateQueueStatusUI();
            toggleSidebar(false);
        } else {
            if (encodingQueue.length > 0) {
                showView(queueView);
                resetNav();
                navQueue.classList.add('active');
                updateQueueStatusUI();
                updateQueueUI();
            } else {
                showView(dashboard);
            }
            toggleSidebar(false);
        }
    });


    if (openFileBtn) openFileBtn.addEventListener('click', () => electron.openFile(currentOutputPath));
    if (openFolderBtn) openFolderBtn.addEventListener('click', () => electron.openFolder(currentOutputPath));
    if (newEncodeBtn) newEncodeBtn.addEventListener('click', () => {
        if (lastActiveViewId === 'trimDropZone') {
            showView(trimDropZone);
            resetNav();
            navTrim.classList.add('active');
        } else if (lastActiveViewId === 'extractAudioDropZone') {
            showView(extractAudioDropZone);
            resetNav();
            navExtractAudio.classList.add('active');
        } else {
            showView(dropZone);
        }
    });

    // Global listener to blur selects on change to prevent sticky focus state
    document.addEventListener('change', (e) => {
        if (e.target.tagName === 'SELECT') {
            e.target.blur();
        }
    });
});


function renderPresets(groups) {
    const container = document.getElementById('preset-dropdown');
    container.innerHTML = groups.map((group, index) => {
        // Only add the 'open' attribute if it's one of the first two groups
        const isOpen = index < 2 ? 'open' : '';

        return `
            <details class="preset-group" ${isOpen}>
                <summary>${group.name}</summary>
                <div class="preset-items">
                    ${group.presets.map(p => `<div class="preset-item">${p.name}</div>`).join('')}
                </div>
            </details>
        `;
    }).join('');
}