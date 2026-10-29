import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { frappe } from "../lib/api/frappeClient";
import { errMsg } from "../lib/employeePortal";

const VIEW = 280; // crop window size on screen (px)
const OUT = 512; // saved photo size (px)
const MAX_SOURCE = 10 * 1024 * 1024; // the photo is resized before upload, so the source may be larger

/** Display name for the signed-in account: ERPNext full name, falling back to the email. */
export function displayName(user) {
  return user?.fullName || user?.email || "";
}

export function initials(name) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Round avatar of the signed-in user. With `editable`, clicking it picks a new photo,
 * opens the crop window and saves the cropped photo to the ERPNext User after confirmation.
 */
export function ProfileAvatar({ size = 40, editable = false, className = "" }) {
  const { user } = useAuth();
  const [source, setSource] = useState(null);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState("");
  const fileRef = useRef(null);
  const name = displayName(user);
  const image = user?.userImage && failed !== user.userImage ? user.userImage : "";

  function pick(file) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Choose an image file for your profile photo.");
    if (file.size > MAX_SOURCE) return setError("Profile photos must be 10 MB or smaller.");
    setSource(file);
  }

  const face = (
    <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[var(--color-red-wash)] font-semibold text-[var(--color-red-hover)]" style={{ fontSize: Math.max(10, size * 0.36) }}>
      {image ? <img src={image} alt="" className="h-full w-full object-cover" onError={() => setFailed(user.userImage)} /> : initials(name)}
    </span>
  );

  if (!editable) {
    return <span className={`inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>{face}</span>;
  }

  return (
    <span className={`inline-flex shrink-0 flex-col items-start ${className}`}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title="Change profile photo"
        aria-label="Change profile photo"
        className="group relative shrink-0 rounded-full ring-2 ring-transparent transition hover:ring-[var(--color-red)] focus-visible:outline-none focus-visible:ring-[var(--color-red)]"
        style={{ width: size, height: size }}
      >
        {face}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera size={Math.max(12, size * 0.34)} />
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-red)] text-white" style={{ width: Math.max(16, size * 0.36), height: Math.max(16, size * 0.36) }}>
          <Camera size={Math.max(9, size * 0.18)} />
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {error && <span role="alert" className="mt-1.5 max-w-48 text-[11px] text-[var(--color-red-hover)]">{error}</span>}
      {source && <CropDialog file={source} onClose={() => setSource(null)} />}
    </span>
  );
}

/** Drag to position, slider to zoom, then "Save photo" uploads a square JPEG and sets it as the User image. */
function CropDialog({ file, onClose }) {
  const { user, setProfileImage } = useAuth();
  const [url, setUrl] = useState("");
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imgRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const scale = natural ? (VIEW / Math.min(natural.w, natural.h)) * zoom : 1;
  const dw = natural ? natural.w * scale : VIEW;
  const dh = natural ? natural.h * scale : VIEW;
  const clamp = (o) => ({
    x: Math.max(-(dw - VIEW) / 2, Math.min((dw - VIEW) / 2, o.x)),
    y: Math.max(-(dh - VIEW) / 2, Math.min((dh - VIEW) / 2, o.y)),
  });
  const pos = clamp(offset);
  const left = (VIEW - dw) / 2 + pos.x;
  const top = (VIEW - dh) / 2 + pos.y;

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: pos };
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    const d = drag.current;
    setOffset(clamp({ x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y }));
  }
  function onPointerUp() { drag.current = null; }
  function onWheel(e) { setZoom((z) => Math.min(3, Math.max(1, z - e.deltaY * 0.0015))); }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      const k = OUT / VIEW;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgRef.current, left * k, top * k, dw * k, dh * k);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not prepare the photo.");
      const cropped = new File([blob], `profile-${Date.now()}.jpg`, { type: "image/jpeg" });
      const uploaded = await frappe.uploadFile(cropped, { doctype: "User", docname: user.email, isPrivate: false });
      if (!uploaded?.file_url) throw new Error("The photo upload did not return a file URL.");
      const saved = await frappe.updateDoc("User", user.email, { user_image: uploaded.file_url });
      setProfileImage(saved?.user_image || uploaded.file_url);
      onClose();
    } catch (err) {
      setError(errMsg(err, "Could not update your profile photo. Check your account permissions."));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Crop profile photo" className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Crop profile photo</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50"><X size={16} /></button>
        </div>

        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-lg bg-[var(--color-surface-2)] active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {url && (
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute max-w-none"
              style={{ width: dw, height: dh, left, top, visibility: natural ? "visible" : "hidden" }}
            />
          )}
          {/* Darken everything outside the circle that will be shown as the avatar. */}
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
          <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" />
        </div>

        <div className="mt-4 flex items-center gap-3 text-[var(--color-text-muted)]">
          <ZoomOut size={15} />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-[var(--color-red)]" />
          <ZoomIn size={15} />
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--color-text-faint)]">Drag to position · scroll or use the slider to zoom</p>

        {error && <p role="alert" className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-[var(--color-border-strong)] px-3.5 py-2 text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !natural} className="flex items-center gap-2 rounded-md bg-[var(--color-red)] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-red-hover)] disabled:opacity-60">
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
