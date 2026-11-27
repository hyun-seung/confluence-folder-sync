const SETUP_KEYS = ["folderUrl", "email", "secretId", "source", "inbox"];
const SETUP_PHASES = ["target", "account", "folders", "readAccess"];
const SETUP_ISSUES = {
  TARGET: ["Check the Confluence folder URL.", "Copy an HTTPS folder URL from the Confluence sidebar, including /folder/ and its numeric ID."],
  ACCOUNT: ["Check the account and token selection.", "Enter the Atlassian email that issued the token and select a secret stored in Obsidian."],
  SECRET: ["The selected secret is unavailable.", "Create or select a token in Obsidian SecretStorage. Token values are never stored in connection settings."],
  FOLDERS: ["Check the local folder paths.", "Use separate visible relative folders for source and imports. Hidden, absolute and overlapping paths are not allowed."],
  SOURCE: ["The source folder is unavailable.", "Choose an existing source folder in this vault. The wizard does not create or modify source notes."],
  INBOX: ["A file occupies the import folder path.", "Choose an import folder whose path is not occupied by a file. Missing folders are created only when importing."],
  AUTH: ["Authentication was rejected.", "Check the Atlassian email, token expiration and selected secret, then test again."],
  FORBIDDEN: ["Read access was denied.", "Check the token's Confluence read scopes and the account's folder restrictions with your administrator."],
  NOT_FOUND: ["The folder could not be found or accessed.", "Check the folder URL and account access. A hidden or inaccessible folder may also appear missing."],
  LIMITED: ["Confluence is temporarily limiting requests.", "Wait for the server's retry period, then test again."],
  SERVICE: ["Confluence is temporarily unavailable.", "Try again later. No remote writes were attempted."],
  REQUEST: ["The connection could not be verified.", "Check your network or proxy and try again. Share only the redacted diagnostics if the issue continues."],
  STALE: ["The setup check is no longer current.", "Test again after changing fields or the selected secret. Checks expire after five minutes."],
  SETTINGS_CHANGED: ["The saved settings changed while this wizard was open.", "Close and reopen setup to use the latest settings. No connection settings were replaced."],
  BUSY: ["Another sync operation is running.", "Wait for it to finish before testing or saving this connection."],
  SAVE: ["The connection settings could not be saved.", "The previous settings were restored. Check local write access and try again."],
  SAVE_UNCERTAIN: ["The connection settings could not be saved or restored on disk.", "Previous settings remain in memory. Check local write access and inspect settings before continuing."],
  CANCELLED: ["Setup was cancelled.", "Reopen setup when you are ready. No remaining connection checks will be started."],
};

class SetupIssue extends Error {
  constructor(code) { super(code); this.code = code; }
}

function setupDraft(settings) {
  return Object.fromEntries(SETUP_KEYS.map(key => [key, typeof settings[key] === "string" ? settings[key] : ""]));
}

function setupFingerprint(settings) { return JSON.stringify(setupDraft(settings)); }

function setupIssueCode(error) {
  if (error instanceof SetupIssue && Object.hasOwn(SETUP_ISSUES, error.code)) return error.code;
  if (error?.name === "AbortError") return "CANCELLED";
  if (error instanceof RetryWaitError) return "LIMITED";
  if (error instanceof ApiError) {
    return ({ 401: "AUTH", 403: "FORBIDDEN", 404: "NOT_FOUND", 429: "LIMITED", 503: "SERVICE" })[error.status] ?? "REQUEST";
  }
  if (error?.message === "A Confluence command is already running in this vault.") return "BUSY";
  return "REQUEST";
}

function setupTarget(draft) {
  try { return confluenceTarget(draft.folderUrl); } catch { throw new SetupIssue("TARGET"); }
}

function setupAccount(app, draft) {
  let account;
  try { account = atlassianAccount(draft.email, draft.secretId); } catch { throw new SetupIssue("ACCOUNT"); }
  try {
    if (!app.secretStorage.getSecret(account.secretId)) throw new Error();
  } catch { throw new SetupIssue("SECRET"); }
  return account;
}

function setupFolders(app, draft) {
  let paths;
  try { paths = configuredFolders(draft.source, draft.inbox); } catch { throw new SetupIssue("FOLDERS"); }
  const source = app.vault.getFolderByPath(paths.source);
  if (!source) throw new SetupIssue("SOURCE");
  let noteCount;
  try { noteCount = sourceMarkdownFiles(source, paths.source).length; } catch { throw new SetupIssue("SOURCE"); }
  let prefix = "";
  for (const part of paths.inbox.split("/")) {
    prefix = prefix ? prefix + "/" + part : part;
    if (app.vault.getAbstractFileByPath(prefix) && !app.vault.getFolderByPath(prefix)) throw new SetupIssue("INBOX");
  }
  return { ...paths, noteCount, inboxMissing: !app.vault.getFolderByPath(paths.inbox) };
}

