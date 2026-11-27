const CONNECTION_KEYS = ["folderUrl", "source", "inbox", "email", "secretId", "allowPublish", "autoCheck", "autoPublish", "autoMinutes", "mermaidMode", "connectionMode"];
const TEMPLATE_SCHEMA = "confluence-folder-sync/setup-template";
const CONNECTION_STALE = "The active connection changed. Reopen this window and review again.";

function connectionContext(plugin) {
  return JSON.stringify([plugin.data?.activeConnectionId ?? "legacy", plugin.connectionEpoch ?? 0]);
}

function assertConnection(plugin, expected) {
  if (plugin.unloaded) { const error = new Error("The operation was cancelled. Completed changes are preserved."); error.name = "AbortError"; throw error; }
  if (expected !== connectionContext(plugin)) throw new SyncError(CONNECTION_STALE);
}

class ConnectionScopedModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.connectionContext = connectionContext(plugin);
  }
  checkConnection() { assertConnection(this.plugin, this.connectionContext); }
}

function connectionSettings(settings) {
  const result = Object.fromEntries(CONNECTION_KEYS.map(key => [key, settings[key] ?? DEFAULT_SETTINGS[key]]));
  if (result.connectionMode === "read-only") result.allowPublish = result.autoPublish = false;
  return result;
}

function connectionName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new SyncError("Use a connection name of 1 to 80 characters without control characters.");
  }
  return normalized(value.trim());
}

function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function loadConnections(stored) {
  const invalid = () => { throw new SyncError("Saved connections are invalid. Restore plugin data from a backup."); };
  if (stored.settings !== undefined && !plainRecord(stored.settings)) invalid();
  const settings = { ...DEFAULT_SETTINGS, ...stored.settings };
  if (!["publisher", "read-only"].includes(settings.connectionMode)) invalid();
  if (stored.connections === undefined) {
    if (stored.connectionSchema !== undefined || stored.activeConnectionId !== undefined) invalid();
    if (stored.settings === undefined) settings.connectionMode = "read-only";
    return { settings, activeConnectionId: "default", connectionSchema: 1,
      connections: { default: { name: "Default connection", settings: connectionSettings(settings) } } };
  }
  if (stored.connectionSchema !== 1 || !plainRecord(stored.connections) ||
      Object.keys(stored.connections).length < 1 || Object.keys(stored.connections).length > 32 ||
      !Object.hasOwn(stored.connections, stored.activeConnectionId)) invalid();
  const names = new Set();
  const connections = {};
  for (const [id, entry] of Object.entries(stored.connections)) {
    if (!/^(?:default|[a-f0-9-]{36})$/.test(id) || !plainRecord(entry) || !plainRecord(entry.settings)) invalid();
    let name;
    try { name = connectionName(entry.name); } catch { invalid(); }
    if (names.has(name.toLowerCase())) invalid();
    names.add(name.toLowerCase());
    for (const key of CONNECTION_KEYS) {
      const value = entry.settings[key];
      if (value !== undefined && typeof value !== typeof DEFAULT_SETTINGS[key]) invalid();
    }
    if (!["publisher", "read-only"].includes(entry.settings.connectionMode)) invalid();
    connections[id] = { name, settings: connectionSettings(entry.settings) };
  }
  return { connectionSchema: 1, connections, activeConnectionId: stored.activeConnectionId,
    settings: { ...settings, ...connections[stored.activeConnectionId].settings } };
}

function syncActiveConnection(data) {
  const active = data.connections?.[data.activeConnectionId];
  if (active) active.settings = connectionSettings(data.settings);
}

function activeConnectionName(plugin) {
  const name = plugin.data.connections?.[plugin.data.activeConnectionId]?.name;
  return name === "Default connection" || !name ? plugin.t("Default connection") : name;
}

function checkConnectionScopes(data, settings) {
  const current = configuredFolders(settings.source, settings.inbox);
  const scopePath = value => { try { return vaultPath(value).toLowerCase(); } catch { return null; } };
  for (const [id, entry] of Object.entries(data.connections ?? {})) {
    if (id === data.activeConnectionId) continue;
    const other = entry.settings;
    for (const [inbox, source] of [[current.inbox, other.source], [other.inbox, current.source]]) {
      const importPath = scopePath(inbox);
      const sourcePath = scopePath(source);
      if (importPath && sourcePath && (pathIn(importPath, sourcePath) || pathIn(sourcePath, importPath))) {
        throw new SyncError("Import folders must not overlap any saved connection's source folder.");
      }
    }
  }
}

function canonicalTemplateTarget(value, importing = false) {
  if (typeof value !== "string" || value.length > 2048) throw new SyncError("The setup template is invalid or unsupported.");
  try {
    const target = confluenceTarget(value);
    const url = new URL(value.trim());
    if (importing && (url.search || url.hash)) throw new Error();
    const space = /^\/wiki\/spaces\/([~a-zA-Z0-9_-]+)\//.exec(url.pathname)[1];
    return target.origin + "/wiki/spaces/" + space + "/folder/" + target.folderId;
  } catch { throw new SyncError("The setup template is invalid or unsupported."); }
}

