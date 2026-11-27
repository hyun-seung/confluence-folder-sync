const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const lib = new Function('require', 'module', readFileSync(join(__dirname, '../main.js'), 'utf8') +
  '\nreturn { LocalMermaid, automaticCandidates, prepareMappingChange, applyMappingChange, publicationTarget, validatedConfig, markdownLines, toStorage, checkMermaidSource, MERMAID_ERROR, mermaidRenderers, digest, Publisher, publicationReview, preparedNotes, publishSelection, ConfluenceFolderSync, checkPublicationInput };')(
  () => ({ Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {} }), { exports: {} });
const { selectionFixture } = require('./fixtures.cjs');
async function diagramFixture() {
  const fixture = selectionFixture(lib);
  fixture.config.mermaidMode = 'image';
  fixture.files.splice(1);
  fixture.bodies.set('Docs/One.md', '# One\n\n```mermaid\nflowchart LR\n A-->B\n```');
  const data = new Uint8Array([137,80,78,71,13,10,26,10,1]).buffer;
  const hash = await lib.digest(data);
  const asset = { data, hash, name: 'cfs-' + hash.slice(0,24) + '-mermaid.png' };
  lib.mermaidRenderers.set(fixture.app, { render: async () => asset });
  return { ...fixture, asset };
}
test('a formatter upgrade preserves an unchanged 0.8 page in both review and writer', async () => {
  const f = selectionFixture(lib);
  const first = await f.review();
  await f.publish(first, ['Docs/One.md']);
  const entry = f.profile.pages['file:Docs/One.md'];
  delete entry.formatRevision;
  entry.bodyHash = await lib.digest('<p>Old formatter</p>');
  f.remote.records.get(entry.id).body.storage.value = '<p>Old formatter</p>';
  const updates = f.remote.stats.updates;
  assert.equal((await f.review()).rows.find(row => row.path === 'Docs/One.md').status, 'Unchanged');
  const tree = await lib.preparedNotes(f.app, f.config);
  tree.notes = tree.notes.filter(note => note.path === 'Docs/One.md'); tree.folders = [];
  await new lib.Publisher(f.remote, f.app, f.profile, async () => {}).publish(tree, await f.remote.catalog());
  assert.equal(f.remote.stats.updates, updates);
  f.bodies.set('Docs/One.md', '# One\nEdited');
  assert.equal((await f.review()).rows.find(row => row.path === 'Docs/One.md').status, 'Changed');
  await f.publish(await f.review(), ['Docs/One.md']);
  assert.equal(entry.formatRevision, 1);
});
test('image mode uses generated attachments without trying to read a synthetic vault file', async () => {
  const f = await diagramFixture();
  f.app.vault.readBinary = async () => { throw new Error('Unexpected disk read'); };
  const tree = await lib.preparedNotes(f.app, f.config);
  assert.equal(tree.notes[0].assets.size, 0);
  assert.equal(tree.notes[0].diagrams.size, 1);
  await f.publish(await f.review(), ['Docs/One.md']);
  assert.equal(f.remote.stats.uploads, 1);
  const entry = f.profile.pages['file:Docs/One.md'];
  assert.equal(entry.remoteAttachments.length, 1);
  const body = f.remote.records.get(entry.id).body.storage.value;
  assert.match(body, /ac:name="expand"/);
  assert.match(body, /A-->B/);
  assert.match(body, /cfs-.*-mermaid.png/);
  assert.equal((await f.review()).rows[0].status, 'Unchanged');
});
test('a local Mermaid failure becomes Conflict before creating or uploading anything', async () => {
  const f = await diagramFixture();
  lib.mermaidRenderers.set(f.app, { render: async () => { throw new Error(lib.MERMAID_ERROR); } });
  const review = await f.review();
  assert.equal(review.rows[0].status, 'Conflict');
  await assert.rejects(f.publish(review, ['Docs/One.md']));
  assert.deepEqual(f.remote.stats, { creates: 0, updates: 0, uploads: 0 });
});
test('code to image mode is an explicit changed input and code mode retains source only', async () => {
  const f = await diagramFixture();
  f.config.mermaidMode = 'code';
  await f.publish(await f.review(), ['Docs/One.md']);
  const initial = f.profile.pages['file:Docs/One.md'].inputHash;
  f.config.mermaidMode = 'image';
  const review = await f.review();
  assert.equal(review.rows[0].status, 'Changed');
  assert.notEqual(review.rows[0].inputHash, initial);
  await f.publish(review, ['Docs/One.md']);
  assert.equal(f.remote.stats.uploads, 1);
  f.config.mermaidMode = 'code';
  await f.publish(await f.review(), ['Docs/One.md']);
  assert.doesNotMatch(f.remote.records.get(f.profile.pages['file:Docs/One.md'].id).body.storage.value, /<ac:image/);
  assert.equal(f.remote.stats.uploads, 1); // Prior attachment is retained, never deleted.
});
test('a generated PNG changing after approval blocks selected publication', async () => {
  const f = await diagramFixture();
  const review = await f.review();
  const data = new Uint8Array([1,2,3]).buffer;
  lib.mermaidRenderers.set(f.app, { render: async () => ({ data, hash: await lib.digest(data), name: 'other.png' }) });
  await assert.rejects(f.publish(review, ['Docs/One.md']), /Refresh the publication review/);
  assert.equal(f.remote.stats.creates, 0);
});
test('mutating cached PNG bytes is detected before any write', async () => {
  const f = await diagramFixture();
  const tree = await lib.preparedNotes(f.app, f.config);
  new Uint8Array(f.asset.data)[8] = 2;
  await assert.rejects(lib.checkPublicationInput(f.app, tree.notes[0], f.config.source), /Refresh the publication review/);
});
test('a lost PNG upload response recovers its durable intent without a second upload', async () => {
  const f = await diagramFixture();
  const upload = f.remote.upload;
  let lost = false;
  f.remote.upload = async (...args) => { await upload(...args); if (!lost) { lost = true; throw new Error('Synthetic lost response'); } };
  await assert.rejects(f.publish(await f.review(), ['Docs/One.md']), /lost response/);
  assert.equal(f.remote.stats.uploads, 1);
  const review = await f.review();
  assert.equal(review.rows[0].status, 'Changed');
  await f.publish(review, ['Docs/One.md']);
  assert.equal(f.remote.stats.uploads, 1);
  const entry = f.profile.pages['file:Docs/One.md'];
  assert.equal(entry.remoteAttachments.length, 1);
  assert.equal(entry.uploadIntents, undefined);
});
test('a lost page response recovers PNG inventory and the new formatter baseline', async () => {
  const f = await diagramFixture();
  const update = f.remote.update;
  let lost = false;
  f.remote.update = async (...args) => { const result = await update(...args); if (!lost) { lost = true; throw new Error('Synthetic lost response'); } return result; };
  await assert.rejects(f.publish(await f.review(), ['Docs/One.md']), /lost response/);
  await f.publish(await f.review(), ['Docs/One.md']);
  const entry = f.profile.pages['file:Docs/One.md'];
  assert.equal(entry.pending, undefined);
  assert.equal(entry.formatRevision, 1);
  assert.equal(entry.remoteAttachments.length, 1);
  assert.equal(f.remote.stats.uploads, 1);
  assert.equal(f.remote.stats.updates, 1);
  assert.equal((await f.review()).rows[0].status, 'Unchanged');
});
test('changing Mermaid mode disables automatic publication', async () => {
  const plugin = { data: { settings: { autoPublish: true } }, persist: async () => {}, automatic: { configure() {} } };
  await lib.ConfluenceFolderSync.prototype.configure.call(plugin, 'mermaidMode', 'image');
  assert.equal(plugin.data.settings.autoPublish, false);
});
test('nested fenced/inline examples are not treated as links and CDATA terminators survive', () => {
  const references = [];
  const units = lib.markdownLines('> ```txt\n> [[Private]]\n> ]]>\n> ```\n\n- `[[Inline]]`\n- [[Real]]', ref => references.push(ref.target));
  assert.deepEqual(references, ['Real']);
  const body = lib.toStorage(units, ref => ref.label);
  assert.match(body, /\]\]\]\]><!\[CDATA\[>/);
});
test('styled and duplicate multilingual heading anchors are stable', () => {
  const result = lib.toStorage(lib.markdownLines('# **제목** One\n\n# 제목 One'), ref => ref.label);
  assert.match(result, />제목-one<\/ac:parameter>/);
  assert.match(result, />제목-one-1<\/ac:parameter>/);
});
for (const [label, source] of Object.entries({ directive: '%%{init:{}}%%\nflowchart LR\n A-->B',
  html: 'flowchart LR\n A[<script>]', url: 'flowchart LR\n click A "https://example.test"',
  size: 'flowchart LR\n' + 'a'.repeat(20_001), words: 'flowchart LR\n' + 'A '.repeat(601),
  edges: 'flowchart LR\n' + 'A-->'.repeat(201) + 'B' })) {
  test('Mermaid preflight rejects ' + label, () => assert.throws(() => lib.checkMermaidSource(source), { message: lib.MERMAID_ERROR }));
}

