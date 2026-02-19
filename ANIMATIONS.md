# Animation & Transition Components Reference

This document provides a comprehensive reference for all CSS animations, transitions, and JavaScript animation utilities used throughout the Video Toolbox application.

---

## Table of Contents

- [CSS Variables & Easing Functions](#css-variables--easing-functions)
- [CSS Keyframe Animations](#css-keyframe-animations)
  - [Container & Content Animations](#container--content-animations)
  - [Dropdown Animations](#dropdown-animations)
  - [Number & Text Animations](#number--text-animations)
  - [Loader Animations](#loader-animations)
  - [Miscellaneous Animations](#miscellaneous-animations)
- [JavaScript Animation Utilities](#javascript-animation-utilities)
- [CSS Utility Classes](#css-utility-classes)
- [Usage Examples](#usage-examples)

---

## CSS Variables & Easing Functions

### Transition Variable
```css
--transition: 0.3s ease;
```
Default transition timing for most interactive elements.

### Bouncy Pop Easing (`--ease-pop`)
A custom spring-like easing function for bouncy, iOS-style animations:

```css
--ease-pop: linear(0, 0.008, 0.031 2.2%, 0.125, 0.248 7.1%, 0.654 14.1%, 0.859 18.5%, 0.936,
        0.996, 1.041, 1.073 27.6%, 1.086, 1.094 30.9%, 1.096, 1.094 34.8%, 1.08 38.4%,
        1.035 46.5%, 1.016 50.7%, 1.001 55.3%, 0.993 60.2%, 0.991 67.2%, 0.999 85.8%,
        1.001);
```

### Auto Height Animation Variables
```css
--auto-height-duration: 0.3s;
--auto-height-easing: ease;
```
Used by the `animateAutoHeight()` JavaScript function.

### Standardized Easing
All bouncy animations throughout the codebase use `0.6s var(--ease-pop)` for consistency. Previously, various cubic-bezier values like `cubic-bezier(.24, 1.26, .44, 1.03)` and `cubic-bezier(0.165, 0.84, 0.44, 1)` were used - these have all been unified to use the `--ease-pop` CSS variable.

---

## CSS Keyframe Animations

### Container & Content Animations

#### `container-pop-in`
Pop-in animation for containers appearing on screen. Combines fade and subtle scale/translate.

```css
@keyframes container-pop-in {
    0% {
        opacity: 0;
        transform: translateY(12px) scale(0.98);
    }
    100% {
        opacity: 1;
        transform: none;
    }
}
```

**Usage:**
```css
.container-loaded {
    animation: container-pop-in 0.5s cubic-bezier(.24, 1.26, .44, 1.03) forwards;
}

/* With --ease-pop variable */
.dashboard.container-loaded > * {
    animation: container-pop-in 0.6s var(--ease-pop) forwards;
}
```

---

#### `container-pop-out`
Pop-out animation for containers being dismissed.

```css
@keyframes container-pop-out {
    0% {
        opacity: 1;
        transform: scale(1);
    }
    100% {
        opacity: 0;
        transform: scale(0.97) translateY(8px);
    }
}
```

**Usage:**
```css
.image-viewer-overlay.closing .image-viewer-content {
    animation: container-pop-out 0.25s ease both;
}
```

---

#### `boxReveal`
Drop zone reveal animation with vertical scale.

```css
@keyframes boxReveal {
    from {
        opacity: 0;
        transform: scaleY(0.9);
    }
    to {
        opacity: 1;
        transform: scaleY(1);
    }
}
```

**Usage:**
```css
.drop-zone {
    animation: boxReveal 0.6s var(--ease-pop) both;
}
```

---

#### `contentFadeIn`
Content fade-in with upward movement.

```css
@keyframes contentFadeIn {
    from {
        opacity: 0;
        transform: translateY(15px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

**Usage:**
```css
.drop-zone-inner > * {
    animation: contentFadeIn 0.6s var(--ease-pop) 0.2s both;
}
```

---

#### `slideUp`
Simple slide up animation.

```css
@keyframes slideUp {
    from {
        opacity: 0;
        top: 20px; /* or transform: translateY(20px) */
    }
    to {
        opacity: 1;
        top: 0;
    }
}
```

**Usage:**
```css
.dashboard {
    animation: slideUp 0.3s ease;
}

.complete-view {
    animation: slideUp 0.4s ease;
}
```

---

#### `item-pop-in`
Individual item pop-in animation (e.g., carousel items).

```css
@keyframes item-pop-in {
    0% {
        opacity: 0;
        transform: translateY(12px) scale(0.95);
    }
    100% {
        opacity: 1;
        transform: none;
    }
}
```

**Usage:**
```css
.image-preview-item {
    animation: item-pop-in 0.5s var(--ease-pop) backwards;
}
```

---

#### `item-pop-out`
Individual item exit animation for list removal. Used with the `.removing` and `.collapsing` classes for smooth list item removal.

```css
@keyframes item-pop-out {
    0% {
        opacity: 1;
        transform: scale(1);
    }
    100% {
        opacity: 0;
        transform: scale(0.95) translateX(-10px);
    }
}

.my-list-item.removing {
    animation: item-pop-out 0.25s ease forwards !important;
    pointer-events: none;
}

.my-list-item.collapsing {
    max-height: 0 !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    margin-bottom: -8px !important; /* Compensate for gap */
    overflow: hidden;
    transition: max-height 0.2s ease, padding 0.2s ease, margin 0.2s ease;
}
```

**Usage (JavaScript):**
```javascript
function removeListItem(index) {
    const list = document.querySelector('.my-list');
    const items = list.querySelectorAll('.my-list-item');
    const item = items[index];

    if (item) {
        // Phase 1: Start exit animation
        item.classList.add('removing');
        
        // Phase 2: After delay, collapse the space
        setTimeout(() => item.classList.add('collapsing'), 100);
        
        // Phase 3: After animation ends, remove from DOM
        item.addEventListener('animationend', () => {
            myDataArray.splice(index, 1);
            item.remove();
            
            // Update remaining items' onclick indices
            const remainingItems = list.querySelectorAll('.my-list-item');
            remainingItems.forEach((el, i) => {
                const btn = el.querySelector('.remove-btn');
                if (btn) btn.setAttribute('onclick', `removeListItem(${i})`);
            });
        }, { once: true });
    }
}
```

**Animation Sequence:**
1. **0ms**: `.removing` added → exit animation starts (fade + scale out)
2. **100ms**: `.collapsing` added → space collapse begins (items below slide up)
3. **~250ms**: Animation ends → DOM element removed

---

#### `text-pop-in`
Text loading animation with subtle scale.

```css
@keyframes text-pop-in {
    0% {
        opacity: 0;
        transform: translateY(8px) scale(0.95);
    }
    100% {
        opacity: 1;
        transform: none;
    }
}
```

**Usage:**
```css
.text-loaded {
    animation: text-pop-in 0.4s cubic-bezier(.24, 1.26, .44, 1.03) both;
}
```

---

### Dropdown Animations

#### `dropdownScaleOut`
Dropdown close animation.

```css
@keyframes dropdownScaleOut {
    from {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
    to {
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
    }
}
```

**Usage:**
```css
.dropdown-container.closing .dropdown-menu {
    animation: dropdownScaleOut 0.2s ease-in forwards;
    pointer-events: none;
}
```

---

#### Dropdown Text Slide Animations
For animated dropdown value changes:

```css
/* Slide out upward (when increasing) */
@keyframes dropdownTextOutUp {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(-70%); opacity: 0; }
}

/* Slide in from below (when increasing) */
@keyframes dropdownTextInFromDown {
    from { transform: translateY(70%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

/* Slide out downward (when decreasing) */
@keyframes dropdownTextOutDown {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(70%); opacity: 0; }
}

/* Slide in from above (when decreasing) */
@keyframes dropdownTextInFromUp {
    from { transform: translateY(-70%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
```

**Usage:**
```css
.dropdown-trigger-text.animate-down .dropdown-text-value.current {
    animation: dropdownTextOutUp 140ms ease;
}

.dropdown-trigger-text.animate-down .dropdown-text-value.next {
    animation: dropdownTextInFromDown 140ms ease;
}

.dropdown-trigger-text.animate-up .dropdown-text-value.current {
    animation: dropdownTextOutDown 140ms ease;
}

.dropdown-trigger-text.animate-up .dropdown-text-value.next {
    animation: dropdownTextInFromUp 140ms ease;
}
```

---

### Number & Text Animations

#### Number Blur Pulse Animations
Blur effect when numeric values change:

```css
/* Default pulse */
@keyframes numberBlurPulse {
    0% { filter: blur(0); transform: translateX(0); }
    20% { filter: blur(2px); transform: translateX(0) scale(0.98); }
    100% { filter: blur(0); transform: translateX(0); }
}

/* Pulse with rightward motion (value increasing) */
@keyframes numberBlurPulseRight {
    0% { filter: blur(0); transform: translateX(0); }
    20% { filter: blur(2px); transform: translateX(2px) scale(0.98); }
    100% { filter: blur(0); transform: translateX(0); }
}

/* Pulse with leftward motion (value decreasing) */
@keyframes numberBlurPulseLeft {
    0% { filter: blur(0); transform: translateX(0); }
    20% { filter: blur(2px); transform: translateX(-2px) scale(0.98); }
    100% { filter: blur(0); transform: translateX(0); }
}

/* Static pulse for centered elements (e.g., progress %) */
@keyframes numberBlurPulseStatic {
    0% { filter: blur(0); opacity: 1; transform: translate(-50%, -50%); }
    20% { filter: blur(2px); opacity: 0.75; transform: translate(-50%, -50%); }
    100% { filter: blur(0); opacity: 1; transform: translate(-50%, -50%); }
}
```

**Usage:**
```css
[data-animate-number].number-animate {
    animation: numberBlurPulse 200ms ease;
}

[data-animate-number][data-animate-number-direction="up"].number-animate {
    animation: numberBlurPulseRight 200ms ease;
}

[data-animate-number][data-animate-number-direction="down"].number-animate {
    animation: numberBlurPulseLeft 200ms ease;
}
```

---

#### Number Slide Animations
For number input steppers:

```css
@keyframes numberSlideOutLeft {
    0% { transform: translateX(0); opacity: 1; }
    100% { transform: translateX(-100%); opacity: 0; }
}

@keyframes numberSlideInLeft {
    0% { transform: translateX(100%); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
}

@keyframes numberSlideOutRight {
    0% { transform: translateX(0); opacity: 1; }
    100% { transform: translateX(100%); opacity: 0; }
}

@keyframes numberSlideInRight {
    0% { transform: translateX(-100%); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
}
```

**Usage:**
```css
.number-input-display.animate-left .number-input-value.current {
    animation: numberSlideOutLeft 180ms cubic-bezier(0.165, 0.84, 0.44, 1);
}

.number-input-display.animate-left .number-input-value.next {
    animation: numberSlideInLeft 180ms cubic-bezier(0.165, 0.84, 0.44, 1);
}
```

---

### Loader Animations

#### `loader-bars-grow`
Animated loader bars that grow and shrink.

```css
@keyframes loader-bars-grow {
    0%, 100% {
        transform: scaleY(0.3);
    }
    50% {
        transform: scaleY(1);
    }
}
```

**Usage:**
```css
.loader-bars .bar:nth-child(1) {
    animation: loader-bars-grow var(--uib-speed) ease-in-out calc(var(--uib-speed) * -0.45) infinite;
}

.loader-bars .bar:nth-child(2) {
    animation: loader-bars-grow var(--uib-speed) ease-in-out calc(var(--uib-speed) * -0.3) infinite;
}

.loader-bars .bar:nth-child(3) {
    animation: loader-bars-grow var(--uib-speed) ease-in-out calc(var(--uib-speed) * -0.15) infinite;
}

.loader-bars .bar:nth-child(4) {
    animation: loader-bars-grow var(--uib-speed) ease-in-out infinite;
}
```

---

### Miscellaneous Animations

#### `fadeIn` / `fadeOut`
Simple opacity transitions.

```css
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
}
```

**Usage:**
```css
.image-viewer-overlay {
    animation: fadeIn 0.3s ease forwards;
}

.image-viewer-overlay.closing {
    animation: fadeOut 0.25s ease both;
}

.preset-dropdown {
    animation: fadeIn 0.15s ease;
}
```

---

#### `pop`
Success icon pop animation.

```css
@keyframes pop {
    0% { transform: scale(0); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
}
```

**Usage:**
```css
.success-icon {
    animation: pop 0.5s ease;
}
```

---

#### `playPauseAnim`
Video play/pause overlay icon animation.

```css
@keyframes playPauseAnim {
    0% {
        opacity: 0;
        transform: scale(0.5);
    }
    30% {
        opacity: 1;
        transform: scale(1.1);
    }
    100% {
        opacity: 0;
        transform: scale(1);
    }
}
```

**Usage:**
```css
.video-overlay.show-icon .play-pause-icon {
    animation: playPauseAnim 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) forwards;
}
```

---

#### `float`
Background orb floating animation.

```css
@keyframes float {
    0% { transform: translate(0, 0) rotate(0deg); }
    33% { transform: translate(30px, -50px) rotate(10deg); }
    66% { transform: translate(-20px, 20px) rotate(-5deg); }
    100% { transform: translate(0, 0) rotate(0deg); }
}
```

**Usage:**
```css
.bg-orb {
    animation: float 28s ease-in-out infinite alternate;
}
```

---

## JavaScript Animation Utilities

### `animateAutoHeight(container, changeFn, options)`

Smoothly animates container height changes when content is added/removed.

**Location:** `renderer/modules/ui-utils.js`

**Parameters:**
- `container` - DOM element to animate
- `changeFn` - Function that modifies the container content
- `options` (optional):
  - `duration` - Animation duration in ms (default: 220 or CSS variable)
  - `easing` - Easing function (default: 'ease' or CSS variable)

**Usage:**
```javascript
import { animateAutoHeight } from './modules/ui-utils.js';

// Animate height when adding content
animateAutoHeight(myContainer, () => {
    myContainer.innerHTML += '<div>New content</div>';
});

// With custom options
animateAutoHeight(myContainer, () => {
    removeItem();
}, { duration: 300, easing: 'ease-out' });
```

**Respects CSS variables:**
```css
.my-container {
    --auto-height-duration: 400ms;
    --auto-height-easing: cubic-bezier(.24, 1.26, .44, 1.03);
}
```

---

### `setupAnimatedNumbers(options)`

Initializes automatic blur pulse animations on elements when their numeric content changes.

**Location:** `renderer/modules/ui-utils.js`

**Parameters:**
- `options` (optional):
  - `selector` - CSS selector (default: `'[data-animate-number]'`)
  - `throttleMs` - Throttle time between animations (default: 140)

**Usage:**
```javascript
import { setupAnimatedNumbers } from './modules/ui-utils.js';

// Initialize on page load
setupAnimatedNumbers();

// Custom selector
setupAnimatedNumbers({ selector: '.my-animated-values' });
```

**HTML:**
```html
<span data-animate-number>0%</span>
<span data-animate-number data-animate-number-throttle="200">00:00:00</span>
```

---

### `animateNumberDisplay(input, direction, fromValue, toValue)`

Animates number stepper value changes with a sliding effect.

**Location:** `renderer/renderer.js`

**Parameters:**
- `input` - The number input element
- `direction` - Direction of change (positive = left, negative = right)
- `fromValue` - Previous display value
- `toValue` - New display value

**Usage:**
```javascript
animateNumberDisplay(crfInput, 1, "23", "24");  // Animate increase
animateNumberDisplay(crfInput, -1, "24", "23"); // Animate decrease
```

---

### `showView(view)`

Shows a view with the `container-loaded` animation class.

**Location:** `renderer/modules/ui-utils.js`

**Usage:**
```javascript
import { showView } from './modules/ui-utils.js';

const dashboard = document.getElementById('file-dashboard');
showView(dashboard);
```

---

### Animation Restart Pattern

Force reflow to restart CSS animations:

```javascript
// Restart animation by forcing a reflow
element.classList.remove('my-animation-class');
void element.offsetWidth; // Force reflow
element.classList.add('my-animation-class');
```

---

## CSS Utility Classes

### `.container-loaded`
Apply pop-in animation to a container.

```html
<div class="container-loaded">Content appears with animation</div>
```

### `.text-loaded`
Apply text pop-in animation.

```html
<span class="text-loaded">Animated text</span>
```

### `.hidden`
Hide element immediately (no animation).

```html
<div class="hidden">This is hidden</div>
```

### `.closing`
Apply to overlays/modals to trigger close animation.

```html
<div class="image-viewer-overlay closing">...</div>
```

### `[data-animate-number]`
Mark elements for automatic number change animations.

```html
<span data-animate-number>42</span>
```

---

## Usage Examples

### Animating a New Component

```css
.my-component {
    animation: container-pop-in 0.5s var(--ease-pop) forwards;
}

.my-component:hover {
    transform: translateY(-2px);
    transition: transform 0.4s var(--ease-pop);
}
```

### Creating a Dismissable Modal

```css
.my-modal {
    animation: fadeIn 0.2s ease;
}

.my-modal.closing {
    animation: fadeOut 0.2s ease forwards;
}

.my-modal.closing .modal-content {
    animation: container-pop-out 0.2s ease forwards;
}
```

```javascript
function closeModal(modal) {
    modal.classList.add('closing');
    modal.addEventListener('animationend', () => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
    }, { once: true });
}
```

### Staggered List Animation

```css
.list-item {
    animation: item-pop-in 0.5s var(--ease-pop) backwards;
}

.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 50ms; }
.list-item:nth-child(3) { animation-delay: 100ms; }
.list-item:nth-child(4) { animation-delay: 150ms; }
/* Or use CSS custom property with inline style */
```

### Dynamic Stagger with JavaScript

```javascript
items.forEach((item, index) => {
    item.style.animationDelay = `${index * 50}ms`;
});
```

---

## Accessibility

All animations respect the user's reduced motion preference:

```css
@media (prefers-reduced-motion: reduce) {
    .dropdown-trigger-text.animate-down .dropdown-text-value,
    .dropdown-trigger-text.animate-up .dropdown-text-value,
    [data-animate-number].number-animate {
        animation: none;
    }
}
```

When implementing new animations, always include a reduced motion fallback:

```css
@media (prefers-reduced-motion: reduce) {
    .my-animated-element {
        animation: none;
        transition: none;
    }
}
```

---

## Quick Reference

| Animation Name | Duration | Easing | Purpose |
|----------------|----------|--------|---------|
| `container-pop-in` | 0.5-0.6s | `--ease-pop` or bounce | Container entrance |
| `container-pop-out` | 0.25s | ease | Container exit |
| `item-pop-in` | 0.5s | `--ease-pop` | List item entrance |
| `text-pop-in` | 0.4s | bounce | Text element entrance |
| `fadeIn` | 0.15-0.3s | ease | Overlay/backdrop fade |
| `fadeOut` | 0.25s | ease | Overlay/backdrop dismiss |
| `dropdownScaleOut` | 0.2s | ease-in | Dropdown close |
| `numberBlurPulse*` | 200ms | ease | Number value change |
| `numberSlide*` | 180ms | bounce | Number stepper change |
| `loader-bars-grow` | 1s | ease-in-out | Loading indicator |
| `pop` | 0.5s | ease | Success icon |
| `playPauseAnim` | 0.6s | bounce | Video play/pause |
| `float` | 28s | ease-in-out | Background orbs |

---

*Last updated: February 2026*
