// Text out of CVs and JDs, in the browser, without extra libraries (REP-02, MATCH-01).
//  - .docx: a zip of XML; unzipped with the browser's DecompressionStream.
//  - .pdf: text-based PDFs (Word / Google Docs exports and most generated CVs), including compressed streams, object
//    streams and fonts with a ToUnicode map. Scanned (image-only) PDFs have no text: they come back empty and the
//    caller queues them for manual review. Password-protected PDFs are refused with a reason.
//  - .doc (old Word) and .txt: best effort.

export const MAX_CV_MB = 10;

export class CvError extends Error {}

// Decompress, keeping what was decoded even when junk follows the compressed data (common in PDFs, where the
// stream is followed by a line break before "endstream"); browsers reject that as an error at the very end.
async function inflate(bytes, format) {
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } catch (e) {
    if (!total) throw e;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
const latin1 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s; };
const tidy = (s) => s.replace(/\r/g, "").replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** SHA-256 of the file, to spot the same CV uploaded again (REP-04). */
export async function fingerprint(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ----------------------------------- docx ----------------------------------- */

async function unzip(bytes, wanted) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new CvError("The file is damaged (not a valid Word document).");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = {};
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n += 1) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const local = view.getUint32(p + 42, true);
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    out[name] = method === 0 ? data : await inflate(data, "deflate-raw");
  }
  return out;
}

const xmlText = (xml) => xml
  .replace(/<w:tab\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<\/w:tc>/g, "\t")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&");

async function docxText(bytes) {
  const parts = await unzip(bytes, (n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  if (!parts["word/document.xml"]) throw new CvError("This Word file has no document body (it may be damaged).");
  const dec = new TextDecoder();
  // Headers first: CVs often put the name and contact details there.
  const order = Object.keys(parts).sort((a, b) => (a.includes("document") ? 1 : 0) - (b.includes("document") ? 1 : 0));
  return order.map((k) => xmlText(dec.decode(parts[k]))).join("\n");
}

/* ------------------------------------ pdf ------------------------------------ */

function parseCmap(text) {
  const map = new Map();
  let bytes = 1;
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
  if (space) bytes = Math.max(1, space[1].length / 2);
  const hexStr = (h) => { let s = ""; for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); if (h.length % 4 === 2) s += String.fromCharCode(parseInt(h.slice(-2), 16)); return s; };
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(m[1], 16), hexStr(m[2]));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (hi - lo > 5000) continue;
      if (m[4] !== undefined) {
        const base = parseInt(m[4].slice(-4) || "0", 16);
        const prefix = hexStr(m[4].slice(0, -4));
        for (let c = lo; c <= hi; c += 1) map.set(c, prefix + String.fromCharCode(base + c - lo));
      } else {
        [...m[5].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((x, i) => map.set(lo + i, hexStr(x[1])));
      }
    }
  }
  return { map, bytes };
}

function literal(src, i) {
  // src[i] === "(" ; returns [bytes as latin1 string, next index]
  let depth = 1;
  let out = "";
  i += 1;
  while (i < src.length && depth) {
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1];
      const esc = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      if (n in esc) { out += esc[n]; i += 2; } else if (/[0-7]/.test(n)) { const m = /^[0-7]{1,3}/.exec(src.slice(i + 1, i + 4))[0]; out += String.fromCharCode(parseInt(m, 8)); i += 1 + m.length; } else if (n === "\r" || n === "\n") { i += n === "\r" && src[i + 2] === "\n" ? 3 : 2; } else { out += n || ""; i += 2; }
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") { depth -= 1; if (!depth) break; }
    out += c;
    i += 1;
  }
  return [out, i + 1];
}

function decodeWith(font, raw) {
  if (!font) return raw.replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
  let s = "";
  for (let i = 0; i < raw.length; i += font.bytes) {
    let code = 0;
    for (let k = 0; k < font.bytes; k += 1) code = code * 256 + (raw.charCodeAt(i + k) || 0);
    s += font.map.has(code) ? font.map.get(code) : font.bytes === 1 ? raw[i] : "";
  }
  return s;
}

