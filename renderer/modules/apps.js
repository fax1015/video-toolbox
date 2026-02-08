// Tool Library/Apps Framework Module

import { get, showView } from './ui-utils.js';
import * as state from './state.js';
import { TOOL_REGISTRY, APP_SETTINGS_KEY } from '../constants.js';
import { clearImages } from './image-to-pdf.js';

const MAX_PINNED_APPS = 6;

export function setupAppsHandlers() {
    const appsDashboard = get('apps-dashboard');
    const navApps = get('nav-apps');

    syncToolIcons();
    renderSidebarApps();
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
        if (state.appSettings.pinnedApps.length >= MAX_PINNED_APPS) return;
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
    console.log('Launching tool:', toolId);
    const tool = TOOL_REGISTRY.find(t => t.id === toolId);
    if (!tool) {
        console.error('Tool not found:', toolId);
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
            console.error('View element not found:', tool.viewId);
        }
    }
}

function renderSidebarApps() {
    const staticNavs = ['converter', 'folder', 'trim', 'extract-audio', 'downloader', 'inspector'];

    staticNavs.forEach(id => {
        const navEl = TOOL_REGISTRY.find(t => t.id === id)?.navId;
        const el = get(navEl);
        if (el) {
            if (state.appSettings.pinnedApps.includes(id)) {
                el.classList.remove('hidden');
                el.style.display = 'flex';
            } else {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        }
    });

    document.querySelectorAll('.nav-item.dynamic-tool').forEach(el => el.remove());

    const divider = document.querySelector('.sidebar-divider');
    const container = document.querySelector('.sidebar-nav');

    if (!divider || !container) return;

    state.appSettings.pinnedApps.forEach(toolId => {
        if (!staticNavs.includes(toolId)) {
            const tool = TOOL_REGISTRY.find(t => t.id === toolId);
            if (tool) {
                const btn = document.createElement('button');
                btn.className = 'nav-item dynamic-tool';
                btn.id = `nav-${tool.id}`;
                btn.title = tool.name;
                btn.innerHTML = tool.icon;
                btn.onclick = () => launchTool(tool.id);
                container.insertBefore(btn, divider);
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

    const maxReached = state.appSettings.pinnedApps.length >= MAX_PINNED_APPS;

    TOOL_REGISTRY.forEach(tool => {
        const isPinned = state.appSettings.pinnedApps.includes(tool.id);
        const pinDisabled = !isPinned && maxReached;
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
                <button class="pin-btn ${isPinned ? 'pinned' : ''} ${pinDisabled ? 'disabled' : ''}" title="${pinDisabled ? 'Pin limit reached' : (isPinned ? 'Unpin' : 'Pin')}" data-id="${tool.id}" ${pinDisabled ? 'disabled' : ''}>
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
            if (pinDisabled) return;
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
