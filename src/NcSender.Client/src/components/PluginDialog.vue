<!--
  This file is part of ncSender.

  ncSender is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  ncSender is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with ncSender. If not, see <https://www.gnu.org/licenses/>.
-->

<template>
  <div v-if="show" class="plugin-dialog-root">
    <div
      ref="dialogContainer"
      class="plugin-dialog-container"
      :class="{
        'is-dragging': isDragging,
        'is-resizing': isResizing,
        'is-minimized': isMinimized,
        'is-maximized': isMaximized
      }"
      :style="containerStyle"
    >
      <!-- Corner resize handles (only when resizable) -->
      <template v-if="!isMinimized && !isMaximized">
        <div class="resize-handle resize-nw" @mousedown.stop.prevent="startResize('nw', $event)"></div>
        <div class="resize-handle resize-ne" @mousedown.stop.prevent="startResize('ne', $event)"></div>
        <div class="resize-handle resize-sw" @mousedown.stop.prevent="startResize('sw', $event)"></div>
        <div class="resize-handle resize-se" @mousedown.stop.prevent="startResize('se', $event)"></div>
      </template>

      <div class="plugin-dialog">
        <div
          class="plugin-dialog-header"
          @mousedown="startDrag"
          @dblclick="toggleMaximize"
          title="Drag to move · Double-click to maximize"
        >
          <span class="plugin-dialog-title">{{ dialogData.title }}</span>
          <div class="window-controls">
            <button
              class="window-btn window-btn--minimize"
              type="button"
              @mousedown.stop
              @click="toggleMinimize"
              :aria-label="isMinimized ? 'Restore' : 'Minimize'"
            >
              <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
                <rect width="10" height="1"/>
              </svg>
            </button>
            <button
              class="window-btn window-btn--maximize"
              type="button"
              @mousedown.stop
              @click="toggleMaximize"
              :aria-label="isMaximized ? 'Restore' : 'Maximize'"
            >
              <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="0.5" y="0.5" width="9" height="9"/>
              </svg>
              <svg v-else width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="2.5" y="0.5" width="7" height="7"/>
                <rect x="0.5" y="2.5" width="7" height="7" fill="var(--color-surface)"/>
              </svg>
            </button>
            <button
              v-if="isClosable"
              class="window-btn window-btn--close"
              type="button"
              @mousedown.stop
              @click="closeDialog"
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.2">
                <line x1="0" y1="0" x2="10" y2="10"/>
                <line x1="10" y1="0" x2="0" y2="10"/>
              </svg>
            </button>
          </div>
        </div>
        <div
          v-show="!isMinimized"
          class="plugin-dialog-content"
          ref="dialogContent"
          v-html="dialogData.content"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { api } from '@/lib/api';
import { usePluginMiniBar } from '@/composables/use-plugin-mini-bar';

interface PluginDialogData {
  pluginId: string;
  dialogId?: string;
  title: string;
  content: string;
  options: Record<string, any>;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const DRAG_MARGIN = 40;

const pluginMiniBar = usePluginMiniBar();

const show = ref(false);
const dialogData = ref<PluginDialogData>({
  pluginId: '',
  title: '',
  content: '',
  options: {}
});
const dialogContent = ref<HTMLDivElement | null>(null);
const dialogContainer = ref<HTMLDivElement | null>(null);

// Window state
const isMinimized = ref(false);
const isMaximized = ref(false);

// Drag / position state
const posX = ref(-1); // -1 = not yet positioned (CSS centering)
const posY = ref(-1);
const isDragging = ref(false);
let dragStartMouseX = 0;
let dragStartMouseY = 0;
let dragStartPosX = 0;
let dragStartPosY = 0;

// Resize state
const isResizing = ref(false);
const dialogWidth = ref(0);  // 0 = auto
const dialogHeight = ref(0); // 0 = auto
let resizeEdge = '';
let resizeStartMouseX = 0;
let resizeStartMouseY = 0;
let resizeStartLeft = 0;
let resizeStartTop = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;

let unsubscribe: (() => void) | null = null;

const isClosable = computed(() => {
  return dialogData.value.options.closable !== false;
});

const isPositioned = computed(() => posX.value !== -1);

const containerStyle = computed(() => {
  if (isMaximized.value) {
    return {
      position: 'fixed' as const,
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      transform: 'none',
      borderRadius: '0',
    };
  }

  const style: Record<string, string> = {};

  if (isPositioned.value) {
    style.left = posX.value + 'px';
    style.top = posY.value + 'px';
    style.transform = 'none';
  }

  if (dialogWidth.value > 0) {
    style.width = dialogWidth.value + 'px';
  }

  if (!isMinimized.value && dialogHeight.value > 0) {
    style.height = dialogHeight.value + 'px';
  }

  return style;
});

const getClampedPos = (x: number, y: number) => {
  const el = dialogContainer.value;
  if (!el) return { x, y };
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.min(Math.max(x, DRAG_MARGIN - w), vw - DRAG_MARGIN),
    y: Math.min(Math.max(y, DRAG_MARGIN - h), vh - DRAG_MARGIN)
  };
};

