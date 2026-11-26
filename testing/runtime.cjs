const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function runtime(filename = resolve(__dirname, "../main.js")) {
  const source = readFileSync(filename, "utf8");
  return new Function("require", "module", source + "\nreturn { ConfluenceCloud, ReviewReads: typeof ReviewReads === 'undefined' ? undefined : ReviewReads, " +
    "RequestQueue: typeof RequestQueue === 'undefined' ? undefined : RequestQueue, retryAfterMilliseconds: typeof retryAfterMilliseconds === 'undefined' ? undefined : retryAfterMilliseconds, " +
    "validatedConfig, preparedNotes, resolvedStorage, digest, translate, localizedError, publicationReview, publishSelection, remotePages, AutomaticSync, publicationTarget };")(
    name => {
      if (name !== "obsidian") throw new Error("Unexpected fixture dependency: " + name);
      return { Plugin: class {}, PluginSettingTab: class {}, Notice: class {}, Modal: class {} };
    }, { exports: {} });
}

module.exports = { runtime };
