function xml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

function webLink(value, origin) {
  try {
    const url = new URL(value, origin);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

function codeFence(text, language = "") {
  const character = String.fromCharCode(96);
  const longest = Math.max(2, ...(text.match(new RegExp(character + "+", "g")) ?? []).map(run => run.length));
  const marker = character.repeat(longest + 1);
  return marker + language + "\n" + text + "\n" + marker;
}

function storageCode(text, language) {
  const safeLanguage = /^[a-z0-9+_-]+$/i.test(language) ? language : "";
  return '<ac:structured-macro ac:name="code">' +
    (safeLanguage ? '<ac:parameter ac:name="language">' + xml(safeLanguage) + '</ac:parameter>' : "") +
    '<ac:plain-text-body><![CDATA[' + text.replace(/\]\]>/g, "]]]]><![CDATA[>") + ']]></ac:plain-text-body>' +
    '</ac:structured-macro>';
}

const MARKDOWN_FORMAT_REVISION = 2;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
function textMarkup(value) { return xml(value); }
const markdownParser = new CfsMarkdown.MarkdownIt({ html: false, xhtmlOut: true, breaks: true, linkify: false, typographer: false });
markdownParser.inline.ruler.before("link", "cfs_wiki", (state, silent) => {
  const match = /^(!?)\[\[([^\]\n]+)\]\]/.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (!silent) {
    const [target, alias] = match[2].replace(/\\\|/g, "|").split("|", 2);
    const token = state.push("cfs_reference", "", 0);
    token.meta = { embed: Boolean(match[1]), target: target.trim(), label: alias || target.trim() };
  }
  state.pos += match[0].length;
  return true;
});
markdownParser.inline.ruler.before("text", "cfs_br", (state, silent) => {
  const match = /^<br\s*\/?\s*>/i.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (!silent) state.push("hardbreak", "br", 0);
  state.pos += match[0].length;
  return true;
});
function inlineText(tokens) {
  return (tokens ?? []).map(token => token.type === "cfs_reference" ? token.meta.label :
    token.type === "image" ? token.content : token.type === "softbreak" || token.type === "hardbreak" ? " " :
      token.children ? inlineText(token.children) : token.nesting ? "" : token.content).join("");
}
function tableWikiPipes(source) {
  const lines = source.split("\n");
  const codeLines = new Set();
  for (const token of markdownParser.parse(source, {})) if (["fence", "code_block"].includes(token.type)) {
    for (let line = token.map[0]; line < token.map[1]; line++) codeLines.add(line);
  }
  for (let i = 1; i < lines.length; i++) {
    if (codeLines.has(i) || !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i])) continue;
    if (!lines[i - 1].includes("|")) continue;
    for (let row = i - 1; row < lines.length && lines[row].trim() && lines[row].includes("|") && !codeLines.has(row); row++) {
      lines[row] = lines[row].split(/(\x60+[^\x60]*\x60+)/g).map((part, index) => index % 2 ? part :
        part.replace(/\[\[[^\]\n]+\]\]/g, wiki => wiki.replace(/(?<!\\)\|/g, "\\|"))).join("");
    }
  }
  return lines.join("\n");
}
function markdownLines(markdown, visitor) {
  const source = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
  const tokens = markdownParser.parse(tableWikiPipes(source), {});
  const stack = [];
  const anchors = new Map();
  const reserved = new Set(tokens.flatMap((token, index) => token.type === "heading_open" ? [localSlug(inlineText(tokens[index + 1]?.children))] : []));
  const used = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open") {
      const slug = localSlug(inlineText(tokens[i + 1]?.children));
      let count = anchors.get(slug) ?? 0;
      let anchor = slug + (count ? "-" + count : "");
      while (used.has(anchor) || (count && reserved.has(anchor))) anchor = slug + "-" + (++count);
      anchors.set(slug, count + 1);
      used.add(anchor);
      token.meta = { anchor };
    }
    if (token.type === "blockquote_open") {
      const inline = tokens[i + 2];
      const match = inline?.type === "inline" && /^\[!([^\]\n]+)\]([+-]?)\s*([^\n]*)(?:\n|$)/.exec(inline.content);
      let callout;
      if (match) {
        const kind = match[1].toLowerCase();
        const known = { info: "info", note: "note", tip: "tip", success: "tip", warning: "warning", caution: "warning", danger: "warning", error: "warning" };
        callout = { name: match[2] === "-" ? "expand" : known[kind] ?? "note", title: match[3] || kind };
        token.meta = { callout };
        inline.content = inline.content.slice(match[0].length);
        inline.children = markdownParser.parseInline(inline.content, {})[0].children;
      }
      stack.push(callout);
    }
    if (token.type === "blockquote_close") token.meta = { callout: stack.pop() };
    if (visitor && token.children) {
      for (const child of token.children) {
        if (child.type === "cfs_reference") visitor(child.meta);
        else if (child.type === "image") visitor({ embed: true, target: child.attrGet("src"), label: child.content });
        else if (child.type === "link_open") visitor({ embed: false, target: child.attrGet("href"), label: "" });
      }
    }
  }
  return tokens;
}
function renderInline(tokens, env) {
  let result = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "cfs_reference") result += env.linkFor(token.meta);
    else if (token.type === "image") result += env.linkFor({ embed: true, target: token.attrGet("src"), label: token.content });
    else if (token.type === "link_open") {
      let end = i + 1;
      while (end < tokens.length && tokens[end].type !== "link_close") end++;
      const children = tokens.slice(i + 1, end);
      result += env.linkFor({ embed: false, target: token.attrGet("href"), label: inlineText(children), labelHtml: renderInline(children, env) });
      i = end;
    } else if (token.type === "code_inline") result += "<code>" + xml(token.content) + "</code>";
    else if (token.type === "softbreak" || token.type === "hardbreak") result += "<br />";
    else if (token.type === "text") result += xml(token.content).replace(/^(\[ \]|\[[xX]\])\s/, match => match[1] === " " ? "☐ " : "☑ ");
    else if (["strong_open", "em_open", "s_open"].includes(token.type)) result += "<" + token.tag + ">";
    else if (["strong_close", "em_close", "s_close"].includes(token.type)) result += "</" + token.tag + ">";
  }
  return result;
}
markdownParser.renderer.renderInline = (tokens, options, env) => renderInline(tokens, env);
markdownParser.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const code = token.content.replace(/\n$/, "");
  const language = token.info.trim().split(/\s+/)[0];
  const source = storageCode(code, language);
  if (!token.cfsDiagram) return source + "\n";
  return '<ac:image ac:alt="Mermaid diagram"><ri:attachment ri:filename="' + xml(token.cfsDiagram.name) + '" /></ac:image>' +
    '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Mermaid source</ac:parameter><ac:rich-text-body>' + source + '</ac:rich-text-body></ac:structured-macro>\n';
};
markdownParser.renderer.rules.code_block = (tokens, index) => storageCode(tokens[index].content.replace(/\n$/, ""), "") + "\n";
markdownParser.renderer.rules.heading_open = (tokens, index) => "<" + tokens[index].tag + "><ac:structured-macro ac:name=\"anchor\"><ac:parameter ac:name=\"\">" + xml(tokens[index].meta.anchor) + "</ac:parameter></ac:structured-macro>";
markdownParser.renderer.rules.blockquote_open = (tokens, index) => {
  const callout = tokens[index].meta?.callout;
  return callout ? '<ac:structured-macro ac:name="' + callout.name + '"><ac:parameter ac:name="title">' + xml(callout.title) + '</ac:parameter><ac:rich-text-body>\n' : "<blockquote>\n";
};
markdownParser.renderer.rules.blockquote_close = (tokens, index) => tokens[index].meta?.callout ? "</ac:rich-text-body></ac:structured-macro>\n" : "</blockquote>\n";
function toStorage(units, linkFor) {
  return markdownParser.renderer.render(units, markdownParser.options, { linkFor }).trim() || "<p></p>";
}