function inspectSetup(app, draft) {
  const checks = [];
  const values = {};
  for (const [id, inspect] of [["target", () => setupTarget(draft)], ["account", () => setupAccount(app, draft)],
    ["folders", () => setupFolders(app, draft)]]) {
    try { Object.assign(values, inspect()); checks.push({ id, status: "pass" }); }
    catch (error) { checks.push({ id, status: "fail", code: setupIssueCode(error) }); }
  }
  return { ok: checks.every(check => check.status === "pass"), checks, values };
}

async function verifySetup(app, draft, createClient, check = async () => {}) {
  const snapshot = setupDraft(draft);
  await check();
  const local = inspectSetup(app, snapshot);
  const result = { ok: false, checks: local.checks, fingerprint: setupFingerprint(snapshot), checkedAt: Date.now() };
  if (!local.ok) return result;
  try {
    const config = { ...snapshot, ...local.values, allowPublish: false, autoCheck: false, autoPublish: false };
    const token = app.secretStorage.getSecret(config.secretId);
    if (!token) throw new SetupIssue("SECRET");
    const tokenHash = await digest(token);
    await check();
    const client = createClient(config, token, check);
    await client.connect();
    await check();
    const descendants = await client.get(API + "/folders/" + config.folderId + "/descendants", { limit: 1, depth: 1 });
    if (!Array.isArray(descendants.results)) throw new Error();
    await check();
    const current = inspectSetup(app, snapshot);
    if (!current.ok) return { ...result, checks: current.checks };
    if (await digest(app.secretStorage.getSecret(config.secretId) ?? "") !== tokenHash) throw new SetupIssue("STALE");
    await check();
    return { ...result, ok: true, checks: [...current.checks, { id: "readAccess", status: "pass" }],
      tokenHash, noteCount: current.values.noteCount, checkedAt: Date.now() };
  } catch (error) {
    if (error?.name === "AbortError" || error instanceof SetupIssue && error.code === "SETTINGS_CHANGED") throw error;
    const status = error instanceof ApiError && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599 ? error.status : undefined;
    return { ...result, checks: [...result.checks, { id: "readAccess", status: "fail", code: setupIssueCode(error), httpStatus: status }] };
  }
}

function setupDiagnostics(plugin, result, issue) {
  const version = value => typeof value === "string" && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value) ? value : "unknown";
  const report = { schema: 1, plugin: "confluence-folder-sync", pluginVersion: version(plugin.manifest?.version),
    obsidianVersion: version(apiVersion), outcome: result?.ok === true ? "pass" : "not-verified", checks: [] };
  for (const item of result?.checks ?? []) {
    if (!SETUP_PHASES.includes(item.id)) continue;
    const entry = { check: item.id, outcome: item.status === "pass" ? "pass" : "fail" };
    if (Object.hasOwn(SETUP_ISSUES, item.code)) entry.code = item.code;
    if (Number.isInteger(item.httpStatus) && item.httpStatus >= 100 && item.httpStatus <= 599) entry.httpStatus = item.httpStatus;
    report.checks.push(entry);
  }
  if (Object.hasOwn(SETUP_ISSUES, issue)) report.issue = issue;
  return report;
}

function requireSetupProof(draft, verified) {
  if (!verified?.ok || verified.fingerprint !== setupFingerprint(draft) || !Number.isFinite(verified.checkedAt) ||
      Date.now() - verified.checkedAt < 0 || Date.now() - verified.checkedAt > 300000) throw new SetupIssue("STALE");
}

