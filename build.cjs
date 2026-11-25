const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const modules = ["i18n.js", "confluence.js", "markdown.js", "sync.js", "review.js", "dashboard.js", "plugin.js"];
const source = modules.map((name) => readFileSync(join(__dirname, "src", name), "utf8").trimEnd());
writeFileSync(join(__dirname, "main.js"), '"use strict";\n\n' + source.join("\n\n") + "\n");