function setupTemplate(settings, includeTarget = false) {
  const result = { schema: TEMPLATE_SCHEMA, version: 1,
    role: settings.connectionMode === "read-only" ? "read-only" : "publisher",
    preferences: { mermaidMode: settings.mermaidMode === "image" ? "image" : "code",
      autoMinutes: [5, 15, 60].includes(settings.autoMinutes) ? settings.autoMinutes : 5 } };
  if (includeTarget) result.target = { folderUrl: canonicalTemplateTarget(settings.folderUrl) };
  return JSON.stringify(result, null, 2) + "\n";
}

function parseSetupTemplate(text) {
  const invalid = () => { throw new SyncError("The setup template is invalid or unsupported."); };
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > 8192) invalid();
  let value;
  try { value = JSON.parse(text); } catch { invalid(); }
  const keys = (object, allowed, required = allowed) => plainRecord(object) &&
    Object.keys(object).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(object, key));
  if (!keys(value, ["schema", "version", "role", "preferences", "target"], ["schema", "version", "role", "preferences"]) ||
      value.schema !== TEMPLATE_SCHEMA || value.version !== 1 || !["publisher", "read-only"].includes(value.role) ||
      !keys(value.preferences, ["mermaidMode", "autoMinutes"]) ||
      !["code", "image"].includes(value.preferences.mermaidMode) || ![5, 15, 60].includes(value.preferences.autoMinutes)) invalid();
  const result = { role: value.role, preferences: { mermaidMode: value.preferences.mermaidMode, autoMinutes: value.preferences.autoMinutes } };
  if (Object.hasOwn(value, "target")) {
    if (!keys(value.target, ["folderUrl"])) invalid();
    result.target = { folderUrl: canonicalTemplateTarget(value.target.folderUrl, true) };
  }
  return result;
}

async function changeConnection(plugin, action, expected, check = () => {}) {
  if (plugin.setupSaving || plugin.connectionSaving) throw new SyncError("Wait until connection settings finish saving.");
  return plugin.exclusive(async () => {
    assertConnection(plugin, expected);
    check();
    const previous = { settings: structuredClone(plugin.data.settings), connections: structuredClone(plugin.data.connections),
      activeConnectionId: plugin.data.activeConnectionId };
    const book = structuredClone(plugin.data.connections);
    const active = plugin.data.activeConnectionId;
    book[active].settings = connectionSettings(plugin.data.settings);
    let nextId = active;
    let settings = structuredClone(plugin.data.settings);
    let result = active;
    if (action.kind === "create" || action.kind === "import") {
      if (Object.keys(book).length >= 32) throw new SyncError("You can save up to 32 connections.");
      const name = connectionName(action.name);
      if (Object.values(book).some(entry => entry.name.toLowerCase() === name.toLowerCase())) throw new SyncError("A connection with that name already exists.");
      const template = action.kind === "import" ? parseSetupTemplate(action.text) : null;
      nextId = crypto.randomUUID();
      const nextSettings = connectionSettings({ ...DEFAULT_SETTINGS, connectionMode: template?.role ?? "read-only",
        ...(template?.preferences ?? {}), folderUrl: template?.target?.folderUrl ?? "" });
      book[nextId] = { name, settings: nextSettings };
      settings = { ...settings, ...nextSettings };
      result = nextId;
    } else if (action.kind === "switch") {
      if (!Object.hasOwn(book, action.id)) throw new SyncError("Choose an existing connection.");
      nextId = action.id;
      settings = { ...settings, ...book[nextId].settings };
    } else if (action.kind === "rename") {
      if (!Object.hasOwn(book, action.id)) throw new SyncError("Choose an existing connection.");
      const name = connectionName(action.name);
      if (Object.entries(book).some(([id, entry]) => id !== action.id && entry.name.toLowerCase() === name.toLowerCase())) throw new SyncError("A connection with that name already exists.");
      book[action.id].name = name;
    } else if (action.kind === "remove") {
      if (action.id === active || !Object.hasOwn(book, action.id) || Object.keys(book).length === 1) {
        throw new SyncError("Switch to another connection before removing this one.");
      }
      delete book[action.id];
    } else throw new SyncError("Choose an existing connection.");
    // Activation is deliberate; background checks and uploads require a new opt-in.
    settings.autoCheck = settings.autoPublish = false;
    book[active].settings.autoCheck = book[active].settings.autoPublish = false;
    if (settings.connectionMode === "read-only") settings.allowPublish = false;
    plugin.connectionSaving = true;
    plugin.connectionEpoch = (plugin.connectionEpoch ?? 0) + 1;
    plugin.automatic?.clearTimers();
    plugin.data.settings = settings;
    plugin.data.connections = book;
    plugin.data.activeConnectionId = nextId;
    const savedContext = connectionContext(plugin);
    try {
      check();
      await plugin.persist();
      check();
      assertConnection(plugin, savedContext);
    } catch (error) {
      previous.settings.autoCheck = previous.settings.autoPublish = false;
      Object.assign(plugin.data, previous);
      plugin.connectionEpoch++;
      try { await plugin.persist(); } catch { throw new SyncError("Connection save outcome is uncertain. Reopen settings and inspect saved connections."); }
      throw error;
    } finally {
      plugin.connectionSaving = false;
      plugin.automaticStatus = "";
      if (plugin.automatic) { plugin.automatic.lastAttempt = 0; plugin.automatic.lastMessage = ""; }
      plugin.automatic?.configure();
    }
    return result;
  });
}