async function commitSetup(plugin, draft, verified, baseline, check = async () => {}) {
  if (plugin.setupSaving) throw new SetupIssue("BUSY");
  plugin.setupSaving = true;
  try {
    await check();
    if (JSON.stringify(plugin.data.settings) !== baseline) throw new SetupIssue("SETTINGS_CHANGED");
    requireSetupProof(draft, verified);
    const local = inspectSetup(plugin.app, draft);
    if (!local.ok) throw new SetupIssue(local.checks.find(item => item.status === "fail").code);
    const token = plugin.app.secretStorage.getSecret(draft.secretId) ?? "";
    if (await digest(token) !== verified.tokenHash) throw new SetupIssue("STALE");
    await check();
    if (JSON.stringify(plugin.data.settings) !== baseline) throw new SetupIssue("SETTINGS_CHANGED");
    requireSetupProof(draft, verified);
    const current = inspectSetup(plugin.app, draft);
    if (!current.ok) throw new SetupIssue(current.checks.find(item => item.status === "fail").code);
    if (plugin.app.secretStorage.getSecret(draft.secretId) !== token) throw new SetupIssue("STALE");
    const previous = structuredClone(plugin.data.settings);
    plugin.data.settings = { ...previous, ...setupDraft({ ...draft, ...current.values }), folderUrl: draft.folderUrl.trim(),
      allowPublish: false, autoCheck: false, autoPublish: false };
    const savedFingerprint = JSON.stringify(plugin.data.settings);
    try {
      await plugin.persist();
      await check(savedFingerprint);
      requireSetupProof(draft, verified);
      if (JSON.stringify(plugin.data.settings) !== savedFingerprint) throw new SetupIssue("SETTINGS_CHANGED");
      const final = inspectSetup(plugin.app, draft);
      if (!final.ok) throw new SetupIssue(final.checks.find(item => item.status === "fail").code);
      if (plugin.app.secretStorage.getSecret(draft.secretId) !== token) throw new SetupIssue("STALE");
    } catch (error) {
      plugin.data.settings = previous;
      try { await plugin.persist(); } catch { throw new SetupIssue("SAVE_UNCERTAIN"); }
      if (error instanceof SetupIssue || error?.name === "AbortError") throw error;
      throw new SetupIssue("SAVE");
    }
    plugin.automatic?.configure();
  } finally { plugin.setupSaving = false; }
}

