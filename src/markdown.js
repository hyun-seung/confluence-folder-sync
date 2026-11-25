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

function tableCells(line) {
  const table = line.trim().replace(/^\||(?<!\\)\|$/g, "");
  const results = [];
  let start = 0;
  for (const token of table.matchAll(/\[\[[^\]\n]+\]\]|\x60+[^\x60]+\x60+|\\\||\|/g)) {
    if (token[0] !== "|") continue;
    results.push(table.slice(start, token.index));
    start = token.index + 1;
  }
  results.push(table.slice(start));
  return results.map(cell => cell.trim().replace(/\\\|/g, "|"));
}

const MARKDOWN_REF = /(!?)\[\[([^\]\n]+)\]\]|(!?)\[([^\]\n]*)\]\(\s*(?:<([^<>\n]+)>|([^\s()]+))(?:\s+"[^"\n]*")?\s*\)/g;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

function referenceTarget(match) {
  if (match[2] !== undefined) {
    const [target, alias] = match[2].replace(/\\\|/g, "|").split("|", 2);
    return { embed: Boolean(match[1]), target: target.trim(), label: alias || target.trim() };
  }
  return { embed: Boolean(match[3]), target: match[5] ?? match[6], label: match[4] };
}

function textMarkup(value) {
  return xml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
}

function markdownLines(markdown, visitor) {
  const source = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, "");
  const units = [];
  const fencePattern = /^\s{0,3}([~]{3,}|\x60{3,})(.*)$/;
  let fence;
  let code = [];
  for (const line of source.split("\n")) {
    const marker = fencePattern.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.mark[0] && marker[1].length >= fence.mark.length && !marker[2].trim()) {
        units.push({ code: code.join("\n"), language: fence.language });
        code = [];
        fence = null;
      } else {
        code.push(line);
      }
    } else if (marker) {
      fence = { mark: marker[1], language: marker[2].trim().split(/\s+/)[0] };
    } else {
      units.push({ line });
      if (visitor) {
        for (const text of line.split(/(\x60+[^\x60]+\x60+)/g)) {
          if (text.startsWith(String.fromCharCode(96))) continue;
          for (const match of text.matchAll(MARKDOWN_REF)) visitor(referenceTarget(match));
        }
      }
    }
  }
  if (fence) units.push({ code: code.join("\n"), language: fence.language });
  return units;
}

