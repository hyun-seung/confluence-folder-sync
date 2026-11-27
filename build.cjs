const { readFileSync, writeFileSync, existsSync, readdirSync } = require("node:fs");
const { join, dirname, relative } = require("node:path");
const { buildSync } = require("esbuild");
const root = __dirname;
const common = { absWorkingDir: root, bundle: true, write: false, platform: "browser", target: "chrome120",
  format: "iife", legalComments: "inline", minifyWhitespace: true, metafile: true, logLevel: "warning" };
const parser = buildSync({ ...common, stdin: { contents: "export {default as MarkdownIt} from 'markdown-it';",
  resolveDir: root }, globalName: "CfsMarkdown" });
const frame = buildSync({ ...common, entryPoints: ["src/mermaid-frame.js"] });
// The official Tiny IIFE is evaluated as a classic script inside our sandbox.
// Keep its global binding intact; bundling it as CommonJS changes its semantics.
const tinyPackage = JSON.parse(readFileSync(join(root, "node_modules/@mermaid-js/tiny/package.json"), "utf8"));
const upstream = JSON.parse(readFileSync(join(root, "node_modules/mermaid/package.json"), "utf8"));
if (tinyPackage.version !== upstream.version) throw new Error("Renderer and upstream license inventory versions must match");
const tiny = readFileSync(join(root, "node_modules/@mermaid-js/tiny/dist/mermaid.tiny.js"), "utf8");
// Tiny is prebundled: retain the matching upstream dependency license inventory,
// including optional features omitted by Tiny, in addition to its inline notices.
const inventory = buildSync({ ...common, stdin: { contents: "import mermaid from 'mermaid'; console.log(mermaid);", resolveDir: root } });
const packages = new Map();
for (const file of [...Object.keys(parser.metafile.inputs), ...Object.keys(inventory.metafile.inputs), "node_modules/lodash-es/lodash.js"]) {
  if (!file.includes("node_modules/")) continue;
  let directory = dirname(join(root, file));
  while (directory !== root && (!existsSync(join(directory, "package.json")) ||
    !JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name)) directory = dirname(directory);
  if (directory === root || packages.has(directory)) continue;
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  const candidates = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENSE-MIT.txt", "LICENSE-MIT", "license", "license.md", "LICENCE", "LICENCE.md"];
  const files = readdirSync(directory);
  const license = candidates.map(candidate => files.find(name => name.toLowerCase() === candidate.toLowerCase())).find(Boolean);
  if (!license) throw new Error("Missing bundled license: " + relative(root, directory));
  packages.set(directory, `${pkg.name}@${pkg.version} (${pkg.license ?? "see license"})\n${readFileSync(join(directory, license), "utf8").trim()}`);
}
packages.set("tiny", `@mermaid-js/tiny@${tinyPackage.version} (MIT; same upstream monorepo)\n${readFileSync(join(root, "node_modules/mermaid/LICENSE"), "utf8").trim()}`);
const notices = "Third-party software notices for main.js and the matching Mermaid upstream dependency inventory. Some optional upstream features are not shipped by Tiny. Inline prebundled notices are also preserved.\n\n" + [...packages.values()].sort().join("\n\n--------------------\n\n") + "\n";
writeFileSync(join(root, "THIRD_PARTY_NOTICES.txt"), notices);
const modules = ["i18n.js", "requests.js", "confluence.js", "reads.js", "mermaid.js", "markdown.js", "sync.js", "review.js", "publication.js", "conflicts.js", "renames.js", "history.js", "automatic.js", "management.js", "setup.js", "dashboard.js", "plugin.js"];
const source = modules.map(name => readFileSync(join(root, "src", name), "utf8").trimEnd());
const output = '\"use strict\";\n/*\n' + notices.replace(/\*\//g, "* /") +
  "*/\n" + parser.outputFiles[0].text + "\nconst MERMAID_FRAME_SOURCE = " + JSON.stringify(tiny + "\n" + frame.outputFiles[0].text) +
  ";\n" + source.join("\n\n") + "\n";
if (Buffer.byteLength(output) > 5_000_000) throw new Error("Runtime exceeds the 5 MB Obsidian Sync compatibility budget");
writeFileSync(join(root, "main.js"), output);
