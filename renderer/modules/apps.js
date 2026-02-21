// Tool Library/Apps Framework Module

import { get, showView } from './ui-utils.js';
import * as state from './state.js';
import { TOOL_REGISTRY, APP_SETTINGS_KEY } from '../constants.js';
import { clearImages } from './image-to-pdf.js';

const SIDEBAR_REORDER_HOLD_MS = 1000;

export function setupAppsHandlers() {
    const appsDashboard = get('apps-dashboard');
    const navApps = get('nav-apps');

    syncToolIcons();
    renderSidebarApps();
    setupSidebarReorder();
    renderAppsGrid();

    if (navApps) {
        navApps.addEventListener('click', () => {
            const resetNav = () => {
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            };
            resetNav();
            navApps.classList.add('active');
            renderAppsGrid();
            showView(appsDashboard);
        });
    }
}

function setupSidebarReorder() {
    const container = document.querySelector('.sidebar-nav-scroll');
    if (!container || container.dataset.reorderBound === 'true') return;

    let holdTimer = null;
    let isReorderMode = false;
    let hasReordered = false;
    let draggedToolId = null;
    let shouldSuppressNextClick = false;

    const clearHoldTimer = () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    };

    const getNavButton = (target) => target?.closest('.nav-item[data-tool-id]');

    const savePinnedOrderFromDom = () => {
        const currentPinned = new Set(state.appSettings.pinnedApps || []);
        const orderedPinned = Array.from(container.querySelectorAll('.nav-item[data-tool-id]'))
            .map((el) => el.dataset.toolId)
            .filter((id) => id && currentPinned.has(id));

        const missingPinned = (state.appSettings.pinnedApps || []).filter((id) => !orderedPinned.includes(id));
        state.appSettings.pinnedApps = [...orderedPinned, ...missingPinned];
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(state.appSettings));
    };

    const resetReorderState = () => {
        shouldSuppressNextClick = hasReordered;
        clearHoldTimer();
        container.classList.remove('reorder-mode');
        container.querySelectorAll('.nav-item.reorder-active').forEach((el) => el.classList.remove('reorder-active'));
        container.querySelectorAll('.nav-item').forEach((el) => {
            el.style.transform = '';
            el.style.transition = '';
        });

        if (isReorderMode && hasReordered) {
            savePinnedOrderFromDom();
            renderAppsGrid();
            document.dispatchEvent(new CustomEvent('sidebar-tools-reordered'));
        }

        isReorderMode = false;
        hasReordered = false;
        draggedToolId = null;
    };

    container.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;

        const navBtn = getNavButton(event.target);
        if (!navBtn || navBtn.classList.contains('hidden')) return;

        clearHoldTimer();
        holdTimer = setTimeout(() => {
            const liveBtn = container.querySelector(`#${navBtn.id}`);
            if (!liveBtn) return;

            isReorderMode = true;
            draggedToolId = liveBtn.dataset.toolId;
            container.classList.add('reorder-mode');
            liveBtn.classList.add('reorder-active');
        }, SIDEBAR_REORDER_HOLD_MS);
    });

    container.addEventListener('pointerover', (event) => {
        if (!isReorderMode || !draggedToolId) return;

        const targetBtn = getNavButton(event.target);
        if (!targetBtn || targetBtn.dataset.toolId === draggedToolId) return;

        const draggedBtn = container.querySelector(`.nav-item[data-tool-id="${draggedToolId}"]`);
        if (!draggedBtn) return;

        const items = Array.from(container.querySelectorAll('.nav-item'));
        const rects = new Map(items.map(item => [item, item.getBoundingClientRect()]));

        const rect = targetBtn.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + (rect.height / 2);

        let didMove = false;
        if (insertAfter) {
            if (targetBtn.nextSibling !== draggedBtn) {
                container.insertBefore(draggedBtn, targetBtn.nextSibling);
                didMove = true;
            }
        } else if (targetBtn !== draggedBtn.nextSibling) {
            container.insertBefore(draggedBtn, targetBtn);
            didMove = true;
        }

        if (didMove) {
            hasReordered = true;
            items.forEach(item => {
                const oldRect = rects.get(item);
                const newRect = item.getBoundingClientRect();
                if (oldRect) {
                    const dy = oldRect.top - newRect.top;
                    if (dy !== 0 && item !== draggedBtn) {
                        item.style.transform = `translateY(${dy}px)`;
                        item.style.transition = 'none';
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                item.style.transform = '';
                                item.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
                            });
                        });
                    }
                }
            });
        }
    });

    container.addEventListener('pointerup', resetReorderState);
    container.addEventListener('pointercancel', resetReorderState);
    container.addEventListener('pointerleave', clearHoldTimer);
    document.addEventListener('pointerup', resetReorderState);

    container.addEventListener('click', (event) => {
        if (!shouldSuppressNextClick) return;
        const navBtn = getNavButton(event.target);
        if (!navBtn) return;
        event.preventDefault();
        event.stopPropagation();
        shouldSuppressNextClick = false;
    }, true);

    container.dataset.reorderBound = 'true';
}

