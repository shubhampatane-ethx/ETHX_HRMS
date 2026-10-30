import { useEffect, useRef, useState } from "react";

const LIGHT_THEMES = new Set(["daylight", "pink"]);
const FALLBACK_LOGO = "/ethx-logo.svg";
const MAX_SIDE = 1200; // big uploads are scaled down before processing

/**
 * Any uploaded logo, made to fit and to match the theme:
 *  - a solid background around the logo (white box, black box…) is removed, so it sits on the theme's colours;
 *  - empty margins are trimmed, so every logo fills the space it is given the same way;
 *  - black / white artwork (text, outlines) is flipped to stay readable on dark or light themes.
 * `mode` forces "light" or "dark" (previews); by default it follows the active theme.
 */
export function AdaptiveLogo({ src, alt, className = "", mode = "auto" }) {
  const canvasRef = useRef(null);
  const [failedSource, setFailedSource] = useState("");
  const [unavailableSource, setUnavailableSource] = useState("");
  const imageSource = failedSource === src ? FALLBACK_LOGO : src;

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = new Image();
    let disposed = false;

    function render() {
      if (disposed || !canvas || !image.naturalWidth) return;
      const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      const work = document.createElement("canvas");
      work.width = w;
      work.height = h;
      const ctx = work.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, w, h);

      let frame;
      try {
        frame = ctx.getImageData(0, 0, w, h);
      } catch {
        // Cross-origin logo: the browser won't let us read pixels - show it as it is.
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(work, 0, 0);
        return;
      }
      const px = frame.data;
      removeBackground(px, w, h);
      const isLight = mode === "light" || (mode === "auto" && LIGHT_THEMES.has(document.documentElement.dataset.theme));
      recolor(px, isLight);
      ctx.putImageData(frame, 0, 0);

      const box = contentBox(px, w, h);
      canvas.width = box.w;
      canvas.height = box.h;
      const out = canvas.getContext("2d");
      out.clearRect(0, 0, box.w, box.h);
      out.drawImage(work, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    }

    if (/^https?:/i.test(imageSource) && !imageSource.startsWith(window.location.origin)) image.crossOrigin = "anonymous";
    image.onload = render;
    image.onerror = () => {
      if (disposed) return;
      if (imageSource !== FALLBACK_LOGO) setFailedSource(src);
      else setUnavailableSource(src);
    };
    image.src = imageSource;
    if (image.complete && image.naturalWidth) render();

    const observer = mode === "auto" ? new MutationObserver(render) : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [src, imageSource, mode]);

  if (unavailableSource === src) return <img src={imageSource} alt={alt} className={className} />;
  return <canvas ref={canvasRef} role="img" aria-label={alt} className={className} />;
}

const near = (px, i, c, tol) => Math.abs(px[i] - c[0]) <= tol && Math.abs(px[i + 1] - c[1]) <= tol && Math.abs(px[i + 2] - c[2]) <= tol;

/** If the logo sits on a solid opaque background, clear that background from the edges inwards (flood fill). */
function removeBackground(px, w, h) {
  const tol = 28;
  const edge = [];
  for (let x = 0; x < w; x += 1) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y += 1) edge.push(y * w, y * w + w - 1);
  const first = edge[0] * 4;
  if (px[first + 3] < 250) return; // already transparent around the edges
  const bg = [px[first], px[first + 1], px[first + 2]];
  const same = edge.filter((p) => px[p * 4 + 3] >= 250 && near(px, p * 4, bg, tol)).length;
  if (same < edge.length * 0.9) return; // no single background colour: a photo-like logo, leave it
  const seen = new Uint8Array(w * h);
  const stack = edge.filter((p) => near(px, p * 4, bg, tol));
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (px[i + 3] < 250 || !near(px, i, bg, tol)) continue;
    px[i + 3] = 0;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
}

/** Black artwork turns white on dark themes and white artwork turns black on light themes; colours are kept. */
function recolor(px, isLight) {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const low = Math.min(px[i], px[i + 1], px[i + 2]);
    const high = Math.max(px[i], px[i + 1], px[i + 2]);
    if (high - low > 20) continue;
    if (isLight && low >= 232) px[i] = px[i + 1] = px[i + 2] = 0;
    else if (!isLight && high <= 28) px[i] = px[i + 1] = px[i + 2] = 255;
  }
}

/** Smallest box around the visible artwork (plus a hair of padding), so empty margins don't shrink the logo. */
function contentBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (px[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(w, x1 + pad + 1) - x, h: Math.min(h, y1 + pad + 1) - y };
}
