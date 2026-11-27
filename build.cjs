const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join, dirname, relative } = require("node:path");
const { buildSync } = require("esbuild");
const root = __dirname;
const common = { absWorkingDir: root, bundle: true, write: false, platform: "browser", target: "chrome120",
  format: "iife", legalComments: "inline", minifyWhitespace: true, metafile: true, logLevel: "warning" };
const parser = buildSync({ ...common, stdin: { contents: "export {default as MarkdownIt} from 'markdown-it';",
  resolveDir: root }, globalName: "CfsMarkdown" });
const frame = buildSync({ ...common, entryPoints: ["src/mermaid-frame.js"] });
const packages = new Map();
for (const file of [...Object.keys(parser.metafile.inputs), ...Object.keys(frame.metafile.inputs)]) {
  if (!file.includes("node_modules/")) continue;
  let directory = dirname(join(root, file));
  while (directory !== root && (!existsSync(join(directory, "package.json")) ||
    !JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name)) directory = dirname(directory);
  if (directory === root || packages.has(directory)) continue;
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  const candidates = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENSE-MIT.txt", "LICENSE-MIT", "license", "license.md", "LICENCE", "LICENCE.md"];
  const license = candidates.find(name => existsSync(join(directory, name)));
  if (!license) throw new Error("Missing bundled license: " + relative(root, directory));
  packages.set(directory, `${pkg.name}@${pkg.version} (${pkg.license ?? "see license"})\n${readFileSync(join(directory, license), "utf8").trim()}`);
}
const notices = "Third-party software bundled into main.js\n\n" + [...packages.values()].sort().join("\n\n--------------------\n\n") + "\n";
writeFileSync(join(root, "THIRD_PARTY_NOTICES.txt"), notices);
const modules = ["i18n.js", "requests.js", "confluence.js", "reads.js", "mermaid.js", "markdown.js", "sync.js", "review.js", "publication.js", "conflicts.js", "renames.js", "history.js", "automatic.js", "management.js", "setup.js", "dashboard.js", "plugin.js"];
const source = modules.map(name => readFileSync(join(root, "src", name), "utf8").trimEnd());
writeFileSync(join(root, "main.js"), '\"use strict\";\n/*\n' + notices.replace(/\*\//g, "* /") +
  "*/\n" + parser.outputFiles[0].text + "\nconst MERMAID_FRAME_SOURCE = " + JSON.stringify(frame.outputFiles[0].text) +
  ";\n" + source.join("\n\n") + "\n");