function contentText(src, fonts) {
  let out = "";
  let font = null;
  let y = 0; // baseline of the text position
  let lastY = null; // baseline of the last text written
  let breakNext = false;
  const stack = [];
  let i = 0;
  const push = (t) => { out += t; };
  // A new line only when the text actually moved to another baseline (Word starts a text block per run).
  const write = (t) => {
    if (!t) return;
    if (breakNext || (lastY !== null && Math.abs(y - lastY) > 1)) push("\n");
    breakNext = false;
    lastY = y;
    push(t);
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "(") { const [s, n] = literal(src, i); stack.push({ str: s }); i = n; continue; }
    if (c === "<" && src[i + 1] !== "<") {
      const end = src.indexOf(">", i);
      const hex = src.slice(i + 1, end).replace(/\s/g, "");
      let s = "";
      for (let k = 0; k < hex.length; k += 2) s += String.fromCharCode(parseInt(hex.slice(k, k + 2).padEnd(2, "0"), 16));
      stack.push({ str: s });
      i = end + 1;
      continue;
    }
    if (c === "[") { stack.push({ open: true }); i += 1; continue; }
    if (c === "]") {
      const items = [];
      while (stack.length && !stack[stack.length - 1].open) items.unshift(stack.pop());
      stack.pop();
      stack.push({ array: items });
      i += 1;
      continue;
    }
    if (c === "%") { while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i += 1; continue; }
    if (/\s/.test(c)) { i += 1; continue; }
    const m = /^(\/[^\s/<>[\]()]+|[^\s/<>[\]()%]+)/.exec(src.slice(i, i + 64));
    if (!m) { i += 1; continue; }
    const tok = m[1];
    i += tok.length;
    if (tok[0] === "/" || /^[-+]?\d*\.?\d+$/.test(tok)) { stack.push({ tok }); continue; }
    const args = stack.splice(0);
    const num = (k) => Number(args[args.length - k]?.tok || 0);
    switch (tok) {
      case "Tf": font = fonts.get(String(args[args.length - 2]?.tok || "").slice(1)) || null; break;
      case "Tj": case "'": case '"': if (tok !== "Tj") breakNext = true; if (args.length) write(decodeWith(font, args[args.length - 1].str || "")); break;
      case "TJ": { let t = ""; for (const it of args[args.length - 1]?.array || []) { if (it.str !== undefined) t += decodeWith(font, it.str); else if (Number(it.tok) < -180) t += " "; } write(t); break; }
      case "BT": y = 0; break;
      case "Td": case "TD": y += num(1); break;
      case "T*": breakNext = true; break;
      case "Tm": y = num(1); break;
      case "BI": { const end = src.indexOf("EI", i); i = end < 0 ? src.length : end + 2; break; } // inline image
      default: break;
    }
  }
  return out;
}

function ascii85(bytes) {
  const s = latin1(bytes).replace(/\s/g, "").replace(/^<~/, "").replace(/~>.*$/, "");
  const out = [];
  let group = [];
  for (const ch of s) {
    if (ch === "z" && !group.length) { out.push(0, 0, 0, 0); continue; }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) {
      const n = group.reduce((acc, d) => acc * 85 + d, 0);
      out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      group = [];
    }
  }
  if (group.length) {
    const pad = 5 - group.length;
    const n = [...group, ...Array(pad).fill(84)].reduce((acc, d) => acc * 85 + d, 0);
    out.push(...[(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].slice(0, 4 - pad));
  }
  return new Uint8Array(out);
}
const asciiHex = (bytes) => { const h = latin1(bytes).replace(/[^0-9a-fA-F]/g, ""); const out = new Uint8Array(Math.ceil(h.length / 2)); for (let i = 0; i < out.length; i += 1) out[i] = parseInt(h.slice(2 * i, 2 * i + 2).padEnd(2, "0"), 16); return out; };

/** Apply a stream's filter chain (e.g. [/ASCII85Decode /FlateDecode] from ReportLab). null when a filter isn't supported. */
async function decodeStream(data, dict) {
  const spec = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1] || "";
  const filters = [...spec.matchAll(/\/(\w+)/g)].map((x) => x[1]);
  let out = data;
  for (const flt of filters) {
    if (flt === "FlateDecode" || flt === "Fl") {
      try { out = await inflate(out, "deflate"); } catch { try { out = await inflate(out.subarray(2), "deflate-raw"); } catch { return null; } }
    } else if (flt === "ASCII85Decode" || flt === "A85") out = ascii85(out);
    else if (flt === "ASCIIHexDecode" || flt === "AHx") out = asciiHex(out);
    else return null;
  }
  return latin1(out);
}

