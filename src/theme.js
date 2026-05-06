import { readThemePreference, setThemePreference } from "./taskEngine.js";

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_MODES = new Set(["system", "light", "dark"]);

const mediaQuery = window.matchMedia(SYSTEM_DARK_QUERY);
let currentPreference = "system";

export async function initThemeControl(select) {
  currentPreference = await readThemePreference();
  applyTheme(currentPreference);

  if (select) {
    select.value = currentPreference;
    select.addEventListener("change", async () => {
      currentPreference = THEME_MODES.has(select.value) ? select.value : "system";
      applyTheme(currentPreference);
      await setThemePreference(currentPreference);
    });
  }

  mediaQuery.addEventListener("change", () => {
    if (currentPreference === "system") applyTheme(currentPreference);
  });
}

function applyTheme(preference) {
  const resolved = preference === "system" ? (mediaQuery.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}
