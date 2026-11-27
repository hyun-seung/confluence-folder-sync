const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function runtime(filename = resolve(__dirname, "../main.js")) {
  const source = readFileSync(filename, "utf8");
  return new Function("require", "module", source + "\nreturn { ConfluenceCloud, ReviewReads: typeof ReviewReads === 'undefined' ? undefined : ReviewReads, " +
    "RequestQueue: typeof RequestQueue === 'undefined' ? undefined : RequestQueue, retryAfterMilliseconds: typeof retryAfterMilliseconds === 'undefined' ? undefined : retryAfterMilliseconds, " +
    "SetupModal: typeof SetupModal === 'undefined' ? undefined : SetupModal, inspectSetup: typeof inspectSetup === 'undefined' ? undefined : inspectSetup, " +
    "verifySetup: typeof verifySetup === 'undefined' ? undefined : verifySetup, commitSetup: typeof commitSetup === 'undefined' ? undefined : commitSetup, " +
    "setupDiagnostics: typeof setupDiagnostics === 'undefined' ? undefined : setupDiagnostics, SetupIssue: typeof SetupIssue === 'undefined' ? undefined : SetupIssue, " +
    "ApiError, ConfluenceFolderSync, validatedConfig, preparedNotes, resolvedStorage, digest, translate, localizedError, publicationReview, publishSelection, remotePages, AutomaticSync, publicationTarget };")(
    name => {
      if (name !== "obsidian") throw new Error("Unexpected fixture dependency: " + name);
      return { Plugin: class {}, PluginSettingTab: class {}, Notice: class {}, Modal: class {} };
    }, { exports: {} });
}

module.exports = { runtime };