function syncToolIcons() {
    syncToolNavIcons();
    syncToolDropZoneIcons();
}

function syncToolNavIcons() {
    TOOL_REGISTRY.forEach(tool => {
        if (!tool.navId || !tool.icon) return;
        const nav = get(tool.navId);
        if (!nav) return;
        nav.innerHTML = tool.icon;
    });
}

function syncToolDropZoneIcons() {
    document.querySelectorAll('.icon-container[data-tool-id]').forEach(container => {
        const toolId = container.dataset.toolId;
        if (!toolId) return;
        const tool = TOOL_REGISTRY.find(entry => entry.id === toolId);
        if (!tool || !tool.icon) return;
        container.innerHTML = tool.icon;
    });
}

function togglePin(toolId) {
    if (state.appSettings.pinnedApps.includes(toolId)) {
        state.appSettings.pinnedApps = state.appSettings.pinnedApps.filter(id => id !== toolId);
    } else {
        state.appSettings.pinnedApps.push(toolId);
    }

    // Save settings after pinning/unpinning
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(state.appSettings));
    updatePinnedApps();
}

function updatePinnedApps() {
    renderSidebarApps();
    renderAppsGrid();
}

function launchTool(toolId) {
    const tool = TOOL_REGISTRY.find(t => t.id === toolId);
    if (!tool) {
        if (window.api?.logError) window.api.logError('Tool not found:', toolId); else console.error('Tool not found:', toolId);
        return;
    }

    const resetNav = () => {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    };

    clearImages();

    if (tool.id === 'inspector') {
        resetNav();
        const nav = document.getElementById(`nav-${tool.id}`);
        if (nav) nav.classList.add('active');
        const inspectorDropZone = get('inspector-drop-zone');
        showView(inspectorDropZone);
    } else if (tool.viewId) {
        const view = document.getElementById(tool.viewId);
        if (view) {
            resetNav();
            const navItem = document.getElementById(tool.navId) || document.getElementById(`nav-${tool.id}`);
            if (navItem) navItem.classList.add('active');
            showView(view);
        } else {
            if (window.api?.logError) window.api.logError('View element not found:', tool.viewId); else console.error('View element not found:', tool.viewId);
        }
    }
}

function renderSidebarApps() {
    const staticNavs = ['converter', 'folder', 'trim', 'extract-audio', 'downloader', 'inspector'];
    const pinnedSet = new Set(state.appSettings.pinnedApps || []);

    document.querySelectorAll('.nav-item.dynamic-tool').forEach(el => el.remove());

    const container = document.querySelector('.sidebar-nav-scroll');

    if (!container) return;

    state.appSettings.pinnedApps.forEach(toolId => {
        const tool = TOOL_REGISTRY.find(t => t.id === toolId);
        if (!tool) return;

        if (staticNavs.includes(toolId)) {
            const el = get(tool.navId);
            if (!el) return;
            el.classList.remove('hidden');
            el.style.display = 'flex';
            container.appendChild(el);
            return;
        }

        const btn = document.createElement('button');
        btn.className = 'nav-item dynamic-tool';
        btn.id = `nav-${tool.id}`;
        btn.title = tool.name;
        btn.innerHTML = tool.icon;
        btn.dataset.toolId = tool.id;
        btn.onclick = () => launchTool(tool.id);
        container.appendChild(btn);
    });

    staticNavs.forEach(id => {
        const navEl = TOOL_REGISTRY.find(t => t.id === id)?.navId;
        const el = get(navEl);
        if (el) {
            if (pinnedSet.has(id)) {
                el.classList.remove('hidden');
                el.style.display = 'flex';
            } else {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        }
    });
}

function renderAppsGrid() {
    const appsDashboard = get('apps-dashboard');
    if (!appsDashboard) return;

    const grid = get('apps-grid');
    if (!grid) return;

    grid.innerHTML = '';

    TOOL_REGISTRY.forEach(tool => {
        const isPinned = state.appSettings.pinnedApps.includes(tool.id);
        const card = document.createElement('div');
        card.className = 'tool-card';
        card.innerHTML = `
            <div class="tool-card-icon">${tool.icon}</div>
            <div class="tool-card-content">
                <h3>${tool.name}</h3>
                <p>${tool.description}</p>
            </div>
            <div class="tool-card-actions">
                <button class="secondary-btn open-tool-btn" data-id="${tool.id}">Open</button>
                <button class="pin-btn ${isPinned ? 'pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin'}" data-id="${tool.id}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="17" x2="12" y2="22"></line>
                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
                    </svg>
                </button>
            </div>
        `;

        card.querySelector('.open-tool-btn').addEventListener('click', () => launchTool(tool.id));
        card.querySelector('.pin-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            togglePin(tool.id);
        });

        grid.appendChild(card);
    });
}

export function renderAppsGridExternal() {
    renderAppsGrid();
}

export function renderSidebarAppsExternal() {
    renderSidebarApps();
}
