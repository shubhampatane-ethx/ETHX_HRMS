// Applies the last-used theme before the first paint, so a light theme never flashes dark (BUG-007).
try { var t = localStorage.getItem("ethx:lastTheme"); if (t && /^[a-z0-9-]+$/i.test(t)) document.documentElement.setAttribute("data-theme", t); } catch (e) { /* storage blocked */ }
