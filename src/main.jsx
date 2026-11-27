import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { applySavedTheme } from "./lib/theme";

applySavedTheme();

// Clickjacking guard (BUG-001): the app never runs inside another site's frame. The server's X-Frame-Options /
// CSP frame-ancestors headers (deploy/nginx) block this too; this covers servers that don't send them yet.
function framedByAnotherSite() {
  if (window.top === window.self) return false;
  try {
    return window.top.location.origin !== window.location.origin;
  } catch {
    return true; // reading a cross-origin parent throws
  }
}

const root = createRoot(document.getElementById("root"));
if (framedByAnotherSite()) {
  root.render(<p style={{ font: "14px system-ui, sans-serif", padding: 24 }}>HRMS 360 can't be shown inside another website. <a href={window.location.href} target="_top" rel="noopener">Open it directly</a>.</p>);
} else {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}
