// Runs only inside an opaque-origin sandbox with a deny-by-default CSP.
import mermaid from "mermaid";

function safeSvg(svg) {
  const externalUrl = text => [...text.matchAll(/url\s*\(([^)]*)\)/gi)]
    .some(match => !/^#[a-z0-9_.:-]+$/i.test(match[1].trim().replace(/^['"]|['"]$/g, "")));
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error("unsafe-svg");
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error("invalid-svg");
  for (const node of doc.querySelectorAll("*")) {
    if (["script", "foreignobject", "image", "iframe", "object", "embed", "audio", "video", "use", "a", "animate", "set"].includes(node.localName.toLowerCase())) throw new Error("active-svg");
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.name) || /href$/i.test(attr.localName)) throw new Error("active-svg-attribute");
      if (externalUrl(attr.value)) throw new Error("external-svg-reference");
    }
    if (node.localName === "style" && (/@import|@font-face|\\/i.test(node.textContent) || externalUrl(node.textContent))) throw new Error("external-svg-style");
  }
  return doc.documentElement;
}
window.addEventListener("message", async function receive(event) {
  if (event.source !== parent || !event.ports[0]) return;
  window.removeEventListener("message", receive);
  const port = event.ports[0];
  try {
    let parentBlocked = false;
    try { void parent.document; } catch { parentBlocked = true; }
    const isolated = parentBlocked && ["require", "process", "app", "secretStorage"].every(name => typeof globalThis[name] === "undefined");
    if (!isolated) throw new Error("sandbox-unavailable");
    const source = event.data.source;
    if (typeof source !== "string" || source.length > 20_000) throw new Error("source-limit");
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false,
      theme: "default", fontFamily: "Arial, sans-serif", deterministicIds: true, deterministicIDSeed: "cfs-local-v1",
      maxTextSize: 20_000, maxEdges: 200, suppressErrorRendering: true,
      flowchart: { htmlLabels: false }, themeVariables: { fontFamily: "Arial, sans-serif" } });
    const { svg } = await mermaid.render("cfs-diagram", source, document.body);
    const root = safeSvg(svg);
    const viewBox = root.getAttribute("viewBox")?.trim().split(/[ ,]+/).map(Number);
    if (!viewBox || viewBox.length !== 4 || viewBox.some(n => !Number.isFinite(n))) throw new Error("invalid-size");
    const width = Math.ceil(viewBox[2]);
    const height = Math.ceil(viewBox[3]);
    if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 8_000_000) throw new Error("size-limit");
    root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"); context.fillStyle = "white";
      context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0);
      const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!png || png.size > 8 * 1024 * 1024) throw new Error("png-limit");
      const data = await png.arrayBuffer(); port.postMessage({ data, width, height, isolated }, [data]);
    } finally { URL.revokeObjectURL(url); }
  } catch {
    // Library errors can contain private diagram source.
    port.postMessage({ error: true });
  } finally { port.close(); }
});
