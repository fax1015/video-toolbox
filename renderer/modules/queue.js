// Queue Management Module

import { get, showPopup, showConfirm, animateAutoHeight } from './ui-utils.js';
import { showView, toggleSidebar, resetNav } from './ui-utils.js';
import { MAX_QUEUE_SIZE, BUILT_IN_PRESETS } from '../constants.js';
import * as state from './state.js';

export function addToQueue(options, taskType = 'encode') {
    if (state.encodingQueue.length >= MAX_QUEUE_SIZE) {
        showPopup(`Queue limit reached (${MAX_QUEUE_SIZE} items maximum). Please wait for some items to complete or clear the queue.`);
        return;
    }

    const id = crypto.randomUUID();
    let name = 'Unknown';
    if (options.input) {
        if (taskType === 'download') {
            name = options.input;
        } else {
            name = options.input.split(/[\\/]/).pop();
        }
    }

    const preset = taskType === 'encode' ? (state.currentPresetUsed || null) : null;
    state.encodingQueue.push({
        id,
        options,
        taskType,
        status: 'pending',
        state: 'pending',
        progress: 0,
        name,
        preset,
        presetUsed: preset,
        isModified: taskType === 'encode' ? state.isCurrentSettingsModified : false
    });

    updateQueueUI();
}

export function updateQueueUI() {
    const queueBadge = get('queue-badge');
    if (queueBadge) {
        const pendingCount = state.encodingQueue.filter(item => item.status !== 'completed').length;
        queueBadge.textContent = pendingCount;
        queueBadge.classList.toggle('hidden', pendingCount === 0);
    }
    renderQueue();
}

export function updateQueueProgress() {
    const queueList = get('queue-list');
    if (!queueList || !state.currentlyEncodingItemId) return;

    const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
    if (!item) return;

    const itemEl = queueList.querySelector(`[data-id="${item.id}"]`);
    if (!itemEl) return;

    const statusEl = itemEl.querySelector('.queue-item-status');
    const progressEl = itemEl.querySelector('.queue-progress-bar');

    if (statusEl) {
        const action = item.taskType === 'trim' ? 'Trimming' :
            item.taskType === 'extract' ? 'Extracting' :
                item.taskType === 'download' ? 'Downloading' : 'Encoding';
        statusEl.textContent = `${action}... ${item.progress}%`;
    }
    if (progressEl) progressEl.style.width = `${item.progress}%`;
    itemEl.classList.add('active');
}

