// Runs in the Chromium shim and actual Obsidian, using synthetic vaults only.
module.exports = async function connectionsScenario(lib, plugin, options = {}) {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  const t = (message, values) => plugin.t(message, values);
  const before = JSON.stringify([plugin.data.profiles, plugin.data.history, plugin.data.backups]);
  const originalId = plugin.data.activeConnectionId;
  const originalSettings = structuredClone(plugin.data.settings);
  const originalConfirm = plugin.confirm;
  plugin.confirm = async () => true;
  const panel = new lib.ConnectionsModal(plugin);
  const stale = new lib.SyncDashboard(plugin);
  stale.open();
  panel.open();
  check(panel.modalEl.isConnected, 'Connection modal is not attached to the app');
  const button = label => {
    const element = [...panel.contentEl.querySelectorAll('button')].find(node => node.textContent === t(label));
    check(element && !element.disabled, 'Connection control unavailable: ' + label);
    return element;
  };
  const click = async label => {
    const element = button(label);
    element.click();
    if (element.pending) await element.pending;
    await tick();
    const deadline = Date.now() + 5000;
    while (panel.busy && Date.now() < deadline) await tick();
    check(!panel.busy, 'Connection action timed out: ' + label);
  };
  const field = (label, value) => {
    const row = [...panel.contentEl.querySelectorAll('.setting-item')].find(node => node.textContent.startsWith(t(label)));
    const input = row?.querySelector('input');
    check(input, 'Connection field unavailable: ' + label);
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const select = id => {
    const input = panel.contentEl.querySelector('select');
    input.value = id; input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  try {
    await click('Preview template');
    check(panel.exportText && !panel.exportText.includes('folderUrl'), 'Template included an unapproved target');
    for (const key of ['email', 'secretId', 'source', 'inbox', 'connections', 'pages']) {
      check(!Object.hasOwn(JSON.parse(panel.exportText), key), 'Template leaked a local setting');
    }
    const targetToggle = [...panel.contentEl.querySelectorAll('.setting-item')].find(node => node.textContent.startsWith(t('Include Confluence target URL')))?.querySelector('input');
    check(targetToggle, 'Target opt-in control missing');
    targetToggle.click();
    check(!panel.exportText, 'Target opt-in kept a stale preview');
    await click('Preview template');
    const shared = panel.exportText;
    check(JSON.parse(shared).target.folderUrl.endsWith('/folder/100'), 'Target preview was not canonical');
    options.onPreview?.(panel.modalEl);

    if (options.download) {
      const create = URL.createObjectURL;
      const revoke = URL.revokeObjectURL;
      const anchorClick = HTMLAnchorElement.prototype.click;
      let blob;
      let filename;
      try {
        URL.createObjectURL = value => { blob = value; return 'blob:synthetic-template-export'; };
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function () { filename = this.download; };
        await click('Download template');
        check(filename === 'confluence-folder-sync-template.json' && await blob.text() === shared, 'Downloaded template contents/name changed');
      } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; HTMLAnchorElement.prototype.click = anchorClick; }
    }

    field('New connection name', 'Second fixture');
    await click('Create connection');
    const secondId = plugin.data.activeConnectionId;
    check(secondId !== originalId && plugin.data.settings.connectionMode === 'read-only', 'New connection inherited publishing access');
    check(!plugin.data.settings.allowPublish && !plugin.data.settings.autoCheck && !plugin.data.settings.autoPublish, 'New connection enabled automation');
    check(plugin.data.settings.email === '' && plugin.data.settings.secretId === '', 'New connection inherited credentials');
    const originalRun = plugin.run;
    let commands = 0;
    plugin.run = () => { commands++; };
    try {
      const importButton = [...stale.contentEl.querySelectorAll('button')].find(node => node.textContent === t('Import new pages'));
      check(importButton, 'Stale import command missing');
      importButton.click(); await tick();
    } finally { plugin.run = originalRun; }
    check(commands === 0, 'Stale dashboard command used the new connection');
    let operations = 0;
    const originalOperation = plugin.operation;
    plugin.operation = async () => { operations++; };
    try { await stale.perform('Loading Confluence pages…', async () => {}); }
    finally { plugin.operation = originalOperation; }
    check(operations === 0 && stale.status === t('The active connection changed. Reopen this window and review again.'), 'Stale dashboard reached the new connection');

    field('Connection name', 'Renamed fixture');
    await click('Rename connection');
    check(plugin.data.connections[secondId].name === 'Renamed fixture', 'Rename was not saved');
    const transfer = new DataTransfer();
    transfer.items.add(new File([shared], 'synthetic-team.json', { type: 'application/json' }));
    const fileInput = panel.contentEl.querySelector('input[type=file]');
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change'));
    for (let attempt = 0; !panel.importPreview && attempt < 100; attempt++) await tick();
    check(panel.importText === shared, 'Template file was not read locally');
    check(panel.importPreview, 'Template validation failed');
    field('New connection name', 'Imported fixture');
    let approveImport;
    plugin.confirm = () => new Promise(resolve => { approveImport = resolve; });
    const staleImport = panel.import();
    await tick();
    check(approveImport, 'Template import confirmation missing');
    await panel.change({ kind: 'switch', id: originalId });
    panel.importText = shared;
    panel.newName = 'Imported fixture';
    approveImport(true); await staleImport;
    check(Object.keys(plugin.data.connections).length === 2, 'Stale import confirmation created a connection after switching');
    plugin.confirm = async () => true;
    panel.render();
    await click('Validate template');
    await click('Import as new connection');
    const importedId = plugin.data.activeConnectionId;
    check(importedId !== secondId && plugin.data.settings.folderUrl.endsWith('/folder/100'), 'Imported connection did not receive its approved target');
    check(!plugin.data.settings.email && !plugin.data.settings.secretId && !plugin.data.settings.allowPublish, 'Import reused credentials or enabled publication');
    check(plugin.data.settings.source === lib.DEFAULT_SETTINGS.source && plugin.data.settings.inbox === lib.DEFAULT_SETTINGS.inbox, 'Import contained a source path');

    select(originalId);
    await click('Switch connection');
    check(plugin.data.settings.email === originalSettings.email && plugin.data.settings.secretId === originalSettings.secretId && plugin.data.settings.source === originalSettings.source, 'Switch did not restore the original account/source');
    select(secondId);
    let approveRemoval;
    plugin.confirm = () => new Promise(resolve => { approveRemoval = resolve; });
    const staleRemoval = panel.remove();
    await tick();
    check(approveRemoval, 'Removal confirmation missing');
    await panel.change({ kind: 'switch', id: importedId });
    approveRemoval(true); await staleRemoval;
    check(plugin.data.connections[secondId], 'Stale removal confirmation deleted a connection after switching');
    plugin.confirm = async () => true;
    select(originalId); await click('Switch connection');
    for (const id of [secondId, importedId]) {
      select(id); await click('Remove saved connection');
      check(!plugin.data.connections[id], 'Inactive connection removal failed');
    }
    panel.importText = '{"token":"private-fixture-value"}';
    panel.render();
    await click('Validate template');
    check(!panel.importPreview && panel.status === t('The setup template is invalid or unsupported.'), 'Invalid template did not fail closed');
    check(!panel.status.includes('private-fixture-value'), 'Template validation leaked private input');
    check(JSON.stringify([plugin.data.profiles, plugin.data.history, plugin.data.backups]) === before, 'Connection management altered documents links/history/backups');
    return { namedConnections: true, templatePrivacy: true, templateImport: true, staleContextBlocked: true, mappingsPreserved: true };
  } finally { panel.close(); stale.close(); plugin.confirm = originalConfirm; }
};
