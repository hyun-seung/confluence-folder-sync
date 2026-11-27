// Executed inside the real Electron renderer, using real Obsidian APIs and a fake remote.
module.exports = async function nativeScenario({ expectedVault, source }) {
  const check = (value, message) => { if (!value) throw new Error(message); };
  check(app.vault.adapter.getBasePath().replace(/\\/g, "/") === expectedVault.replace(/\\/g, "/"), "Fixture vault guard failed");
  const api = window.__cfsTestApi;
  const lib = new Function("require", "module", source + "\nreturn { SetupModal, verifySetup, setupDiagnostics, SyncDashboard, HistoryModal, incoming, digest, prepareLocalReview, applyLocalReview, publicationTarget };")(
    name => { if (name !== "obsidian") throw new Error("Unexpected dependency"); return api; }, { exports: {} });
  let plugin = app.plugins.plugins["confluence-folder-sync"];
  check(plugin instanceof api.Plugin, "Production plugin did not load as a real Obsidian Plugin");
  const original = "Intro\nold A\nTail\n";
  const secretId = "cfs-native-synthetic-test";
  const secretValue = "synthetic-value-not-a-credential";
  await app.secretStorage.setSecret(secretId, secretValue);
  check(app.secretStorage.getSecret(secretId) === secretValue, "Native SecretStorage round trip failed");
  check(!plugin.data.settings.autoPublish && !plugin.data.settings.allowPublish, "Initial publishing guards changed");
  const sourceFile = app.vault.getFileByPath("Docs/One.md");
  check(sourceFile && await app.vault.read(sourceFile) === original, "Initial fixture missing");
  const results = [];
  for (const language of ["en", "ko"]) {
    plugin.data.settings = { ...plugin.data.settings, language, source: "Docs", inbox: "Incoming-" + language,
      folderUrl: "https://example.atlassian.net/wiki/spaces/DOC/folder/100", email: "fixture@example.com", secretId,
      allowPublish: false, autoCheck: false, autoPublish: false };
    const config = { origin: "https://example.atlassian.net", folderId: "100", source: "Docs", inbox: "Incoming-" + language, language };
    const page = (id, title, version) => ({ id, title, parentId: "100", spaceId: "300", status: "current", type: "page", version: { number: version } });
    const catalog = new Map([["201", page("201", "One", 2)], ["202", page("202", "Image", 1)]]);
    const client = {
      config, spaceId: "300", catalog: async () => catalog,
      currentPages: async ids => new Map(ids.map(id => [id, catalog.get(id)])),
      pageUrl: id => config.origin + "/wiki/pages/viewpage.action?pageId=" + id,
      pageVersions: async () => [{ number: 1 }, { number: 2 }],
      page: async (id, version) => {
        const number = version ?? catalog.get(id).version.number;
        return { ...catalog.get(id), version: { number }, body: { storage: { value: id === "201" ?
          "<p>Intro</p><p>" + (number === 1 ? "old" : "new") + " A</p><p>Tail</p>" :
          '<p>Synthetic attachment</p><ac:image><ri:attachment ri:filename="doc.png" /></ac:image>' } } };
      },
      attachments: async id => id === "202" ? [{ id: "att501", title: "doc.png", fileSize: 2, version: { number: 1 } }] : [],
      downloadAttachment: async () => new Uint8Array([13, 37]).buffer,
    };
    const profile = { folders: {}, imports: {}, pages: { "file:Docs/One.md": { id: "201", version: 1, parent: "100", title: "One", bodyHash: "synthetic", sourceHash: await lib.digest(original) } } };
    plugin.data.profiles[lib.publicationTarget(config)] = profile;
    await plugin.persist();
    let setupReads = 0;
    plugin.testSetup = (draft, guard) => plugin.exclusive(() => lib.verifySetup(app, draft, () => ({
      connect: async () => { setupReads++; }, get: async () => { setupReads++; return { results: [] }; },
    }), guard));
    const setupBaseline = JSON.stringify(plugin.data.settings);
    const cancelledSetup = new lib.SetupModal(plugin);
    cancelledSetup.open();
    cancelledSetup.change("email", "cancelled@example.com");
    cancelledSetup.close();
    check(JSON.stringify(plugin.data.settings) === setupBaseline, "Native setup cancellation changed settings");
    const setup = new lib.SetupModal(plugin);
    setup.open();
    setup.next(); // Actual SecretComponent is constructed in the account step.
    check(setup.step === 1 && setup.contentEl.querySelector(".setting-item"), "Native account step failed");
    setup.change("email", "setup-checked@example.com");
    setup.next(); setup.next();
    check(setup.step === 3, "Native folder validation failed");
    await setup.verify();
    check(setup.verified?.ok && setupReads === 2, "Native read-only setup check failed: " + setup.issue);
    const diagnostic = JSON.stringify(setup.report);
    for (const value of [expectedVault, "setup-checked@example.com", "example.atlassian.net", secretId, secretValue, "tokenHash"]) {
      check(!diagnostic.includes(value), "Native diagnostic report leaked a private field");
    }
    const setupMappings = JSON.stringify(plugin.data.profiles);
    await setup.save();
    check(setup.saved && plugin.data.settings.email === "setup-checked@example.com", "Native setup save failed: " + setup.issue);
    check(JSON.stringify(plugin.data.profiles) === setupMappings && !plugin.data.settings.allowPublish &&
      !plugin.data.settings.autoCheck && !plugin.data.settings.autoPublish, "Native setup lost mappings or enabled publication");
    setup.close();
    // Replace only the remote connection boundary; local filesystem, UI, history and events remain real.
    plugin.withConnection = task => plugin.exclusive(() => task({ client, config, profile, folder: { id: "100", title: "Synthetic folder" }, save: () => plugin.persist() }));
    const dashboard = new lib.SyncDashboard(plugin);
    dashboard.open();
    await new Promise(resolve => setTimeout(resolve, 100));
    check(dashboard instanceof api.Modal && dashboard.modalEl.isConnected, "Native modal did not open");
    check([...dashboard.contentEl.querySelectorAll("button")].some(button => button.textContent === plugin.t("Load pages")), "Localized native controls missing");
    await dashboard.loadPages();
    check(dashboard.pages.length === 2, "Native dashboard page list failed");
    dashboard.close();
    const review = await lib.prepareLocalReview(app, client, profile, catalog.get("201"));
    check(review.hunks.length === 1 && review.hunks[0].at !== null, "Native local review mismatch");
    await lib.applyLocalReview(app, client, profile, catalog.get("201"), review, [0], receipt => plugin.recordBackup(receipt));
    check(await app.vault.read(sourceFile) === original.replace("old A", "new A"), "Native Vault.process application failed");
    const receipt = plugin.data.backups.at(-1);
    check(await app.vault.read(app.vault.getFileByPath(receipt.backup)) === original, "Native backup contents mismatch");
    const history = new lib.HistoryModal(plugin);
    history.open();
    plugin.confirm = async () => true; // Explicit acceptance is synthetic; the restoration path is production code.
    await history.restore(receipt);
    check(await app.vault.read(sourceFile) === original, "Native backup restoration failed: " + history.status);
    check(plugin.data.backups.length >= 2, "Recovery backup receipt missing");
    history.close();
    await lib.incoming(app, client, catalog, profile, () => plugin.persist(), true);
    const imported = profile.imports["202"];
    check(imported && await app.vault.read(app.vault.getFileByPath(imported.path)), "Native page import failed");
    const attachment = app.vault.getFiles().find(file => file.path.startsWith(config.inbox + "/") && file.path.endsWith("/Attachments/501-v1-doc.png"));
    check(attachment && new Uint8Array(await app.vault.readBinary(attachment))[1] === 37, "Native binary attachment bytes mismatch");
    results.push({ language, setupWizard: true, redactedDiagnostics: true, ui: true, selectedApplication: true, backupRestoration: true, binaryImport: true });
  }
  const profile = Object.values(plugin.data.profiles).find(value => value.pages["file:Docs/One.md"]);
  await app.vault.rename(sourceFile, "Docs/Renamed.md");
  await plugin.applyRenames();
  check(profile.pages["file:Docs/Renamed.md"]?.id === "201" && !profile.pages["file:Docs/One.md"], "Native rename event lost the page mapping");
  await app.vault.rename(sourceFile, "Docs/One.md");
  await plugin.applyRenames();
  check(await app.vault.read(sourceFile) === original, "Rename changed fixture contents");
  await plugin.persist();
  const backupCount = plugin.data.backups.length;
  await app.plugins.disablePlugin("confluence-folder-sync");
  await app.plugins.enablePlugin("confluence-folder-sync");
  plugin = app.plugins.plugins["confluence-folder-sync"];
  check(plugin && plugin.data.backups.length === backupCount, "Native plugin reload lost saved state");
  check(app.secretStorage.getSecret(secretId) === secretValue, "Native secret missing after plugin reload");
  check(!plugin.data.settings.autoPublish && !plugin.data.settings.allowPublish, "Reload enabled publishing");
  await app.secretStorage.setSecret(secretId, "");
  return { passed: true, apiVersion: api.apiVersion, secretStorageRoundTrip: true, renameEvents: true, pluginReload: true, remote: "synthetic, no Confluence requests", results };
};