function formatPresetName(name) {
    const preset = BUILT_IN_PRESETS[name];
    if (preset && preset.label) return preset.label;

    const specialCases = {
        'hq': 'HQ',
        'super-hq': 'Super HQ',
        'iphone': 'iPhone',
        'ipad': 'iPad',
        'hevc': 'HEVC'
    };

    // Strip group prefixes (general-, web-, device-, mkv-, production-)
    let formatted = name.replace(/^(general|web|device|mkv|production)-/, '');

    for (const [key, value] of Object.entries(specialCases)) {
        if (formatted.startsWith(key)) {
            formatted = formatted.replace(key, value);
        }
    }

    formatted = formatted.split('-').map(word => {
        if (word === word.toUpperCase() && word.length > 1) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    return formatted;
}

export { formatPresetName };

function getTaskLabel(item) {
    if (item.taskType === 'trim') return 'Trim';
    if (item.taskType === 'extract') return 'Extract audio';
    if (item.taskType === 'download') return 'Download';
    return 'Encode';
}

function formatStatusLabel(status) {
    if (!status) return 'Pending';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

export function renderQueue() {
    const queueList = get('queue-list');
    if (!queueList) return;

    if (state.encodingQueue.length === 0) {
        queueList.innerHTML = '<div class="empty-queue-msg">Queue is empty</div>';
        return;
    }

    // Track previous count so we only animate newly added items
    const previousCount = queueList.querySelectorAll('.queue-item').length;

    animateAutoHeight(queueList, () => {
        queueList.innerHTML = state.encodingQueue.map((item, index) => {
            if (item.status && item.state !== item.status) {
                item.state = item.status;
            }
            const currentStatus = item.status || item.state || 'pending';
            const taskLabel = getTaskLabel(item);
            let statusText = `${formatStatusLabel(currentStatus)} · ${taskLabel}`;

            if (item.taskType === 'encode') {
                const presetLabel = item.preset ? formatPresetName(item.preset) : 'None';
                statusText = `${statusText} · ${presetLabel}`;
            }

            const encodingStatus = item.status === 'encoding'
                ? (item.taskType === 'trim' ? `Trimming... ${item.progress}%` :
                    item.taskType === 'extract' ? `Extracting... ${item.progress}%` :
                        item.taskType === 'download' ? `Downloading... ${item.progress}%` :
                            `Encoding... ${item.progress}%`)
                : null;

            // Only animate items that are newly added
            const shouldAnimate = index >= previousCount;
            const animStyle = shouldAnimate ? `--item-index: ${index - previousCount}` : 'animation: none';

            return `
            <div class="queue-item ${item.id === state.currentlyEncodingItemId ? 'active' : ''} ${item.status === 'completed' ? 'completed' : ''} ${item.removing ? 'removing' : ''}" 
                 data-id="${item.id}" 
                 data-task-type="${item.taskType || 'encode'}"
                 style="${animStyle}"
                 onclick="window.loadQueueItem('${item.id}')">
                <div class="queue-item-info">
                    <div class="queue-item-name">${item.name}</div>
                    <div class="queue-item-status" data-animate-number>${encodingStatus !== null ? encodingStatus : statusText}</div>
                </div>
                ${item.status === 'encoding' || item.status === 'completed' ? `
                <div class="queue-item-progress">
                    <div class="queue-progress-bar" style="width: ${item.progress}%"></div>
                </div>
                ` : ''}
                <button class="remove-btn" onclick="event.stopPropagation(); window.removeQueueItem('${item.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            `;
        }).join('');
    });
} 

export function processQueue() {
    if (!state.isQueueRunning) return;

    const nextItem = state.encodingQueue.find(item => item.status === 'pending');

    if (!nextItem) {
        state.setQueueRunning(false);
        state.setCurrentlyEncodingItemId(null);

        if (state.encodingQueue.some(i => i.status === 'completed')) {
            showPopup('Queue processing complete!');
        }
        updateQueueUI();
        updateQueueStatusUI();
        toggleSidebar(false);
        return;
    }

    nextItem.status = 'encoding';
    nextItem.state = 'encoding';
    state.setCurrentlyEncodingItemId(nextItem.id);
    state.setEncodingState(true);
    state.setCancelled(false);
    toggleSidebar(true);
    updateQueueUI();
    updateQueueStatusUI();

    const progressTitle = get('progress-title');
    const progressFilename = get('progress-filename');

    if (nextItem.taskType === 'trim') {
        if (progressTitle) progressTitle.textContent = 'Trimming video...';
        if (progressFilename) progressFilename.textContent = nextItem.name;
        window.api.trimVideo(nextItem.options);
    } else if (nextItem.taskType === 'extract') {
        if (progressTitle) progressTitle.textContent = 'Extracting audio...';
        if (progressFilename) progressFilename.textContent = nextItem.name;
        window.api.extractAudio(nextItem.options);
    } else if (nextItem.taskType === 'download') {
        if (progressTitle) progressTitle.textContent = 'Downloading video...';
        if (progressFilename) progressFilename.textContent = nextItem.name;
        window.api.downloadVideo(nextItem.options);
    } else {
        if (progressTitle) progressTitle.textContent = 'Encoding in Progress';
        if (progressFilename) progressFilename.textContent = nextItem.name;
        window.api.startEncode(nextItem.options);
    }
}

export function updateQueueStatusUI() {
    const startQueueBtn = get('start-queue-btn');
    const startQueueIcon = get('start-queue-icon');
    const pauseQueueIcon = get('pause-queue-icon');
    const pauseQueueIcon2 = get('pause-queue-icon-2');
    const startQueueText = get('start-queue-text');

    if (!startQueueBtn) return;

    if (state.isQueueRunning) {
        if (startQueueIcon) startQueueIcon.classList.add('hidden');
        if (pauseQueueIcon) pauseQueueIcon.classList.remove('hidden');
        if (pauseQueueIcon2) pauseQueueIcon2.classList.remove('hidden');
        if (startQueueText) startQueueText.textContent = 'Pause Queue';
    } else {
        if (startQueueIcon) startQueueIcon.classList.remove('hidden');
        if (pauseQueueIcon) pauseQueueIcon.classList.add('hidden');
        if (pauseQueueIcon2) pauseQueueIcon2.classList.add('hidden');
        const hasStarted = state.encodingQueue.some(item => item.status === 'completed');
        if (startQueueText) startQueueText.textContent = hasStarted ? 'Resume Queue' : 'Start Queue';
    }
}

export function setupQueueHandlers() {
    const clearQueueBtn = get('clear-queue-btn');
    const startQueueBtn = get('start-queue-btn');
    const queueAddBtn = get('queue-add-btn');

    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', async () => {
            if (state.encodingQueue.length === 0) return;

            const confirmClear = await showConfirm('Are you sure you want to clear all items from the queue?');
            if (!confirmClear) return;

            if (state.isQueueRunning) window.api.cancelEncode();
            state.setEncodingQueue([]);
            state.setCurrentlyEncodingItemId(null);
            state.setQueueRunning(false);
            updateQueueUI();
            updateQueueStatusUI();
            toggleSidebar(false);
        });
    }

    if (startQueueBtn) {
        startQueueBtn.addEventListener('click', () => {
            if (state.encodingQueue.length === 0) return;

            if (state.isQueueRunning) {
                state.setQueueRunning(false);

                if (state.currentlyEncodingItemId !== null) {
                    const item = state.encodingQueue.find(i => i.id === state.currentlyEncodingItemId);
                    if (item && item.status === 'encoding') {
                        item.status = 'pending';
                        item.progress = 0;
                    }
                    window.api.cancelEncode();
                    state.setCurrentlyEncodingItemId(null);
                    toggleSidebar(false);
                }
                updateQueueStatusUI();
                updateQueueUI();
            } else {
                state.setQueueRunning(true);
                updateQueueStatusUI();
                processQueue();
            }
        });
    }

    if (queueAddBtn) {
        queueAddBtn.addEventListener('click', async () => {
            try {
                const filePath = await window.api.selectFile();
                if (filePath) {
                    const options = window.getOptionsFromUI();
                    options.input = filePath;
                    addToQueue(options);
                }
            } catch (err) {
                console.error('Error adding to queue:', err);
            }
        });
    }

    // Global queue item handlers
    window.removeQueueItem = (id) => {
        const index = state.encodingQueue.findIndex(item => item.id === id);
        if (index === -1) return;

        // If currently encoding, cancel and reset
        if (id === state.currentlyEncodingItemId) {
            window.api.cancelEncode();
            state.setCurrentlyEncodingItemId(null);
            const item = state.encodingQueue[index];
            if (item) {
                item.status = 'pending';
                item.progress = 0;
            }
            toggleSidebar(false);
            updateQueueUI();
            return;
        }

        // For non-active items, prefer animating the existing DOM node directly to avoid re-render jumps
        const item = state.encodingQueue[index];
        if (!item) return;
        if (item.removing) return; // already in progress

        // Mark removing in state so if a re-render happens mid-animation the class will be preserved
        item.removing = true;

        const queueList = get('queue-list');
        const itemEl = queueList?.querySelector(`[data-id="${id}"]`);

        const finishRemoval = () => {
            // Finally remove from state and re-render
            const idx = state.encodingQueue.findIndex(i => i.id === id);
            if (idx !== -1) state.encodingQueue.splice(idx, 1);
            updateQueueUI();

            if (state.encodingQueue.length === 0) {
                state.setQueueRunning(false);
                updateQueueStatusUI();
                toggleSidebar(false);
            }
        };

        // If the node exists in the DOM, run the pop-out animation then collapse, letting other items move smoothly
        if (itemEl) {
            // Add class directly to avoid a full re-render replacing the node mid-animation
            // Clear inline animation overrides so the exit animation can run.
            itemEl.style.animation = '';
            itemEl.classList.add('removing');
            itemEl.style.pointerEvents = 'none';

            const onAnimationEnd = (event) => {
                if (event.target !== itemEl) return;
                if (event.animationName !== 'item-pop-out') return;
                itemEl.removeEventListener('animationend', onAnimationEnd);

                // Prepare for collapsing transition
                itemEl.style.maxHeight = `${itemEl.scrollHeight}px`;

                requestAnimationFrame(() => {
                    itemEl.classList.add('collapsing');
                    itemEl.style.maxHeight = '0px';

                    const onTransitionEnd = () => {
                        itemEl.removeEventListener('transitionend', onTransitionEnd);
                        finishRemoval();
                    };

                    itemEl.addEventListener('transitionend', onTransitionEnd);
                });
            };

            itemEl.addEventListener('animationend', onAnimationEnd);

            // Fallback: if animationend doesn't fire (node replaced), ensure removal after a safe timeout
            setTimeout(() => {
                // If the item is still present, try to finish removal
                if (state.encodingQueue.find(i => i.id === id)) finishRemoval();
            }, 700);
        } else {
            // If no node found, update the UI so the removing class will be applied on next render and remove after timeout
            updateQueueUI();
            setTimeout(() => {
                if (state.encodingQueue.find(i => i.id === id)) finishRemoval();
            }, 700);
        }
    };
}
