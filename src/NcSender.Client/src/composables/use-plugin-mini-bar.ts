import { ref } from 'vue';

const show = ref(false);
const title = ref('');
let restoreCallback: (() => void) | null = null;

export function usePluginMiniBar() {
  const activate = (pluginTitle: string, onRestore: () => void) => {
    title.value = pluginTitle;
    restoreCallback = onRestore;
    show.value = true;
  };

  const deactivate = () => {
    show.value = false;
    title.value = '';
    restoreCallback = null;
  };

  const restore = () => {
    if (restoreCallback) restoreCallback();
    deactivate();
  };

  return { show, title, activate, deactivate, restore };
}