const reCenter = () => {
  posX.value = -1;
  posY.value = -1;
};

const capturePosition = () => {
  if (!isPositioned.value) {
    const el = dialogContainer.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    posX.value = rect.left;
    posY.value = rect.top;
    if (dialogWidth.value === 0) dialogWidth.value = rect.width;
    if (dialogHeight.value === 0) dialogHeight.value = rect.height;
  }
};

const startDrag = (event: MouseEvent) => {
  if (isResizing.value || isMaximized.value) return;

  capturePosition();

  isDragging.value = true;
  dragStartMouseX = event.clientX;
  dragStartMouseY = event.clientY;
  dragStartPosX = posX.value;
  dragStartPosY = posY.value;

  event.preventDefault();
};

const startResize = (edge: string, event: MouseEvent) => {
  if (isMaximized.value || isMinimized.value) return;

  capturePosition();

  isResizing.value = true;
  resizeEdge = edge;
  resizeStartMouseX = event.clientX;
  resizeStartMouseY = event.clientY;
  resizeStartLeft = posX.value;
  resizeStartTop = posY.value;

  const el = dialogContainer.value;
  resizeStartWidth = el ? el.offsetWidth : dialogWidth.value || MIN_WIDTH;
  resizeStartHeight = el ? el.offsetHeight : dialogHeight.value || MIN_HEIGHT;

  event.preventDefault();
};

const onMouseMove = (event: MouseEvent) => {
  if (isResizing.value) {
    const dx = event.clientX - resizeStartMouseX;
    const dy = event.clientY - resizeStartMouseY;

    if (resizeEdge.includes('e')) {
      dialogWidth.value = Math.max(MIN_WIDTH, resizeStartWidth + dx);
    }
    if (resizeEdge.includes('w')) {
      const newWidth = Math.max(MIN_WIDTH, resizeStartWidth - dx);
      posX.value = resizeStartLeft + (resizeStartWidth - newWidth);
      dialogWidth.value = newWidth;
    }
    if (resizeEdge.includes('s')) {
      dialogHeight.value = Math.max(MIN_HEIGHT, resizeStartHeight + dy);
    }
    if (resizeEdge.includes('n')) {
      const newHeight = Math.max(MIN_HEIGHT, resizeStartHeight - dy);
      posY.value = resizeStartTop + (resizeStartHeight - newHeight);
      dialogHeight.value = newHeight;
    }
    return;
  }

  if (!isDragging.value) return;
  const dx = event.clientX - dragStartMouseX;
  const dy = event.clientY - dragStartMouseY;
  const clamped = getClampedPos(dragStartPosX + dx, dragStartPosY + dy);
  posX.value = clamped.x;
  posY.value = clamped.y;
};

const onMouseUp = () => {
  isResizing.value = false;
  isDragging.value = false;
};