test('generated Mermaid publications migrate source roots without writes or lost identity', async () => {
  const f = await diagramFixture();
  await f.publish(await f.review(), ['Docs/One.md']);
  const data = { settings: f.config, profiles: { [lib.publicationTarget(f.config)]: f.profile } };
  const id = f.profile.pages['file:Docs/One.md'].id;
  const stats = { ...f.remote.stats };
  for (const source of ['Moved', 'Docs']) {
    const fromTarget = lib.publicationTarget(f.config);
    const old = f.files[0].path;
    f.files[0].path = source + '/One.md';
    f.bodies.set(f.files[0].path, f.bodies.get(old)); f.bodies.delete(old);
    f.config.source = source;
    const target = lib.publicationTarget(f.config);
    data.profiles[target] ??= { pages: {}, folders: {}, imports: {} };
    const plan = await lib.prepareMappingChange(f.app, f.remote, data, { action: 'migrate', fromTarget });
    await lib.applyMappingChange(f.app, f.remote, data, async () => {}, plan);
    const entry = data.profiles[target].pages['file:' + source + '/One.md'];
    assert.equal(entry.id, id);
    assert.equal(entry.inputHash, (await lib.preparedNotes(f.app, f.config)).notes[0].inputHash);
  }
  assert.deepEqual(f.remote.stats, stats);
});
test('literal and duplicate heading names cannot allocate the same anchor', () => {
  const body = lib.toStorage(lib.markdownLines('# A\n\n# A\n\n# A-1'), ref => ref.label);
  const ids = [...body.matchAll(/ac:name="">([^<]+)<\/ac:parameter>/g)].map(match => match[1]);
  assert.deepEqual(ids, ['a', 'a-2', 'a-1']);
});

