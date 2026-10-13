import { useEffect, useRef, useState } from "react";

const LIGHT_THEMES = new Set(["daylight", "pink"]);
const FALLBACK_LOGO = "/ethx-logo.svg";

export function AdaptiveLogo({ src, alt, className = "" }) {
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
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);

      try {
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = frame.data;
        const isLight = LIGHT_THEMES.has(document.documentElement.dataset.theme);
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] === 0) continue;
          const low = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
          const high = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
          if (high - low > 20) continue;

          if (isLight && low >= 232) {
            pixels[i] = 0;
            pixels[i + 1] = 0;
            pixels[i + 2] = 0;
          } else if (!isLight && high <= 28) {
            pixels[i] = 255;
            pixels[i + 1] = 255;
            pixels[i + 2] = 255;
          }
        }
        context.putImageData(frame, 0, 0);
      } catch {
        // Cross-origin logos stay unmodified when the browser blocks pixel access.
      }
    }

    image.onload = render;
    image.onerror = () => {
      if (disposed) return;
      if (imageSource !== FALLBACK_LOGO) setFailedSource(src);
      else setUnavailableSource(src);
    };
    image.src = imageSource;
    if (image.complete && image.naturalWidth) render();

    const observer = new MutationObserver(render);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [src, imageSource]);

  if (unavailableSource === src) return <img src={imageSource} alt={alt} className={className} />;
  return <canvas ref={canvasRef} role="img" aria-label={alt} className={className} />;
}