// A formatter upgrade alone never rewrites a previously linked, unchanged note.
function preservePublishedBody(entry, note) {
  return entry?.migratedInputHash === note.inputHash || Boolean(entry?.bodyHash && entry?.inputHash === note.inputHash &&
    (entry.formatRevision ?? 0) < MARKDOWN_FORMAT_REVISION);
}

function markdownText(text) {
  return String(text).replace(/[<>&]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char])
    .replace(/([\\\x60*\[\]_|])/g, "\\$1");
}

function fromStorage(body, pageUrl, attachments = new Map()) {
  const ac = "http://atlassian.com/content";
  const ri = "http://atlassian.com/resource/identifier";
  const entities = { nbsp: "&#160;", ndash: "&#8211;", mdash: "&#8212;", hellip: "&#8230;" };
  const storage = body.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map((part, index) =>
    index % 2 ? part : part.replace(/&([a-z]+);/gi, (match, name) =>
      ["amp", "lt", "gt", "quot", "apos"].includes(name) ? match : entities[name] ?? "&amp;" + name + ";")
  ).join("");
  const parsed = new DOMParser().parseFromString(
    '<body xmlns:ac="' + ac + '" xmlns:ri="' + ri + '">' + storage + "</body>", "application/xml"
  );
  if (parsed.getElementsByTagName("parsererror").length) {
    throw new Error("Confluence returned storage markup this version cannot convert.");
  }
  const element = (node, ns, name) =>
    Array.from(node.children).find(child => child.namespaceURI === ns && child.localName === name);
  const contents = node => Array.from(node.childNodes).map(render).join("");
  const block = text => "\n\n" + text.trim() + "\n\n";
  const headingAnchors = new Map();
  const headingCounts = new Map();
  const headingText = heading => {
    const copy = heading.cloneNode(true);
    for (const macro of [...copy.getElementsByTagNameNS(ac, "structured-macro")]) macro.remove();
    return copy.textContent.trim();
  };
  for (const heading of parsed.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    const slug = localSlug(headingText(heading));
    headingCounts.set(slug, (headingCounts.get(slug) ?? 0) + 1);
  }
  for (const heading of parsed.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    const text = headingText(heading);
    // Keep the original remote URL when local Markdown cannot select a unique heading.
    if (headingCounts.get(localSlug(text)) !== 1) continue;
    headingAnchors.set(localSlug(text), text);
    for (const macro of heading.getElementsByTagNameNS(ac, "structured-macro")) {
      if (macro.getAttributeNS(ac, "name") === "anchor") {
        const parameter = element(macro, ac, "parameter");
        if (parameter) headingAnchors.set(parameter.textContent, text);
      }
    }
  }
  function render(node) {
    if (node.nodeType === 3 || node.nodeType === 4) return markdownText(node.nodeValue);
    if (node.nodeType !== 1) return "";
    const tag = node.localName;
    if (node.namespaceURI === ac && tag === "structured-macro") {
      const name = node.getAttributeNS(ac, "name") || "unknown";
      if (name === "anchor") return "";
      if (name === "code" || name === "noformat") {
        const language = Array.from(node.children).find(el => el.getAttributeNS(ac, "name") === "language");
        return block(codeFence(element(node, ac, "plain-text-body")?.textContent ?? "", (language?.textContent ?? "").replace(/[^a-z0-9+_-]/gi, "")));
      }
      const detail = element(node, ac, "rich-text-body");
      if (["info", "note", "tip", "warning", "expand"].includes(name)) {
        const title = Array.from(node.children).find(el => el.getAttributeNS(ac, "name") === "title")?.textContent;
        const marker = name === "expand" ? "note]-" : name + "]";
        const callout = "[!" + marker + (title ? " " + markdownText(title.replace(/\s+/g, " ")) : "");
        return block((callout + (detail ? "\n" + contents(detail).trim() : "")).split("\n").map(line => "> " + line).join("\n"));
      }
      return block("> Confluence macro: " + markdownText(name) + (detail ? "\n" + contents(detail) : ""));
    }
    if (tag === "script" || tag === "style" || tag === "iframe") return "";
    const text = contents(node);
    if (tag === "table") {
      const nodes = Array.from(node.getElementsByTagName("tr"));
      if (node.querySelector("table,ol,ul,blockquote,pre,[rowspan]:not([rowspan='1']),[colspan]:not([colspan='1'])") ||
          node.getElementsByTagNameNS(ac, "structured-macro").length ||
          nodes.some(row => row.children.length !== nodes[0]?.children.length)) {
        return block(codeFence(new XMLSerializer().serializeToString(node), "html"));
      }
      const rows = nodes.map(row => Array.from(row.children).map(cell =>
        contents(cell).trim().replace(/(?<!\\)\|/g, "\\|").replace(/\n{2,}/g, "\n").replace(/\n/g, "<br />")));
      if (!rows.length) return "";
      rows.splice(1, 0, Array.from(nodes[0].children, cell => {
        const align = /text-align:\s*(left|right|center)/i.exec(cell.getAttribute("style") ?? "")?.[1];
        return align === "left" ? ":---" : align === "right" ? "---:" : align === "center" ? ":---:" : "---";
      }));
      return block(rows.map(row => "| " + row.join(" | ") + " |").join("\n"));
    }
    if (tag === "ol" || tag === "ul") {
      const start = /^\d+$/.test(node.getAttribute("start") ?? "") ? Number(node.getAttribute("start")) : 1;
      return block(Array.from(node.children).map((item, index) => {
        const lines = contents(item).trim().replace(/\n{3,}/g, "\n\n").replace(/^☐ /, "[ ] ").replace(/^☑ /, "[x] ").split("\n");
        const prefix = tag === "ol" ? (start + index) + ". " : "- ";
        return prefix + lines.map((line, n) => n ? " ".repeat(prefix.length) + line : line).join("\n");
      }).join("\n"));
    }
    if (tag === "a" || tag === "link" || tag === "image" || tag === "img") {
      const attachment = element(node, ri, "attachment");
      const targetPage = element(node, ri, "page");
      const imageUrl = element(node, ri, "url");
      const linkBody = element(node, ac, "link-body") || element(node, ac, "plain-text-link-body");
      const label = (linkBody ? contents(linkBody) : text).trim() ||
        markdownText(node.getAttributeNS(ac, "alt") || node.getAttribute("alt") || attachment?.getAttributeNS(ri, "filename") ||
          targetPage?.getAttributeNS(ri, "content-title") || node.getAttribute("href") || "Confluence attachment");
      const local = attachments.get(attachment?.getAttributeNS(ri, "filename"));
      if (local) return (tag === "image" && local.image ? "!" : "") + "[" + label + "](<" + local.path + ">)";
      const anchor = node.getAttributeNS(ac, "anchor");
      const pageId = targetPage?.getAttributeNS(ri, "content-id");
      const raw = node.getAttribute("href") || node.getAttribute("src") || imageUrl?.getAttributeNS(ri, "value") ||
        (pageId && /^\d+$/.test(pageId) ? new URL("/wiki/pages/viewpage.action?pageId=" + pageId, pageUrl).href :
          !targetPage && anchor ? "#" + anchor : null);
      const url = raw ? webLink(raw, pageUrl) : null;
      if (url) {
        const remote = new URL(url);
        const current = new URL(pageUrl);
        let fragment;
        try { fragment = decodeURIComponent(remote.hash.slice(1)); } catch { fragment = ""; }
        if (remote.origin === current.origin && remote.pathname === current.pathname && remote.search === current.search && headingAnchors.has(fragment)) {
          return "[" + label + "](<#" + encodeURIComponent(headingAnchors.get(fragment)) + ">)";
        }
      }
      return url ? "[" + label + "](<" + url + ">)" : label;
    }
    if (/^h[1-6]$/.test(tag)) return block("#".repeat(Number(tag[1])) + " " + text);
    if (tag === "p" || tag === "div") return block(text);
    if (tag === "strong" || tag === "b") return "**" + text + "**";
    if (tag === "em" || tag === "i") return "*" + text + "*";
    if (tag === "s" || tag === "del" || tag === "strike") return "~~" + text + "~~";
    if (tag === "code") {
      const marker = String.fromCharCode(96);
      const raw = node.textContent;
      const ticks = marker.repeat(Math.max(1, ...(raw.match(/\x60+/g) ?? []).map(run => run.length + 1)));
      return ticks + (raw.includes(marker) ? " " + raw + " " : raw) + ticks;
    }
    if (tag === "pre") return block(codeFence(node.textContent));
    if (tag === "br") return "\n";
    if (tag === "blockquote") return block(text.trim().split("\n").map(line => "> " + line).join("\n"));
    if (tag === "hr") return block("---");
    return text;
  }
  return contents(parsed.documentElement).trim() + "\n";
}

