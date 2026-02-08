// UI Utility Functions

export const get = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element with ID "${id}" not found`);
    return el;
};

const loaderTemplates = {
    bars: (size) => `
        <span class="loader-bars" style="--uib-size:${size}px">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
        </span>
    `
};

export const getLoaderHTML = (size = 40, variant = 'bars') => {
    const template = loaderTemplates[variant] || loaderTemplates.bars;
    return template(size);
};

export const renderLoaders = (options = {}) => {
    const selector = options.selector || '[data-loader]';
    const defaultVariant = options.variant || document.body?.dataset?.loader || 'bars';
    const defaultSize = Number.isFinite(options.size) ? options.size : 40;

    document.querySelectorAll(selector).forEach((el) => {
        const variant = el.dataset.loader || defaultVariant;
        const sizeAttr = parseInt(el.dataset.loaderSize || '', 10);
        const size = Number.isFinite(sizeAttr) ? sizeAttr : defaultSize;
        el.innerHTML = getLoaderHTML(size, variant);
        el.dataset.loaderActive = variant;
    });
};

export const setLoaderVariant = (variant, options = {}) => {
    if (variant) document.body.dataset.loader = variant;
    renderLoaders({ ...options, variant });
};

export function showPopup(message) {
    const popupOverlay = get('popup-overlay');
    const popupMessage = get('popup-message');
    const popupButtons = get('popup-actions');

    return new Promise((resolve) => {
        popupMessage.textContent = message;
        popupButtons.innerHTML = '<button id="popup-ok-btn" class="primary-btn popup-btn">OK</button>';
        popupOverlay.classList.remove('hidden', 'closing');
        const okBtn = get('popup-ok-btn');
        okBtn.onclick = () => {
            popupOverlay.classList.add('hidden');
            resolve();
        };
        okBtn.focus();
    });
}

export function showConfirm(message) {
    const popupOverlay = get('popup-overlay');
    const popupMessage = get('popup-message');
    const popupButtons = get('popup-actions');

    return new Promise((resolve) => {
        popupMessage.textContent = message;
        popupButtons.innerHTML = `
            <button id="popup-cancel-btn" class="secondary-btn popup-btn">Cancel</button>
            <button id="popup-confirm-btn" class="primary-btn popup-btn">Confirm</button>
        `;
        popupOverlay.classList.remove('hidden', 'closing');
        const confirmBtn = get('popup-confirm-btn');
        const cancelBtn = get('popup-cancel-btn');
        const closeWithResult = (result) => {
            popupOverlay.classList.add('hidden');
            resolve(result);
        };
        confirmBtn.onclick = () => closeWithResult(true);
        cancelBtn.onclick = () => closeWithResult(false);
        confirmBtn.focus();
    });
}

export function showPlaylistConfirm(title, count) {
    const popupOverlay = get('popup-overlay');
    const popupMessage = get('popup-message');
    const popupButtons = get('popup-actions');

    return new Promise((resolve) => {
        popupMessage.innerHTML = `Found Playlist: <strong>${title}</strong><br>(${count} videos)<br><br>How would you like to download?`;
        popupButtons.innerHTML = `
            <button id="popup-cancel-btn" class="secondary-btn popup-btn" style="flex: 0.5;">Cancel</button>
            <button id="popup-audio-btn" class="primary-btn popup-btn">Audio</button>
            <button id="popup-video-btn" class="primary-btn popup-btn">Video</button>
        `;
        popupOverlay.classList.remove('hidden', 'closing');

        const videoBtn = get('popup-video-btn');
        const audioBtn = get('popup-audio-btn');
        const cancelBtn = get('popup-cancel-btn');

        const closeWithResult = (result) => {
            popupOverlay.classList.add('hidden');
            resolve(result);
        };

        videoBtn.onclick = () => closeWithResult('video');
        audioBtn.onclick = () => closeWithResult('audio');
        cancelBtn.onclick = () => closeWithResult(false);

        videoBtn.focus();
    });
}

export function setupCustomSelects() {
    if (!setupCustomSelects._outsideClickBound) {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.dropdown-container')) return;
            document.querySelectorAll('.dropdown-container.open').forEach(openContainer => {
                openContainer.classList.remove('open');
            });
        });
        setupCustomSelects._outsideClickBound = true;
    }

    const selects = document.querySelectorAll('select:not(.replaced)');
    selects.forEach(select => {
        const container = document.createElement('div');
        container.className = 'dropdown-container custom-select full-width';
        if (select.id) container.dataset.for = select.id;

        select.parentNode.insertBefore(container, select);
        container.appendChild(select);
        select.classList.add('replaced');

        const trigger = document.createElement('div');
        trigger.className = 'dropdown-trigger';
        trigger.tabIndex = 0;

        const triggerText = document.createElement('span');
        triggerText.className = 'dropdown-trigger-text';

        const triggerTextCurrent = document.createElement('span');
        triggerTextCurrent.className = 'dropdown-text-value current';
        triggerTextCurrent.textContent = select.options[select.selectedIndex]?.textContent || 'Select...';

        const triggerTextNext = document.createElement('span');
        triggerTextNext.className = 'dropdown-text-value next';

        triggerText.appendChild(triggerTextCurrent);
        triggerText.appendChild(triggerTextNext);

        const triggerIcon = document.createElement('div');
        triggerIcon.className = 'dropdown-trigger-icon';
        triggerIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        trigger.appendChild(triggerText);
        trigger.appendChild(triggerIcon);
        container.appendChild(trigger);

        const menu = document.createElement('div');
        menu.className = 'dropdown-menu';
        container.appendChild(menu);

        let lastSelectedIndex = select.selectedIndex;

        const resetTriggerText = (text, index) => {
            triggerText.classList.remove('animate-up', 'animate-down');
            triggerTextCurrent.textContent = text;
            triggerTextNext.textContent = '';
            lastSelectedIndex = index;
        };

        const extractLabelNumber = (text) => {
            if (!text) return null;
            const match = text.match(/-?\d+(?:\.\d+)?/);
            if (!match) return null;
            const value = Number.parseFloat(match[0]);
            return Number.isNaN(value) ? null : value;
        };

        const animateTriggerText = (text, index) => {
            const prevText = triggerTextCurrent.textContent || '';
            if (prevText === text) {
                resetTriggerText(text, index);
                return;
            }

            const prevNumber = extractLabelNumber(prevText);
            const nextNumber = extractLabelNumber(text);
            let directionClass = index > lastSelectedIndex ? 'animate-down' : 'animate-up';
            if (prevNumber !== null && nextNumber !== null) {
                directionClass = nextNumber >= prevNumber ? 'animate-down' : 'animate-up';
            }
            triggerTextCurrent.textContent = prevText;
            triggerTextNext.textContent = text;
            triggerText.classList.remove('animate-up', 'animate-down');
            // Restart animation by forcing a reflow.
            void triggerText.offsetWidth;
            triggerText.classList.add(directionClass);
            lastSelectedIndex = index;
        };

        triggerText.addEventListener('animationend', () => {
            if (!triggerTextNext.textContent) return;
            triggerTextCurrent.textContent = triggerTextNext.textContent;
            triggerTextNext.textContent = '';
            triggerText.classList.remove('animate-up', 'animate-down');
        });

        const updateMenuOptions = () => {
            menu.innerHTML = '';
            Array.from(select.options).forEach((option, index) => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.dataset.index = index;
                if (index === select.selectedIndex) item.classList.add('active');
                item.textContent = option.textContent;
                menu.appendChild(item);
            });
        };

        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;
            e.stopPropagation();
            const index = parseInt(item.dataset.index);
            select.selectedIndex = index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            container.classList.remove('open');
        });

        const updateActiveState = () => {
            const items = menu.querySelectorAll('.dropdown-item');
            items.forEach((item, index) => {
                item.classList.toggle('active', index === select.selectedIndex);
            });
            const nextText = select.options[select.selectedIndex]?.textContent || 'Select...';
            const hasIndexChange = select.selectedIndex !== lastSelectedIndex;
            const hasLabelChange = triggerTextCurrent.textContent !== nextText;
            if (hasIndexChange || hasLabelChange) {
                animateTriggerText(nextText, select.selectedIndex);
            } else {
                const isAnimating = triggerText.classList.contains('animate-up') || triggerText.classList.contains('animate-down');
                if (!isAnimating) resetTriggerText(nextText, select.selectedIndex);
            }
            container.classList.toggle('disabled', select.disabled);
        };

        updateMenuOptions();

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (select.disabled) return;
            document.querySelectorAll('.dropdown-container.open').forEach(openContainer => {
                if (openContainer !== container) openContainer.classList.remove('open');
            });
            const presetMenuBtn = get('preset-menu-btn');
            const presetContainer = presetMenuBtn?.closest('.dropdown-container');
            if (presetContainer) presetContainer.classList.remove('open');

            container.classList.toggle('open');
        });

        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') container.classList.remove('open');
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                trigger.click();
            }
        });

        select.addEventListener('change', updateActiveState);

        let debounceTimer = null;
        const debouncedUpdate = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateMenuOptions, 50);
        };
        const observer = new MutationObserver(debouncedUpdate);
        observer.observe(select, { childList: true });
    });
}

export function showView(view) {
    if (!view) return;

    const trimVideoPreview = get('trim-video-preview');
    const trimDashboard = get('trim-dashboard');

    if (trimVideoPreview && !trimVideoPreview.paused && view !== trimDashboard) {
        trimVideoPreview.pause();
    }

    const allViews = [
        'drop-zone', 'folder-drop-zone', 'extract-audio-drop-zone', 'extract-audio-dashboard',
        'image-to-pdf-drop-zone', 'image-to-pdf-dashboard', 'trim-drop-zone', 'trim-dashboard',
        'file-dashboard', 'progress-view', 'complete-view', 'settings-view', 'queue-view',
        'apps-dashboard', 'inspector-view', 'inspector-drop-zone', 'downloader-dashboard',
        'dl-options-dashboard', 'dl-progress-view', 'dl-complete-view'
    ];

    allViews.forEach(id => {
        const v = get(id);
        if (v) {
            v.classList.add('hidden');
            v.classList.remove('container-loaded');
        }
    });

    view.classList.remove('hidden');
    void view.offsetWidth;
    view.classList.add('container-loaded');
}

function parseDurationMs(value) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('ms')) {
        const num = Number.parseFloat(trimmed.slice(0, -2));
        return Number.isNaN(num) ? null : num;
    }
    if (trimmed.endsWith('s')) {
        const num = Number.parseFloat(trimmed.slice(0, -1));
        return Number.isNaN(num) ? null : num * 1000;
    }
    const fallback = Number.parseFloat(trimmed);
    return Number.isNaN(fallback) ? null : fallback;
}

export function animateAutoHeight(container, changeFn, options = {}) {
    if (!container || typeof changeFn !== 'function') {
        if (typeof changeFn === 'function') changeFn();
        return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        changeFn();
        return;
    }

    const computed = window.getComputedStyle(container);
    const cssDuration = parseDurationMs(computed.getPropertyValue('--auto-height-duration'));
    const cssEasing = computed.getPropertyValue('--auto-height-easing')?.trim();

    const duration = Number.isFinite(options.duration)
        ? options.duration
        : (Number.isFinite(cssDuration) ? cssDuration : 220);
    const easing = options.easing || cssEasing || 'ease';

    if (computed.display === 'none') {
        changeFn();
        return;
    }

    const startHeight = container.getBoundingClientRect().height;

    if (container.__heightTweenHandler) {
        container.removeEventListener('transitionend', container.__heightTweenHandler);
        container.__heightTweenHandler = null;
    }

    // Set height to auto to measure the end state
    container.style.transition = 'none';
    container.style.height = 'auto';
    changeFn();
    const endHeight = container.getBoundingClientRect().height;

    // Reset to start height
    container.style.height = `${startHeight}px`;

    // Force reflow
    void container.offsetHeight;

    const cleanup = (event) => {
        if (event && event.propertyName !== 'height') return;
        container.style.transition = '';
        container.style.height = '';
        container.style.overflow = '';
        container.style.willChange = '';
        container.removeEventListener('transitionend', cleanup);
        container.__heightTweenHandler = null;
    };

    container.__heightTweenHandler = cleanup;
    container.addEventListener('transitionend', cleanup);

    requestAnimationFrame(() => {
        if (Math.abs(endHeight - startHeight) < 1) {
            cleanup();
            return;
        }
        container.style.transition = `height ${duration}ms ${easing}`;
        container.style.overflow = 'hidden';
        container.style.willChange = 'height';
        container.style.height = `${endHeight}px`;
    });
}

export function toggleSidebar(disabled) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(btn => {
        btn.classList.toggle('disabled', disabled);
    });
}

export function resetNav() {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
}

export function resetProgress() {
    const progressPercent = get('progress-percent');
    const progressRing = get('progress-ring');
    const timeElapsed = get('time-elapsed');
    const timePosition = get('time-position');
    const encodeSpeed = get('encode-speed');

    if (progressPercent) progressPercent.textContent = '0%';
    if (progressRing) progressRing.style.strokeDashoffset = 502;
    if (timeElapsed) timeElapsed.textContent = '00:00:00';
    if (timePosition) timePosition.textContent = '00:00:00';
    if (encodeSpeed) encodeSpeed.textContent = '0.00x';
}

export function updateTextContent(element, text) {
    if (element && element.textContent !== text) {
        element.textContent = text;
    }
}

function shouldAnimateNumber(text) {
    return /\d/.test(text);
}

function extractNumericValue(text) {
    if (!text) return null;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const value = Number.parseFloat(match[0]);
    return Number.isNaN(value) ? null : value;
}

function triggerNumberAnimation(element) {
    if (!element) return;
    element.classList.remove('number-animate');
    // Restart animation by forcing a reflow.
    void element.offsetWidth;
    element.classList.add('number-animate');
}

function initAnimatedNumberElement(element, options = {}) {
    if (!element || element.dataset.animateNumberObserved === 'true') return;

    const lastValue = element.textContent || '';
    element.dataset.animateNumberObserved = 'true';
    element.dataset.animateNumberLast = lastValue;

    const throttleMs = Number(element.dataset.animateNumberThrottle || options.throttleMs || 140);
    let lastAnimationTime = 0;

    element.addEventListener('animationend', () => {
        element.classList.remove('number-animate');
    });

    const observer = new MutationObserver(() => {
        const currentValue = element.textContent || '';
        const previousValue = element.dataset.animateNumberLast || '';
        if (currentValue === previousValue) return;
        element.dataset.animateNumberLast = currentValue;

        if (!shouldAnimateNumber(currentValue)) return;

        const prevNumeric = extractNumericValue(previousValue);
        const nextNumeric = extractNumericValue(currentValue);
        if (prevNumeric !== null && nextNumeric !== null) {
            if (nextNumeric > prevNumeric) {
                element.dataset.animateNumberDirection = 'up';
            } else if (nextNumeric < prevNumeric) {
                element.dataset.animateNumberDirection = 'down';
            } else {
                element.dataset.animateNumberDirection = 'neutral';
            }
        } else {
            element.dataset.animateNumberDirection = 'neutral';
        }

        const now = performance.now();
        if (now - lastAnimationTime < throttleMs) return;
        lastAnimationTime = now;

        triggerNumberAnimation(element);
    });

    observer.observe(element, { childList: true, characterData: true, subtree: true });
}

export function setupAnimatedNumbers(options = {}) {
    const selector = options.selector || '[data-animate-number]';

    document.querySelectorAll(selector).forEach((element) => {
        initAnimatedNumberElement(element, options);
    });

    if (setupAnimatedNumbers._observer) return;

    const root = document.body || document.documentElement;
    if (!root) return;

    setupAnimatedNumbers._observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                if (node.matches(selector)) initAnimatedNumberElement(node, options);
                node.querySelectorAll?.(selector).forEach((el) => initAnimatedNumberElement(el, options));
            });
        });
    });

    setupAnimatedNumbers._observer.observe(root, { childList: true, subtree: true });
}

export function renderAudioTracks(audioTracks) {
    const audioTrackList = get('audio-track-list');
    const audioSelect = get('audio-select');
    const audioBitrateSelect = get('audio-bitrate');

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
                <button class="icon-btn" onclick="window.removeAudioTrack(${index})">
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

export function renderSubtitleTracks(subtitleTracks) {
    const subtitleTrackList = get('subtitle-track-list');
    if (!subtitleTrackList) return;

    subtitleTrackList.innerHTML = subtitleTracks.map((track, index) => `
        <div class="track-item">
            <div class="track-item-info">
                <span class="track-title">${track.name}</span>
                <span class="track-meta">External Subtitle</span>
            </div>
            <button class="icon-btn" onclick="window.removeSubtitleTrack(${index})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
}

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDurationFromSeconds(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function sanitizeFilename(str) {
    return str
        .replace(/</g, '＜')
        .replace(/>/g, '＞')
        .replace(/:/g, '：')
        .replace(/"/g, '＂')
        .replace(/\//g, '／')
        .replace(/\\/g, '＼')
        .replace(/\|/g, '｜')
        .replace(/\?/g, '？')
        .replace(/\*/g, '＊')
        .replace(/%/g, '％');
}