const onWindowResize = () => {
  if (!isPositioned.value) return;
  const clamped = getClampedPos(posX.value, posY.value);
  posX.value = clamped.x;
  posY.value = clamped.y;
};

const toggleMinimize = () => {
  if (isMaximized.value) {
    isMaximized.value = false;
  }
  if (!show.value) return;
  show.value = false;
  pluginMiniBar.activate(dialogData.value.title, () => {
    show.value = true;
    isMinimized.value = false;
  });
};

const toggleMaximize = () => {
  if (isMinimized.value) {
    isMinimized.value = false;
  }
  isMaximized.value = !isMaximized.value;
};

const handlePluginDialog = async (data: PluginDialogData) => {
  pluginMiniBar.deactivate();
  dialogData.value = data;
  show.value = true;
  isMinimized.value = false;
  isMaximized.value = false;
  reCenter();
  dialogWidth.value = 0;
  dialogHeight.value = 0;

  // Send initial server state to plugin
  try {
    const currentState = await api.getServerState();
    window.postMessage({
      type: 'server-state-update',
      state: currentState
    }, '*');
  } catch (error) {
    console.warn('Failed to get initial server state for plugin:', error);
  }

  // Execute scripts after DOM is updated
  nextTick(() => {
    executeScripts();
  });
};

const executeScripts = () => {
  const contentEl = dialogContent.value;
  if (!contentEl) return;

  // Find all script tags in the content
  const scripts = contentEl.querySelectorAll('script');
  scripts.forEach((oldScript) => {
    const newScript = document.createElement('script');

    // Copy attributes
    Array.from(oldScript.attributes).forEach((attr) => {
      newScript.setAttribute(attr.name, attr.value);
    });

    // Copy script content
    newScript.textContent = oldScript.textContent;

    // Replace old script with new one to trigger execution
    oldScript.parentNode?.replaceChild(newScript, oldScript);
  });
};

const closeDialog = (response: any = null) => {
  // Send response back to server if dialogId exists
  if (dialogData.value.dialogId) {
    api.sendWebSocketMessage('plugin-dialog-response', {
      dialogId: dialogData.value.dialogId,
      response
    });
  }
  show.value = false;
  isMinimized.value = false;
  isMaximized.value = false;
  pluginMiniBar.deactivate();
};

const handlePostMessage = (event: MessageEvent) => {
  if (!event.data || !event.data.type) return;

  // Handle close dialog message
  if (event.data.type === 'close-plugin-dialog') {
    closeDialog(event.data.data);
    return;
  }

  // Forward plugin-specific messages to the backend
  if (dialogData.value.pluginId && event.data.type === 'plugin-message') {
    // Extract the inner data object and forward that to the plugin via WebSocket
    api.sendWebSocketMessage(`plugin:${dialogData.value.pluginId}:message`, event.data.data);
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && show.value && isClosable.value) {
    closeDialog();
  }
};

let serverStateUnsubscribe: (() => void) | null = null;
let cncDataUnsubscribe: (() => void) | null = null;
let closeDialogUnsubscribe: (() => void) | null = null;

const forwardServerState = (state: any) => {
  if (!show.value) return;

  // Forward server state updates to plugin dialog via postMessage
  window.postMessage({
    type: 'server-state-update',
    state: state
  }, '*');
};

const forwardCNCData = (data: any) => {
  if (!show.value) return;

  // Forward cnc-data to plugin dialog via postMessage
  window.postMessage({
    type: 'cnc-data',
    data: data
  }, '*');
};

const handleCloseDialog = (data: { dialogId: string }) => {
  // Close dialog if it matches the current dialog (multi-client sync)
  if (dialogData.value.dialogId === data.dialogId) {
    show.value = false;
    pluginMiniBar.deactivate();
  }
};

