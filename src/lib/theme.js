export const THEME_OPTIONS = [
  {
    id: "ember",
    name: "Ember",
    detail: "Charcoal surfaces with a vivid red accent",
    swatches: ["#0a0a0c", "#f20d32", "#f2f2f4"],
  },
  {
    id: "daylight",
    name: "Daylight",
    detail: "Bright surfaces with a warm red accent",
    swatches: ["#f3f5f4", "#bf1232", "#202722"],
  },
  {
    id: "evergreen",
    name: "Evergreen",
    detail: "Deep green surfaces with a mint accent",
    swatches: ["#0b1412", "#00b77b", "#e8f1ec"],
  },
  {
    id: "pink",
    name: "Pink",
    detail: "Baby pink surfaces with a deep rose accent",
    swatches: ["#ffc2c6", "#ad1038", "#2e0d12"],
  },
];

// Themes with light surfaces: they show the company's light-theme logo, the others its dark-theme logo.
const LIGHT_THEMES = new Set(["daylight", "pink"]);
export const isLightTheme = (id) => LIGHT_THEMES.has(id);

const DEFAULT_THEME = THEME_OPTIONS[0].id;
const isTheme = (value) => THEME_OPTIONS.some((theme) => theme.id === value);
const themeKey = (company) => company ? `hrms-theme:${company}` : "hrms-theme";

export function getSavedTheme(company) {
  try {
    const saved = localStorage.getItem(themeKey(company));
    if (saved) { try { localStorage.setItem("ethx:lastTheme", saved); } catch { /* storage blocked */ } }
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function hasSavedTheme(scope) {
  if (!scope) return false;
  try {
    return isTheme(localStorage.getItem(themeKey(scope)));
  } catch {
    return false;
  }
}

export function applySavedTheme(company) {
  document.documentElement.dataset.theme = getSavedTheme(company);
}

export function saveTheme(value, company) {
  const theme = isTheme(value) ? value : DEFAULT_THEME;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(themeKey(company), theme);
    try { localStorage.setItem("ethx:lastTheme", theme); } catch { /* storage blocked */ }
  } catch {
    // Keep the selected theme active for this session if storage is unavailable.
  }
  return theme;
}