class SetupModal extends Modal {
  constructor(plugin, onSaved = () => {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.t = (message, values) => plugin.t(message, values);
    this.baseline = JSON.stringify(plugin.data.settings);
    this.draft = setupDraft(plugin.data.settings);
    this.step = 0;
    this.onSaved = onSaved;
  }

  onOpen() { this.opened = true; this.contentEl.addClass("cfs-setup"); this.render(); }
  onClose() { this.opened = false; this.contentEl.empty(); }

  change(key, value) {
    this.draft[key] = value;
    this.verified = null;
    this.issue = null;
    this.report = null;
    this.reportContainer?.remove();
    this.issueContainer?.remove();
  }

  guard(fingerprint, settings = this.baseline) {
    if (!this.opened || this.plugin.unloaded) { const error = new Error(); error.name = "AbortError"; throw error; }
    if (setupFingerprint(this.draft) !== fingerprint) throw new SetupIssue("STALE");
    if (JSON.stringify(this.plugin.data.settings) !== settings) throw new SetupIssue("SETTINGS_CHANGED");
  }

  render() {
    const { contentEl, t, plugin } = this;
    contentEl.empty();
    this.reportContainer = null;
    this.issueContainer = null;
    contentEl.createEl("h2", { text: t("Connection setup and diagnostics") });
    if (this.saved) {
      contentEl.createEl("p", { text: t("Connection saved. Publishing and automatic sync are off.") });
      new Setting(contentEl).addButton(button => button.setButtonText(t("Close")).onClick(() => this.close()));
      return;
    }
    const titles = ["Confluence target", "Account and token", "Local folders", "Verify and save"];
    contentEl.createEl("p", { text: t("Step {step} of 4: {title}", { step: this.step + 1, title: t(titles[this.step]) }), attr: { "aria-live": "polite" } });
    contentEl.createEl("p", { text: t("Inputs stay in this draft until Save connection. Existing page links are retained.") });
    const text = (name, key, placeholder) => new Setting(contentEl).setName(t(name)).addText(field =>
      field.setValue(this.draft[key]).setPlaceholder(placeholder).setDisabled(this.busy)
        .onChange(value => this.change(key, value)));
    if (this.step === 0) {
      text("Confluence folder URL", "folderUrl", "https://example.atlassian.net/wiki/spaces/DOC/folder/1234");
      contentEl.createEl("p", { text: t("Use a Confluence folder URL, not a page URL. No remote content is created by setup.") });
    } else if (this.step === 1) {
      text("Atlassian email", "email", "name@example.com");
      new Setting(contentEl).setName(t("Confluence API token"))
        .addComponent(el => new SecretComponent(plugin.app, el).setValue(this.draft.secretId)
          .onChange(value => this.change("secretId", value ?? "")));
      contentEl.createEl("p", { text: t("Manage token values in Obsidian SecretStorage. Secret edits there are saved separately, even if this wizard is cancelled.") });
    } else if (this.step === 2) {
      text("Source vault folder", "source", "Project");
      text("Import vault folder", "inbox", "Confluence inbox");
      contentEl.createEl("p", { text: t("The source must exist. Imports use a separate folder; setup does not create folders or change notes.") });
    } else {
      for (const [label, key] of [["Confluence folder URL", "folderUrl"], ["Atlassian email", "email"],
        ["Source vault folder", "source"], ["Import vault folder", "inbox"]]) {
        new Setting(contentEl).setName(t(label)).setDesc(this.draft[key]);
      }
      contentEl.createEl("p", { text: t("The test checks authentication and folder read access only. Publishing permissions are checked when publishing; no test page is created.") });
      new Setting(contentEl).addButton(button => button.setButtonText(t("Run read-only check")).setDisabled(this.busy)
        .onClick(() => this.verify()));
      if (this.verified?.ok) contentEl.createEl("p", { text: t("Read access verified. {count} source Markdown notes found.", { count: this.verified.noteCount }) });
    }
    if (this.busy) contentEl.createEl("p", { text: t("Checking or saving connection…"), attr: { role: "status" } });
    if (this.issue) {
      this.issueContainer = contentEl.createDiv();
      this.issueContainer.createEl("p", { text: t(SETUP_ISSUES[this.issue][0]), attr: { role: "alert" } });
      this.issueContainer.createEl("p", { text: t(SETUP_ISSUES[this.issue][1]) });
    }
    if (this.report) {
      this.reportContainer = contentEl.createDiv();
      this.reportContainer.createEl("p", { text: t("Diagnostics contain versions and check outcomes only. Site, account, paths, connection identifiers, tokens and content are excluded.") });
      this.reportContainer.createEl("pre", { text: JSON.stringify(this.report, null, 2), cls: "cfs-setup-report" });
      new Setting(this.reportContainer).addButton(button => button.setButtonText(t("Copy diagnostics")).setDisabled(this.busy)
        .onClick(async () => {
          try { await navigator.clipboard.writeText(JSON.stringify(this.report, null, 2)); new Notice(t("Redacted diagnostics copied.")); }
          catch { new Notice(t("Could not copy diagnostics. Select the displayed report manually.")); }
        }));
    }
    const navigation = new Setting(contentEl);
    navigation.addButton(button => button.setButtonText(t("Cancel")).onClick(() => this.close()));
    if (this.step > 0) navigation.addButton(button => button.setButtonText(t("Back")).setDisabled(this.busy)
      .onClick(() => { this.step--; this.issue = null; this.render(); }));
    if (this.step < 3) navigation.addButton(button => button.setButtonText(t("Next")).setDisabled(this.busy)
      .onClick(() => this.next()));
    else navigation.addButton(button => button.setButtonText(t("Save connection (read-only)")).setCta()
      .setDisabled(this.busy || !this.verified?.ok).onClick(() => this.save()));
  }

  next() {
    try {
      if (this.step === 0) setupTarget(this.draft);
      else if (this.step === 1) setupAccount(this.app, this.draft);
      else setupFolders(this.app, this.draft);
      this.step++;
      this.issue = null;
    } catch (error) { this.issue = setupIssueCode(error); }
    this.render();
  }

  async verify() {
    this.busy = true;
    this.issue = null;
    this.verified = null;
    this.render();
    const fingerprint = setupFingerprint(this.draft);
    try {
      const result = await this.plugin.testSetup(this.draft, () => this.guard(fingerprint));
      this.guard(fingerprint);
      this.verified = result;
      this.issue = result.checks.find(item => item.status === "fail")?.code;
    } catch (error) { this.issue = setupIssueCode(error); }
    finally {
      this.report = setupDiagnostics(this.plugin, this.verified, this.issue);
      this.busy = false;
      if (this.opened) this.render();
    }
  }

  async save() {
    this.busy = true;
    this.issue = null;
    this.render();
    const fingerprint = setupFingerprint(this.draft);
    try {
      await this.plugin.saveSetup(this.draft, this.verified, this.baseline, expected => this.guard(fingerprint, expected));
      this.saved = true;
      this.onSaved();
    } catch (error) { this.issue = setupIssueCode(error); this.verified = null; }
    finally {
      this.report = setupDiagnostics(this.plugin, this.verified, this.issue);
      this.busy = false;
      if (this.opened) this.render();
    }
  }
}