async function pdfText(bytes) {
  const raw = latin1(bytes);
  if (!raw.startsWith("%PDF")) throw new CvError("The file is damaged (not a valid PDF).");
  if (/\/Encrypt\s/.test(raw)) throw new CvError("The PDF is password-protected. Save an unprotected copy and upload that.");
  const objects = new Map(); // num -> { dict, stream (decoded latin1 string) }
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endobj", start);
    const body = raw.slice(start, end < 0 ? undefined : end);
    const s = body.indexOf("stream");
    const obj = { dict: s >= 0 ? body.slice(0, s) : body, stream: null };
    if (s >= 0) {
      let from = start + s + 6;
      if (raw[from] === "\r") from += 1;
      if (raw[from] === "\n") from += 1;
      const stop = raw.indexOf("endstream", from);
      const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(obj.dict); // a direct length, not "/Length 12 0 R"
      let data = bytes.subarray(from, len && from + Number(len[1]) <= (stop < 0 ? bytes.length : stop) ? from + Number(len[1]) : stop < 0 ? undefined : stop);
      if (/\/(DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode)/.test(obj.dict) || /\/Subtype\s*\/Image/.test(obj.dict)) data = null;
      if (data) obj.stream = await decodeStream(data, obj.dict);
    }
    objects.set(Number(m[1]), obj);
  }
  // Objects packed inside object streams (PDF 1.5+): font dictionaries often live there.
  for (const obj of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(obj.dict) || !obj.stream) continue;
    const n = Number(/\/N\s+(\d+)/.exec(obj.dict)?.[1] || 0);
    const first = Number(/\/First\s+(\d+)/.exec(obj.dict)?.[1] || 0);
    const nums = obj.stream.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n; k += 1) {
      const at = first + nums[2 * k + 1];
      const next = k + 1 < n ? first + nums[2 * k + 3] : obj.stream.length;
      if (!objects.has(nums[2 * k])) objects.set(nums[2 * k], { dict: obj.stream.slice(at, next), stream: null });
    }
  }
  const ref = (txt, key) => Number(new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(txt)?.[1] || 0);
  // Resource font name -> its ToUnicode map (names are usually consistent across pages in generated PDFs).
  const fonts = new Map();
  const fontDicts = [];
  for (const obj of objects.values()) {
    for (const fm of obj.dict.matchAll(/\/Font\s*(<<([\s\S]*?)>>|(\d+)\s+\d+\s+R)/g)) fontDicts.push(fm[2] ?? objects.get(Number(fm[3]))?.dict ?? "");
  }
  for (const d of fontDicts) {
    for (const f of d.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      if (fonts.has(f[1])) continue;
      const fontObj = objects.get(Number(f[2]));
      const cm = fontObj && objects.get(ref(fontObj.dict, "ToUnicode"));
      fonts.set(f[1], cm?.stream ? parseCmap(cm.stream) : null);
    }
  }
  const parts = [];
  for (const obj of objects.values()) {
    const s = obj.stream;
    if (!s || !/\bBT\b/.test(s) || !/(Tj|TJ)/.test(s) || /begincmap/.test(s)) continue;
    parts.push(contentText(s, fonts));
  }
  return parts.join("\n");
}

/* ------------------------------------ doc ------------------------------------ */

// Old binary Word: pull out runs of readable text (UTF-16 or single-byte). Good enough for search; flagged for review.
function docText(bytes) {
  const u16 = new TextDecoder("utf-16le").decode(bytes).match(/[\x20-\x7e -ɏ\r\n\t]{4,}/g) || [];
  const u8 = latin1(bytes).match(/[\x20-\x7e\r\n\t]{6,}/g) || [];
  const best = u16.join(" ").length > u8.join(" ").length ? u16 : u8;
  return best.filter((r) => /[a-zA-Z]{3}/.test(r)).join("\n");
}

/**
 * { text, hash, quality } for a CV / JD file. quality: "good", or "low" when little text came out (scanned PDF,
 * old .doc) - the caller marks those Needs Review. Throws CvError with a reason the user can act on.
 */
export async function readDocument(file) {
  if (file.size > MAX_CV_MB * 1024 * 1024) throw new CvError(`The file is larger than ${MAX_CV_MB} MB.`);
  if (!file.size) throw new CvError("The file is empty.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith(".pdf")) text = await pdfText(bytes);
  else if (name.endsWith(".docx")) text = await docxText(bytes);
  else if (name.endsWith(".doc")) text = docText(bytes);
  else if (name.endsWith(".txt")) text = new TextDecoder().decode(bytes);
  else throw new CvError("Unsupported file type. Use PDF or Word (.docx).");
  text = tidy(text);
  const words = (text.match(/[A-Za-z]{2,}/g) || []).length;
  return { text, hash: await fingerprint(buffer), quality: words >= 40 && !name.endsWith(".doc") ? "good" : "low" };
}