onMounted(() => {
  // Listen for plugin:show-dialog events from WebSocket
  unsubscribe = api.on('plugin:show-dialog', handlePluginDialog);

  // Subscribe to server state updates and forward to plugin
  serverStateUnsubscribe = api.onServerStateUpdated(forwardServerState);

  // Subscribe to cnc-data events and forward to plugin
  cncDataUnsubscribe = api.on('cnc-data', forwardCNCData);

  // Listen for close-dialog events (multi-client sync)
  closeDialogUnsubscribe = api.on('plugin:close-dialog', handleCloseDialog);

  // Listen for postMessage events from dialog iframe
  window.addEventListener('message', handlePostMessage);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  pluginMiniBar.deactivate();
  if (unsubscribe) {
    unsubscribe();
  }
  if (serverStateUnsubscribe) {
    serverStateUnsubscribe();
  }
  if (cncDataUnsubscribe) {
    cncDataUnsubscribe();
  }
  if (closeDialogUnsubscribe) {
    closeDialogUnsubscribe();
  }
  window.removeEventListener('message', handlePostMessage);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('resize', onWindowResize);
});
</script>

<style scoped>
.plugin-dialog-root {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  z-index: 9999;
}

.plugin-dialog-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-surface);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08);
  min-width: 320px;
  min-height: 200px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
}

.plugin-dialog-container.is-minimized {
  min-height: unset;
  height: auto !important;
  overflow: visible;
}

.plugin-dialog-container.is-maximized {
  border-radius: 0;
  max-height: 100vh;
}

.plugin-dialog-container.is-dragging,
.plugin-dialog-container.is-resizing {
  user-select: none;
}

/* Corner resize handles */
.resize-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  z-index: 10;
}

.resize-nw {
  top: -4px;
  left: -4px;
  cursor: nw-resize;
}

.resize-ne {
  top: -4px;
  right: -4px;
  cursor: ne-resize;
}

.resize-sw {
  bottom: -4px;
  left: -4px;
  cursor: sw-resize;
}

.resize-se {
  bottom: -4px;
  right: -4px;
  cursor: se-resize;
}

.plugin-dialog {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.plugin-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0 0 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  height: 38px;
  background: var(--color-surface-muted);
  border-radius: 8px 8px 0 0;
}

.plugin-dialog-container.is-maximized .plugin-dialog-header {
  border-radius: 0;
}

.plugin-dialog-container.is-minimized .plugin-dialog-header {
  border-radius: 8px;
  border-bottom: none;
}

.plugin-dialog-container.is-dragging .plugin-dialog-header {
  cursor: grabbing;
}

.plugin-dialog-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.window-controls {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
}

.window-btn {
  width: 46px;
  height: 38px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
  border-radius: 0;
}

.window-btn:hover {
  background: var(--color-border);
  color: var(--color-text-primary);
}

.window-btn--close:hover {
  background: #c42b1c;
  color: #fff;
}

.window-btn:last-child {
  border-radius: 0 8px 0 0;
}

.plugin-dialog-container.is-maximized .window-btn:last-child {
  border-radius: 0;
}

.plugin-dialog-container.is-minimized .window-btn:last-child {
  border-radius: 0 8px 8px 0;
}

.plugin-dialog-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  color: var(--color-text-primary);
}

.plugin-dialog-content :deep(h1),
.plugin-dialog-content :deep(h2),
.plugin-dialog-content :deep(h3),
.plugin-dialog-content :deep(h4),
.plugin-dialog-content :deep(h5),
.plugin-dialog-content :deep(h6) {
  margin-top: 0;
  color: var(--color-text-primary);
}

.plugin-dialog-content :deep(p) {
  margin: var(--gap-sm) 0;
  line-height: 1.5;
}

.plugin-dialog-content :deep(pre) {
  background: var(--color-surface-muted);
  padding: var(--gap-sm);
  border-radius: var(--radius-small);
  overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
}

.plugin-dialog-content :deep(button) {
  background: var(--color-accent);
  color: white;
  border: none;
  padding: var(--gap-sm) var(--gap-md);
  border-radius: var(--radius-small);
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s ease;
}

.plugin-dialog-content :deep(button:hover) {
  opacity: 0.9;
}
</style>
