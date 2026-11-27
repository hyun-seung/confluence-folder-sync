const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { findBrowser } = require("./browser.cjs");
const root = join(__dirname, "..");
const assert = require("node:assert/strict");
const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), pipe: true, headless: true,
    args: ["--disable-background-networking", "--disable-quic", "--disable-sync", "--no-first-run",
      "--proxy-server=127.0.0.1:1", "--host-resolver-rules=MAP * ~NOTFOUND"],
  });
  try {
    console.log("Browser: " + await browser.version());
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on("request", request => request.url() === "http://localhost/synthetic" ?
      request.respond({ status: 200, contentType: "text/html", body: "<html><body></body></html>" }) : request.abort());
    await page.goto("http://localhost/synthetic");
    await page.addStyleTag({ content: readFileSync(join(root, "styles.css"), "utf8") });
    const bundle = readFileSync(join(root, "main.js"), "utf8");
    const fixtures = readFileSync(join(__dirname, "fixtures.cjs"), "utf8");
    for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 900 });
    for (const language of ["en", "ko"]) {
    const result = await page.evaluate(async ({ source, language, fixtures }) => {
      function make(tag, parent, options = {}) {
        const node = document.createElement(tag);
        if (options.text !== undefined) node.textContent = options.text;
        if (options.cls) node.className = options.cls;
        for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, value);
        node.addClass = name => node.classList.add(name);
        node.empty = () => node.replaceChildren();
        node.createEl = (child, attributes) => make(child, node, attributes);
        node.createSpan = attributes => make("span", node, attributes);
        node.createDiv = attributes => make("div", node, attributes);
        parent.append(node);
        return node;
      }
      class Modal {
        constructor(app) {
          this.app = app;
          this.modalEl = make("div", document.body, { cls: "modal" });
          this.contentEl = make("div", this.modalEl);
        }
        open() { this.onOpen(); }
        close() { this.onClose(); this.modalEl.remove(); }
      }
      class Setting {
        constructor(parent) { this.el = make("div", parent, { cls: "setting-item" }); }
        setName(name) { make("span", this.el, { text: name }); return this; }
        setDesc(description) { make("span", this.el, { text: description }); return this; }
        addComponent(builder) { builder(this.el); return this; }
        addButton(builder) {
          const el = make("button", this.el);
          const api = {
            setButtonText(text) { el.textContent = text; return api; },
            setCta() { return api; },
            setDisabled(flag) { el.disabled = Boolean(flag); return api; },
            onClick(fn) { el.addEventListener("click", () => { el.pending = Promise.resolve(fn()); }); return api; },
          };
          builder(api);
          return this;
        }
        addDropdown(builder) {
          const el = make("select", this.el);
          const api = {
            selectEl: el,
            setDisabled(flag) { el.disabled = Boolean(flag); return api; },
            addOption(value, label) { el.add(new Option(label, value)); return api; },
            setValue(value) { el.value = value; return api; },
            onChange(fn) { el.addEventListener("change", () => fn(el.value)); return api; },
          };
          builder(api);
          return this;
        }
        addToggle(builder) {
          const el = make("input", this.el);
          el.type = "checkbox";
          const api = {
            setValue(value) { el.checked = value; return api; },
            setDisabled(flag) { el.disabled = Boolean(flag); return api; },
            onChange(fn) { el.addEventListener("change", () => fn(el.checked)); return api; },
          };
          builder(api); return this;
        }
        addText(builder) {
          const el = make("input", this.el);
          const api = {
            setValue(value) { el.value = value; return api; },
            setPlaceholder(value) { el.placeholder = value; return api; },
            setDisabled(flag) { el.disabled = Boolean(flag); return api; },
            onChange(fn) { el.addEventListener("input", () => fn(el.value)); return api; },
          };
          builder(api);
          return this;
        }
      }
      class SecretComponent {
        constructor(app, parent) {
          this.selectEl = make("select", parent);
          for (const id of app.secretStorage.listSecrets()) this.selectEl.add(new Option(id, id));
        }
        setValue(value) { this.selectEl.value = value; return this; }
        onChange(callback) { this.selectEl.addEventListener("change", () => callback(this.selectEl.value)); return this; }
      }
      const mockObsidian = { Plugin: class {}, PluginSettingTab: class {}, Modal, Setting, SecretComponent, Notice: class {} };
      const lib = new Function("require", "module", source + "\nreturn { SetupModal, verifySetup, commitSetup, setupDiagnostics, ApiError, SyncDashboard, incoming, digest, translate, PublicationModal, ConflictModal, HistoryModal, prepareConflict, validatedConfig, ConfluenceCloud, Publisher, preparedNotes, publicationReview, publishSelection, MappingModal, publicationTarget };")(
        name => {
          if (name !== "obsidian") throw new Error("Unexpected runtime dependency: " + name);
          return mockObsidian;
        }, { exports: {} });
      const files = new Map([["Docs/One.md", "Intro\nold A\nMiddle\nold B\nTail\n"],
        ["Incoming/Imported pages/One -- 201/v2.md", "previous import"]]);
      const folders = new Set(["Docs", "Incoming", "Incoming/Imported pages", "Incoming/Imported pages/One -- 201"]);
      const original = files.get("Docs/One.md");
      const vault = {
        getFolderByPath: path => folders.has(path),
        getAbstractFileByPath: path => files.has(path),
        createFolder: async path => folders.add(path),
        getFileByPath: path => files.has(path) ? { path, extension: path.split(".").at(-1) } : null,
        read: async file => files.get(file.path),
        readBinary: async file => files.get(file.path),
        createBinary: async (path, data) => {
          if (files.has(path)) throw new Error("Existing file would be overwritten");
          files.set(path, data); return { path };
        },
        process: async (file, update) => files.set(file.path, update(files.get(file.path))),
        create: async (path, text) => {
          if (files.has(path)) throw new Error("Existing file would be overwritten");
          files.set(path, text);
          return { path };
        },
      };
      const root = { id: "100", title: "Test folder" };
      const item = (id, rootId, title, number) =>
        ({ id, title, status: "current", parentId: rootId, type: "page", spaceId: "300", version: { number } });
      const one = item("201", "100", "One", 3);
      const two = item("202", "100", "Two", 1);
      const other = item("203", "909", "Outside", 1);
      const catalog = new Map([[one.id, one], [two.id, two], [other.id, other]]);
      let attachmentVersion = 2;
      const remote = {
        config: { origin: "https://example.atlassian.net", folderId: "100", source: "Docs", inbox: "Incoming", language },
        spaceId: "300",
        catalog: async () => catalog,
        currentPages: async ids => new Map(ids.map(id => [id, catalog.get(id)])),
        pageVersions: async () => [{ number: 2, createdAt: "2025-01-01" }, { number: 1 }],
        pageUrl: id => "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=" + id,
        page: async (id, version) => {
          const page = catalog.get(id);
          const number = version ?? page.version.number;
          const letter = number === 3 ? "new" : "old";
          const body = id === "201" && number >= 2 ?
            "<p>Intro</p><p>" + letter + " A</p><p>Middle</p><p>" + letter + " B</p><p>Tail</p>" :
            "<p>version " + number + "</p><ac:image><ri:attachment ri:filename=\"doc.png\" /></ac:image>";
          return { ...page, version: { number }, body: { storage: { value: body } } };
        },
        attachments: async () => [{ id: "att501", title: "doc.png", fileSize: 2, version: { number: attachmentVersion } }],
        downloadAttachment: async () => new Uint8Array([13, 37]).buffer,
      };
      const profile = { folders: {}, pages: { "file:Docs/One.md": { id: "201", version: 2, parent: "100", title: "One",
        bodyHash: "fixture", sourceHash: await lib.digest(original) } }, imports: {} };
      const opened = [];
      const workspace = { getLeavesOfType: () => [], getLeaf: () => ({ openFile: async file => opened.push(file.path) }) };
      let confirm = false;
      const plugin = { language, t: (message, values) => lib.translate(language, message, values), app: { vault, workspace }, data: { settings: { allowPublish: false }, history: [], backups: [] },
        withConnection: async task => task({ client: remote, folder: root, profile }),
        operation: async (_message, task) => task({ client: remote, folder: root, profile }),
        recordBackup: async receipt => plugin.data.backups.push(receipt),
        confirm: async () => confirm, run: async () => {} };
      const panel = new lib.SyncDashboard(plugin);
      panel.open();
      const button = label => {
        const el = Array.from(document.querySelectorAll("button")).find(el => el.textContent === plugin.t(label));
        if (!el) throw new Error("Missing button " + label);
        return el;
      };
      const click = async label => { const el = button(label); el.click(); await el.pending; };
      const change = (el, value) => { el.value = value; el.dispatchEvent(new Event("change")); };
      if (button("Review publication").disabled) throw new Error("Read-only publication review should be available");
      await click("Load pages");
      if (document.body.innerText.includes("Outside")) throw new Error("Outside folder scope");
      change(document.querySelector("select"), "201");
      await click("Load versions");
      change(document.querySelector('[aria-label="' + plugin.t("Base version") + '"]'), "1");
      await click("Compare");
      const diffVerified = document.querySelector(".cfs-removed").textContent.includes("-version 1") &&
        Array.from(document.querySelectorAll(".cfs-added")).some(line => line.textContent.includes("+new A"));
      await click("Review local application");
      const checkbox = document.querySelector("input[type=checkbox]");
      if (!checkbox || checkbox.disabled) throw new Error("Applicable chunk not found");
      checkbox.click();
      confirm = true;
      await click("Apply selected changes");
      if (files.get("Docs/One.md") !== original.replace("old A", "new A")) throw new Error("Wrong chunks applied");
      const backups = Array.from(files.keys()).filter(path => path.startsWith("Incoming/Backups/"));
      if (backups.length !== 1 || files.get(backups[0]) !== original) throw new Error("Local backup missing");
      confirm = false;
      await click("Download latest copy");
      if (!opened[0].endsWith("/One -- 201/v3.md") || !opened[0].includes("/Snapshots/")) {
        throw new Error("Latest copy not opened under snapshots");
      }
      const fresh = new lib.SyncDashboard(plugin);
      fresh.open();
      await click("Download snapshot");
      if (opened.length !== 1 || !document.body.innerText.includes(plugin.t("Snapshot cancelled."))) throw new Error("Cancel failed");
      confirm = true;
      await click("Download snapshot");
      const index = files.get(opened[1]);
      if (!index?.includes("One -- 201") || !index.includes("Two -- 202") || index.includes("Outside")) {
        throw new Error("Wrong snapshot index");
      }
      const report = await lib.incoming({ vault }, remote, catalog, profile, async () => {}, true);
      await lib.incoming({ vault }, remote, catalog, profile, async () => {}, true);
      if (!report.summary.includes(language === "ko" ? "가져옴 1개" : "1 imported") || Object.keys(profile.imports).join() !== "202") throw new Error("Import tracking");
      const binary = Array.from(files.entries()).find(([path]) => path.endsWith("/Attachments/501-v2-doc.png"));
      if (!binary || new Uint8Array(binary[1])[1] !== 37) throw new Error("Binary was not saved");
      const imported = files.get(profile.imports["202"].path);
      if (!imported.includes("![doc.png](<Attachments/501-v2-doc.png>)")) throw new Error("Image is not a local embed");
      attachmentVersion++;
      const preview = await lib.incoming({ vault }, remote, catalog, profile, async () => {}, false);
      if (!files.get(preview.file.path).includes(plugin.t("Attachment changed") + " · doc.png · v2 → v3")) {
        throw new Error("Attachment-only change was not reported");
      }

      const assertion = {
        ok: value => { if (!value) throw new Error("Synthetic assertion failed"); },
        equal: (a, b) => { if (a !== b) throw new Error("Synthetic values differ"); },
      };
      const loadFixtures = () => {
        const module = { exports: {} };
        new Function("require", "module", fixtures)(name => {
          if (name !== "node:assert/strict") throw new Error("Unexpected fixture dependency");
          return assertion;
        }, module);
        return module.exports;
      };
      const fixture = loadFixtures().selectionFixture(lib);
      fixture.config.language = language;
      const localFiles = fixture.bodies;
      const localVault = fixture.app.vault;
      fixture.app.workspace = { getLeavesOfType: () => [], getLeaf: () => ({ openFile: async () => {} }) };
      localVault.getFileByPath = path => localFiles.has(path) ? { path, extension: "md" } : null;
      localVault.create = async (path, text) => { if (localFiles.has(path)) throw new Error("Would overwrite fixture");
        localFiles.set(path, text); return { path }; };
      localVault.process = async (file, update) => localFiles.set(file.path, update(localFiles.get(file.path)));
      const context = { client: fixture.remote, profile: fixture.profile, save: async () => {} };
      const publisherPlugin = { app: fixture.app, language, data: { settings: fixture.config, history: [], backups: [], profiles: { [JSON.stringify([fixture.config.origin, fixture.config.folderId, fixture.config.source])]: fixture.profile } },
        t: (message, values) => lib.translate(language, message, values),
        preparePublication: fixture.review, confirm: async () => true,
        withConnection: async task => task(context), operation: async (_action, task) => task(context),
        recordBackup: async receipt => publisherPlugin.data.backups.push(receipt),
        exclusive: async task => task(), recordOperation: async (_action, task) => task() };
      const publication = new lib.PublicationModal(publisherPlugin, await fixture.review());
      publication.open();
      const control = (panel, label) => {
        const element = Array.from(panel.contentEl.querySelectorAll("button")).find(node => node.textContent === publisherPlugin.t(label));
        if (!element) throw new Error("Missing new control " + label);
        return element;
      };
      const perform = async (panel, label) => { const element = control(panel, label); element.click(); await element.pending; };
      if (!control(publication, "Publish selected").disabled) throw new Error("Empty selection should be blocked");
      const row = Array.from(publication.contentEl.querySelectorAll(".setting-item")).find(node => node.textContent.includes("Docs/One.md"));
      row.querySelector("input[type=checkbox]").click();
      await perform(publication, "Publish selected");
      if (Object.keys(fixture.profile.pages).join() !== "file:Docs/One.md") throw new Error("Unselected fixture was published");
      if (fixture.profile.folders["dir:Docs/Nested"]) throw new Error("Unselected folder was created");
      publication.close();
      const entry = fixture.profile.pages["file:Docs/One.md"];
      const remotePage = fixture.remote.records.get(entry.id);
      const prior = structuredClone(remotePage);
      remotePage.version.number++;
      remotePage.body.storage.value = "<p>Remote editor change</p>";
      const basePage = fixture.remote.page;
      fixture.remote.page = async (id, version) => version === prior.version.number ? structuredClone(prior) : basePage(id);
      const conflictReview = await lib.prepareConflict(fixture.app, fixture.remote, fixture.profile, remotePage);
      const conflictPanel = new lib.ConflictModal(publisherPlugin, conflictReview);
      conflictPanel.open();
      if (!conflictPanel.modalEl.classList.contains("cfs-conflict-modal")) throw new Error("Conflict modal class missing");
      const expectedWidth = Math.min(1100, window.innerWidth * 0.92);
      if (Math.abs(conflictPanel.modalEl.getBoundingClientRect().width - expectedWidth) > 1) throw new Error("Conflict modal width changed");
      const columns = getComputedStyle(conflictPanel.contentEl.querySelector(".cfs-conflict-columns")).gridTemplateColumns.split(" ");
      if (columns.length !== (window.innerWidth <= 700 ? 1 : 3)) throw new Error("Responsive conflict columns changed");
      if (conflictPanel.contentEl.querySelectorAll(".cfs-conflict-columns pre").length !== 3) throw new Error("Three-way comparison missing");
      const editor = conflictPanel.contentEl.querySelector("textarea");
      editor.value = "# One\nMerged text\n"; editor.dispatchEvent(new Event("input"));
      const remoteUpdates = fixture.remote.stats.updates;
      await perform(conflictPanel, "Save resolution locally");
      if (conflictPanel.modalEl.classList.contains("cfs-conflict-modal")) throw new Error("Conflict modal class was not removed");
      if (localFiles.get("Docs/One.md") !== "# One\nMerged text\n" || fixture.remote.stats.updates !== remoteUpdates) {
        throw new Error("Conflict resolution did not stay local");
      }
      if (publisherPlugin.data.backups.length !== 1 || !entry.requiresReview) throw new Error("Conflict backup or manual publication guard missing");
      const history = new lib.HistoryModal(publisherPlugin);
      history.open();
      await perform(history, "Restore backup");
      if (localFiles.get("Docs/One.md") !== "# One" || publisherPlugin.data.backups.length !== 2) throw new Error("Guarded backup restoration failed");
      history.close();

      // Mapping actions use a separate synthetic vault and never touch native documents.
      const managed = loadFixtures().selectionFixture(lib);
      await managed.publish(await managed.review(), ["Docs/Two.md"]);
      const managedId = managed.profile.pages["file:Docs/Two.md"].id;
      delete managed.profile.pages["file:Docs/Two.md"];
      const managedData = { settings: { ...managed.config, autoPublish: true },
        profiles: { [lib.publicationTarget(managed.config)]: managed.profile } };
      let acceptManagement = false;
      const managementPlugin = { app: managed.app, language, data: managedData,
        t: publisherPlugin.t, confirm: async () => acceptManagement,
        withConnection: task => task({ client: managed.remote, config: managed.config,
          profile: managedData.profiles[lib.publicationTarget(managed.config)], save: async () => {} }),
        operation: (_name, task) => managementPlugin.withConnection(task) };
      const management = new lib.MappingModal(managementPlugin);
      management.open();
      await perform(management, "Load connections");
      const choose = (name, value) => {
        const select = management.contentEl.querySelector('select[aria-label="' + managementPlugin.t(name) + '"]');
        if (!select) throw new Error("Management select missing: " + name);
        select.value = value; select.dispatchEvent(new Event("change"));
      };
      choose("Local note", "Docs/Two.md");
      choose("Existing Confluence page", managedId);
      await perform(management, "Preview mapping change");
      if (!management.review) throw new Error(management.status);
      const unchangedBodies = JSON.stringify([...managed.bodies]);
      const unchangedStats = JSON.stringify(managed.remote.stats);
      await perform(management, "Apply mapping change");
      if (managedData.mappingBackups) throw new Error("Cancelled mapping change was applied");
      acceptManagement = true;
      await perform(management, "Apply mapping change");
      if (managedData.settings.autoPublish || managedData.mappingBackups.length !== 1 ||
          managedData.profiles[lib.publicationTarget(managed.config)].pages["file:Docs/Two.md"].id !== managedId) {
        throw new Error("Mapping apply guard or backup missing: " + management.status);
      }
      await perform(management, "Load connections");
      const activeProfile = managedData.profiles[lib.publicationTarget(managed.config)];
      activeProfile.pages["file:Docs/One.md"] = { creating: true, ticket: "ui-durable" };
      const recovered = await managed.remote.create("page", "One", "100", "<p>Confluence Folder Sync pending ui-durable</p>");
      await perform(management, "Load connections");
      choose("Management action", "recover");
      choose("Local note", "Docs/One.md");
      await perform(management, "Preview mapping change");
      if (!management.review) throw new Error(management.status);
      await perform(management, "Apply mapping change");
      if (managedData.profiles[lib.publicationTarget(managed.config)].pages["file:Docs/One.md"].id !== recovered.id) {
        throw new Error("Recovery UI failed: " + management.status);
      }
      // Migration requires an established complete baseline, so use the published Two only.
      delete managedData.profiles[lib.publicationTarget(managed.config)].pages["file:Docs/One.md"];
      const previousTarget = lib.publicationTarget(managed.config);
      for (const file of managed.files) {
        const prior = file.path; file.path = prior.replace(/^Docs\//, "Moved/");
        managed.bodies.set(file.path, managed.bodies.get(prior)); managed.bodies.delete(prior);
      }
      managed.config.source = "Moved"; managedData.settings.source = "Moved";
      const migratedTarget = lib.publicationTarget(managed.config);
      managedData.profiles[migratedTarget] = { pages: {}, folders: {}, imports: {} };
      await perform(management, "Load connections");
      choose("Management action", "migrate"); choose("Previous source profile", previousTarget);
      await perform(management, "Preview mapping change");
      if (!management.review) throw new Error(management.status);
      await perform(management, "Apply mapping change");
      if (managedData.profiles[previousTarget].movedTo !== migratedTarget ||
          managedData.profiles[migratedTarget].pages["file:Moved/Two.md"].id !== managedId) {
        throw new Error("Migration UI failed: " + management.status);
      }
      if (managed.remote.stats.updates !== JSON.parse(unchangedStats).updates ||
          JSON.stringify([...managed.bodies].map(([path, text]) => [path.replace(/^Moved\//, "Docs/"), text])) !== unchangedBodies) {
        throw new Error("Management changed a document");
      }
      management.close();

      const setupFixture = loadFixtures().selectionFixture(lib);
      const setupApp = setupFixture.app;
      setupApp.vault.getFolderByPath = path => path === "Docs" ? loadFixtures().fixtureFolder("Docs", setupFixture.files) : null;
      setupApp.vault.getAbstractFileByPath = path => setupApp.vault.getFolderByPath(path) ?? setupApp.vault.getFileByPath?.(path);
      setupApp.secretStorage = { getSecret: id => id === "fixture" ? "synthetic-setup-secret" : null, listSecrets: () => ["fixture"] };
      let setupSaves = 0;
      let setupRequests = 0;
      let rejectSetup = false;
      const setupPlugin = { app: setupApp, language, manifest: { version: "0.8.0" },
        data: { settings: { ...setupFixture.config, language, allowPublish: true, autoCheck: true, autoPublish: true }, profiles: { preserved: setupFixture.profile } },
        t: (message, values) => lib.translate(language, message, values),
        persist: async () => { setupSaves++; }, automatic: { configure() {} } };
      setupPlugin.testSetup = (draft, guard) => lib.verifySetup(setupApp, draft, () => ({
        connect: async () => { setupRequests++; if (rejectSetup) throw new lib.ApiError("GET", 403); },
        get: async () => { setupRequests++; return { results: [] }; },
      }), guard);
      setupPlugin.saveSetup = (...args) => lib.commitSetup(setupPlugin, ...args);
      const beforeSetup = JSON.stringify(setupPlugin.data);
      const beforeSetupBodies = JSON.stringify([...setupFixture.bodies]);
      const setupButton = (panel, label) => {
        const el = [...panel.contentEl.querySelectorAll("button")].find(button => button.textContent === setupPlugin.t(label));
        if (!el) throw new Error("Missing setup control: " + label);
        return el;
      };
      const setupClick = async (panel, label) => { const el = setupButton(panel, label); el.click(); await el.pending; };
      const setupField = (panel, label, value) => {
        const row = [...panel.contentEl.querySelectorAll(".setting-item")].find(item => item.querySelector("span")?.textContent === setupPlugin.t(label));
        const input = row?.querySelector("input");
        if (!input) throw new Error("Missing setup field: " + label);
        input.value = value; input.dispatchEvent(new Event("input"));
      };
      const setupEntry = new lib.SyncDashboard(setupPlugin);
      setupEntry.open();
      await setupClick(setupEntry, "Open setup wizard");
      const openedSetup = document.querySelector(".cfs-setup");
      if (!openedSetup) throw new Error("Dashboard did not open setup wizard");
      [...openedSetup.querySelectorAll("button")].find(button => button.textContent === setupPlugin.t("Cancel")).click();
      const cancelledSetup = new lib.SetupModal(setupPlugin);
      cancelledSetup.open();
      setupField(cancelledSetup, "Confluence folder URL", "https://other.atlassian.net/wiki/spaces/DOC/folder/101");
      await setupClick(cancelledSetup, "Cancel");
      if (JSON.stringify(setupPlugin.data) !== beforeSetup || setupSaves || setupRequests) throw new Error("Cancelled draft changed stored settings or made requests");
      const setupPanel = new lib.SetupModal(setupPlugin);
      setupPanel.open();
      await setupClick(setupPanel, "Next");
      setupField(setupPanel, "Atlassian email", "wizard@example.com");
      await setupClick(setupPanel, "Next");
      setupField(setupPanel, "Import vault folder", "Docs/Bad inbox");
      await setupClick(setupPanel, "Next");
      if (setupPanel.step !== 2 || setupPanel.issue !== "FOLDERS") throw new Error("Overlapping folders were accepted");
      setupField(setupPanel, "Import vault folder", "New inbox");
      await setupClick(setupPanel, "Next");
      if (!setupButton(setupPanel, "Save connection (read-only)").disabled) throw new Error("Setup saved without verification");
      await setupClick(setupPanel, "Run read-only check");
      if (!setupPanel.verified?.ok || setupSaves || setupRequests !== 2) throw new Error("Read-only setup verification failed");
      let clipboard = "";
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { clipboard = value; } } });
      await setupClick(setupPanel, "Copy diagnostics");
      if (JSON.parse(clipboard).outcome !== "pass") throw new Error("Diagnostic copy failed");
      for (const privateValue of ["wizard@example.com", "example.atlassian.net", "New inbox", "synthetic-setup-secret", "tokenHash"]) {
        if (clipboard.includes(privateValue)) throw new Error("Diagnostic report contains a private field");
      }
      await setupClick(setupPanel, "Back");
      setupField(setupPanel, "Import vault folder", "Changed inbox");
      if (setupPanel.contentEl.querySelector(".cfs-setup-report")) throw new Error("Edited draft still displays stale diagnostics");
      await setupClick(setupPanel, "Next");
      if (!setupButton(setupPanel, "Save connection (read-only)").disabled) throw new Error("Edited draft retained old verification");
      await setupClick(setupPanel, "Run read-only check");
      const profilesBeforeSave = JSON.stringify(setupPlugin.data.profiles);
      await setupClick(setupPanel, "Save connection (read-only)");
      if (!setupPanel.saved || setupSaves !== 1 || setupPlugin.data.settings.inbox !== "Changed inbox" ||
          setupPlugin.data.settings.allowPublish || setupPlugin.data.settings.autoCheck || setupPlugin.data.settings.autoPublish ||
          JSON.stringify(setupPlugin.data.profiles) !== profilesBeforeSave) throw new Error("Setup save lost guards or mappings");
      await setupClick(setupPanel, "Close");
      if (JSON.stringify([...setupFixture.bodies]) !== beforeSetupBodies) throw new Error("Setup changed a document");
      rejectSetup = true;
      const failedSetup = new lib.SetupModal(setupPlugin);
      failedSetup.step = 3;
      failedSetup.open();
      await setupClick(failedSetup, "Run read-only check");
      if (failedSetup.issue !== "FORBIDDEN" || !setupButton(failedSetup, "Save connection (read-only)").disabled ||
          !failedSetup.contentEl.textContent.includes(setupPlugin.t("Read access was denied."))) throw new Error("Localized setup permission diagnostic failed");
      await setupClick(failedSetup, "Cancel");

      return {
        newFeaturesVerified: true,
        diffVerified,
        originalProtected: files.get("Docs/One.md") === original.replace("old A", "new A") &&
          files.get("Incoming/Imported pages/One -- 201/v2.md") === "previous import",
        baselinePreserved: profile.pages["file:Docs/One.md"].version === 2,
        savedSnapshots: opened.length,
      };
    }, { source: bundle, language, fixtures });
    assert.deepEqual(result, { newFeaturesVerified: true, diffVerified: true, originalProtected: true, baselinePreserved: true, savedSnapshots: 2 });
    console.log(language + " " + width + "px Chromium fixture passed: setup draft/check/save/cancel and redacted diagnostics, mapping management, selective publication, conflicts, restoration, versions and attachments.");
    }
    }
    assert.deepEqual(errors, [], "Browser page errors");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