function toStorage(units, linkFor) {
  const inline = (line) => line.split(/(\x60+[^\x60]+\x60+)/g).map((part, index) => {
    if (index % 2) return "<code>" + xml(part.replace(/^\x60+|\x60+$/g, "")) + "</code>";
    let output = "";
    let offset = 0;
    for (const match of part.matchAll(MARKDOWN_REF)) {
      output += textMarkup(part.slice(offset, match.index));
      output += linkFor(referenceTarget(match));
      offset = match.index + match[0].length;
    }
    return output + textMarkup(part.slice(offset));
  }).join("");

  const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/;
  const separator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  const heading = /^ {0,3}(#{1,6})\s+(.+)$/;
  const divider = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const isTable = i => units[i]?.line?.includes("|") && separator.test(units[i + 1]?.line ?? "");
  const listType = match => /^[0-9]/.test(match[2]) ? "ol" : "ul";
  const html = [];

  function renderList(index, first) {
    const indent = first[1].length;
    const type = listType(first);
    let output = "<" + type + ">";
    for (; index < units.length;) {
      const item = listItem.exec(units[index].line ?? "");
      if (!item || item[1].length !== indent || listType(item) !== type) break;
      output += "<li>" + inline(item[3]);
      index++;
      const next = listItem.exec(units[index]?.line ?? "");
      if (next && next[1].length > indent && next[1].length - indent <= 8) {
        const nested = renderList(index, next);
        output += nested.html;
        index = nested.index;
      }
      output += "</li>";
    }
    return { html: output + "</" + type + ">", index };
  }

  for (let i = 0; i < units.length;) {
    const { line, code, language } = units[i];
    if (code !== undefined) {
      html.push(storageCode(code, language));
      i++;
    } else if (!line.trim()) {
      i++;
    } else if (isTable(i)) {
      const headers = tableCells(line);
      const row = (cells, tag) => "<tr>" + headers.map((_, index) =>
        "<" + tag + ">" + inline(cells[index] ?? "") + "</" + tag + ">"
      ).join("") + "</tr>";
      let body = "<table><tbody>" + row(headers, "th");
      i += 2;
      while (units[i]?.line?.trim() && units[i].line.includes("|")) body += row(tableCells(units[i++].line), "td");
      html.push(body + "</tbody></table>");
    } else if (heading.test(line)) {
      const [, marks, name] = heading.exec(line);
      const tag = "h" + marks.length;
      const anchor = localSlug(name);
      const macro = anchor ? '<ac:structured-macro ac:name="anchor"><ac:parameter ac:name="">' +
        xml(anchor) + '</ac:parameter></ac:structured-macro>' : "";
      html.push("<" + tag + ">" + macro + inline(name) + "</" + tag + ">");
      i++;
    } else if (divider.test(line)) {
      html.push("<hr />");
      i++;
    } else if (listItem.test(line)) {
      const list = renderList(i, listItem.exec(line));
      html.push(list.html);
      i = list.index;
    } else if (/^\s*>/.test(line)) {
      const quoted = [];
      while (/^\s*>/.test(units[i]?.line ?? "")) quoted.push(inline(units[i++].line.replace(/^\s*>\s?/, "")));
      html.push("<blockquote><p>" + quoted.join("<br />") + "</p></blockquote>");
    } else {
      const parts = [inline(line)];
      i++;
      while (units[i]?.line?.trim() && !heading.test(units[i].line) && !divider.test(units[i].line)
          && !listItem.test(units[i].line) && !/^\s*>/.test(units[i].line) && !isTable(i)) {
        parts.push(inline(units[i++].line));
      }
      html.push("<p>" + parts.join("<br />") + "</p>");
    }
  }
  return html.join("\n") || "<p></p>";
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
      return block("> Confluence macro: " + markdownText(name) + (detail ? "\n" + contents(detail) : ""));
    }
    if (tag === "script" || tag === "style" || tag === "iframe") return "";
    const text = contents(node);
    if (tag === "table") {
      const rows = Array.from(node.getElementsByTagName("tr")).map(row =>
        Array.from(row.children).map(cell => contents(cell).trim().replace(/\s*\n\s*/g, " ")));
      if (!rows.length) return "";
      rows.splice(1, 0, rows[0].map(() => "---"));
      return block(rows.map(row => "| " + row.join(" | ") + " |").join("\n"));
    }
    if (tag === "ol" || tag === "ul") {
      return block(Array.from(node.children).map((item, index) => {
        const lines = contents(item).trim().split("\n");
        return (tag === "ol" ? (index + 1) + ". " : "- ") + lines.map((line, n) => n ? "    " + line : line).join("\n");
      }).join("\n"));
    }
    if (tag === "a" || tag === "link" || tag === "image" || tag === "img") {
      const attachment = element(node, ri, "attachment");
      const targetPage = element(node, ri, "page");
      const imageUrl = element(node, ri, "url");
      const linkBody = element(node, ac, "link-body") || element(node, ac, "plain-text-link-body");
      const label = (linkBody ? contents(linkBody) : text).trim() ||
        markdownText(attachment?.getAttributeNS(ri, "filename") || targetPage?.getAttributeNS(ri, "content-title") ||
          node.getAttribute("alt") || node.getAttribute("href") || "Confluence attachment");
      const local = attachments.get(attachment?.getAttributeNS(ri, "filename"));
      if (local) return (tag === "image" && local.image ? "!" : "") + "[" + label + "](<" + local.path + ">)";
      const anchor = node.getAttributeNS(ac, "anchor");
      const url = webLink(node.getAttribute("href") || node.getAttribute("src") ||
        imageUrl?.getAttributeNS(ri, "value") || (anchor ? "#" + anchor : pageUrl), pageUrl);
      return url ? "[" + label + "](<" + url + ">)" : label;
    }
    if (/^h[1-6]$/.test(tag)) return block("#".repeat(Number(tag[1])) + " " + text);
    if (tag === "p" || tag === "div") return block(text);
    if (tag === "strong" || tag === "b") return "**" + text + "**";
    if (tag === "em" || tag === "i") return "*" + text + "*";
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

function lineChange(before, after) {
  const diff = diffLines(before, after);
  return diff ? codeFence(diff, "diff") : "No converted Markdown body difference.";
}