test('an actual 0.8 reference-image baseline cannot auto-publish new parser discoveries', async () => {
  const baseline = require('./legacy-08-reference-image.json');
  const f = selectionFixture(lib);
  f.files.splice(1);
  f.bodies.set('Docs/One.md', baseline.source);
  const picture = { path: 'Docs/picture.png', name: 'picture.png', extension: 'png', stat: { size: 2 } };
  f.app.metadataCache.getFirstLinkpathDest = target => target === 'picture.png' ? picture : null;
  f.app.vault.readBinary = async () => new Uint8Array([1,2]).buffer;
  const page = await f.remote.create('page', 'One', '100', baseline.storage);
  f.profile.pages['file:Docs/One.md'] = { ...structuredClone(baseline.entry), id: page.id, version: 1 };
  assert.equal(f.remote.stats.uploads, 0);
  const tree = await lib.preparedNotes(f.app, f.config);
  const review = await lib.publicationReview(f.app, f.remote, f.profile, tree, await f.remote.catalog());
  assert.equal(review.rows[0].status, 'Changed');
  assert.equal(review.rows[0].formatReviewRequired, true);
  assert.deepEqual(lib.automaticCandidates(review, f.profile, tree), []);
  assert.equal(f.remote.stats.uploads, 0);
  await lib.publishSelection(f.app, f.remote, f.profile, async () => {}, review, ['Docs/One.md']);
  assert.equal(f.remote.stats.uploads, 1);
});
test('disposing during asynchronous hashing cannot start a new frame', async () => {
  const previous = globalThis.document;
  globalThis.document = {};
  try {
    const renderer = new lib.LocalMermaid();
    let frames = 0;
    renderer.renderFrame = async () => { frames++; return new ArrayBuffer(0); };
    const pending = renderer.render('flowchart LR\n A-->B');
    renderer.dispose();
    await assert.rejects(pending, { message: lib.MERMAID_ERROR });
    assert.equal(frames, 0);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
test('unloading during the first fence stops subsequent rendering and preparation', async () => {
  const f = await diagramFixture();
  f.bodies.set('Docs/One.md', f.bodies.get('Docs/One.md') + '\n\n```mermaid\nflowchart LR\n B-->C\n```');
  let unloaded = false;
  let calls = 0;
  f.config.checkPreparation = () => { if (unloaded) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; } };
  lib.mermaidRenderers.set(f.app, { render: async () => { calls++; unloaded = true; return f.asset; } });
  await assert.rejects(lib.preparedNotes(f.app, f.config), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('modal cancellation during a diagram stops before the next fence and creates no remote state', async () => {
  const f = await diagramFixture();
  f.bodies.set('Docs/One.md', f.bodies.get('Docs/One.md') + '\n\n```mermaid\nflowchart LR\n B-->C\n```');
  const review = await f.review();
  let cancelled = false;
  let renderCalls = 0;
  lib.mermaidRenderers.set(f.app, { render: async () => { renderCalls++; cancelled = true; return f.asset; } });
  await assert.rejects(lib.publishSelection(f.app, f.remote, f.profile, async () => {}, review, ['Docs/One.md'], {
    check: async () => { if (cancelled) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; } },
  }), { name: 'AbortError' });
  assert.equal(renderCalls, 1);
  assert.deepEqual(f.remote.stats, { creates: 0, updates: 0, uploads: 0 });
});
