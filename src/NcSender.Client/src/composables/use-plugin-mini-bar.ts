import { ref } from 'vue';

const show = ref(false);
const title = ref('');
let _restoreCallback: (() => void) | null = null;

export function usePluginMiniBar() {
  const activate = (pluginTitle: string, onRestore: () => void) => {
    title.value = pluginTitle;
    _restoreCallback = onRestore;
    show.value = true;
  };

  const deactivate = () => {
    show.value = false;
    title.value = '';
    _restoreCallback = null;
  };

  const restore = () => {
    if (_restoreCallback) _restoreCallback();
    deactivate();
  };

  return { show, title, activate, deactivate, restore };
}