function diffLines(before, after) {
  const left = before.trimEnd().split("\n");
  const right = after.trimEnd().split("\n");
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let end = 0;
  while (start + end < left.length && start + end < right.length &&
      left[left.length - end - 1] === right[right.length - end - 1]) end++;
  if (start === left.length && start === right.length) return "";
  const oldLines = left.slice(start, left.length - end);
  const newLines = right.slice(start, right.length - end);
  const lines = ["@@ from line " + (start + 1) + " @@"];
  const width = newLines.length + 1;
  const cells = (oldLines.length + 1) * width;
  if (cells > 2_000_000) {
    lines.push("Large comparison: changed range shown as two blocks.");
    for (const text of oldLines) lines.push("-" + text);
    for (const text of newLines) lines.push("+" + text);
    return lines.join("\n");
  }
  const matches = new Uint32Array(cells);
  for (let a = oldLines.length - 1; a >= 0; a--) {
    for (let b = newLines.length - 1; b >= 0; b--) {
      const at = a * width + b;
      matches[at] = oldLines[a] === newLines[b] ? 1 + matches[at + width + 1] :
        Math.max(matches[at + width], matches[at + 1]);
    }
  }
  for (let a = 0, b = 0; a < oldLines.length || b < newLines.length;) {
    if (a < oldLines.length && b < newLines.length && oldLines[a] === newLines[b]) {
      lines.push(" " + oldLines[a++]);
      b++;
    } else if (a < oldLines.length && (b === newLines.length ||
        matches[(a + 1) * width + b] >= matches[a * width + b + 1])) {
      lines.push("-" + oldLines[a++]);
    } else {
      lines.push("+" + newLines[b++]);
    }
  }
  return lines.join("\n");
}

function lineChange(before, after, language = "en") {
  const diff = diffLines(before, after);
  return diff ? codeFence(diff, "diff") : translate(language, "No converted Markdown body difference.");
}

