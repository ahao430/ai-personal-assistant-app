import { ref } from "vue";

const isDesktop = ref(false);
let initialized = false;

function detectDesktop(): boolean {
  try {
    return (
      "__TAURI_INTERNALS__" in window && !/android/i.test(navigator.userAgent)
    );
  } catch {
    return false;
  }
}

export function useLayoutMode() {
  if (!initialized) {
    isDesktop.value = detectDesktop();
    initialized = true;
  }

  function toggle() {
    isDesktop.value = !isDesktop.value;
  }

  return { isDesktop, toggle };
}
