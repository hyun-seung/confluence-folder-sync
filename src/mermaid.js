const MERMAID_RENDER_REVISION = "mermaid-12.3.0-local-v1";
const MERMAID_ERROR = "Mermaid could not be rendered locally. Check the syntax and limits, or select source code mode.";
const mermaidRenderers = new WeakMap();

function checkMermaidSource(source) {
  // Configuration, HTML, image/icon and interactive directives are unsupported.
  // CSP remains the network boundary even for unforeseen syntax.
  if (source.length > 20_000 || source.split("\n").length > 500 ||
      source.split(/[^\p{L}\p{N}_]+/u).filter(Boolean).length > 600 ||
      (source.match(/-->|---|==>|-\.->|->>|-->>|<\|--|o--|\*--/g) ?? []).length > 200 ||
      /%%\{|^\s*---|<\/?[a-z!]|\b(?:href|image|icon|img|javascript|https?):|^\s*click\s|@\{|\$\$/im.test(source) ||
      !/^\s*(?:%%[^\n]*\n\s*)*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram)\b/.test(source)) throw new SyncError(MERMAID_ERROR);
}

class LocalMermaid {
  constructor() { this.cache = new Map(); this.bytes = 0; this.jobs = new Set(); this.disposed = false; }
  async render(source) {
    checkMermaidSource(source);
    if (this.disposed || typeof document === "undefined") throw new SyncError(MERMAID_ERROR);
    const key = await digest(MERMAID_RENDER_REVISION + "\n" + source);
    if (this.disposed) throw new SyncError(MERMAID_ERROR);
    if (this.cache.has(key)) return this.cache.get(key);
    const data = await this.renderFrame(source);
    const hash = await digest(data);
    const asset = { data, hash, name: "cfs-" + hash.slice(0, 24) + "-mermaid.png" };
    if (this.disposed) throw new SyncError(MERMAID_ERROR);
    while (this.cache.size >= 32 || this.bytes + data.byteLength > 32 * 1024 * 1024) {
      const first = this.cache.keys().next().value;
      if (first === undefined) break;
      this.bytes -= this.cache.get(first).data.byteLength; this.cache.delete(first);
    }
    this.cache.set(key, asset); this.bytes += data.byteLength;
    return asset;
  }
  renderFrame(source) {
    if (this.disposed) return Promise.reject(new SyncError(MERMAID_ERROR));
    return new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts"); frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:800px;visibility:hidden;pointer-events:none";
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, "0")).join("");
      const channel = new MessageChannel();
      const cleanup = () => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); frame.remove(); this.jobs.delete(cancel); };
      const cancel = () => { cleanup(); reject(new SyncError(MERMAID_ERROR)); };
      const timer = setTimeout(cancel, 15_000); this.jobs.add(cancel);
      channel.port1.onmessage = event => {
        const { data, width, height, isolated } = event.data ?? {};
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : null;
        if (isolated !== true || !bytes || bytes.length < 24 || bytes.length > 8 * 1024 * 1024 ||
            ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) ||
            !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
            width > 4096 || height > 4096 || width * height > 8_000_000) return cancel();
        cleanup(); resolve(data);
      };
      frame.onload = () => frame.contentWindow?.postMessage({ source }, "*", [channel.port2]);
      frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;nonce-' + nonce +
        '&apos;; style-src &apos;unsafe-inline&apos;; img-src data: blob:; font-src &apos;none&apos;; connect-src &apos;none&apos;; object-src &apos;none&apos;; base-uri &apos;none&apos;; form-action &apos;none&apos;"><body><script nonce="' + nonce + '">' +
        MERMAID_FRAME_SOURCE.replace(/<\/script/gi, "<\\/script") + '</script></body>';
      document.body.append(frame);
    });
  }
  dispose() {
    this.disposed = true;
    for (const cancel of [...this.jobs]) cancel();
    this.cache.clear(); this.bytes = 0;
  }
}
function localMermaid(app) {
  if (!mermaidRenderers.has(app)) mermaidRenderers.set(app, new LocalMermaid());
  return mermaidRenderers.get(app);
}
function publicationAssets(note) { return [...note.assets.values(), ...Array.from(note.diagrams?.values() ?? [])]; }
