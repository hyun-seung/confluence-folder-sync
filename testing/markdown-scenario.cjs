// Shared fidelity and sandbox assertions, also executed in real Obsidian Electron.
module.exports = async function markdownScenario(lib) {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const refs = [];
  const source = ["---", "private_fixture: keep_frontmatter_local", "---", "# Header **One**", "",
    "[Jump](#Header%20One)", "", "| Left | Right |", "| :--- | ---: |", "| a\\|b | [[Other|Alias]] |", "",
    "3. **First**", "   - Nested", "     - Deeper", "4. Second", "", "- [ ] Todo", "- [x] Done", "",
    "> [!warning] Check", "> Message with ~~removed~~ and `code`.", ">", "> - Subitem", "",
    "> [!note]- Collapsed", "> Saved details", "", "![remote](https://example.test/image.png)", "",
    "<script>example</script>", "", "```js", "const sample = '[[not a link]]';", "```"].join("\n");
  const linkFor = reference => '<a href="' + lib.xml(reference.target.startsWith("#") ?
    "https://example.test/page#header-one" : "https://example.test/reference") + '">' + (reference.labelHtml ?? lib.xml(reference.label)) + '</a>';
  const storage = lib.toStorage(lib.markdownLines(source, ref => refs.push(ref)), linkFor);
  check(!storage.includes("keep_frontmatter_local"), "Frontmatter was published");
  check(refs.some(ref => ref.target === "Other" && ref.label === "Alias") && !refs.some(ref => ref.target.includes("not a link")), "Wiki/table/code reference boundary changed");
  check(storage.includes('start="3"') && (storage.match(/<ul>/g) ?? []).length >= 3, "Nested ordered list lost");
  check(storage.includes('text-align:left') && storage.includes('text-align:right') && storage.includes('a|b'), "Table alignment or pipes lost");
  check(storage.includes('ac:name="warning"') && storage.includes('ac:name="expand"') && storage.includes('<s>removed</s>'), "Callout or strikethrough lost");
  check(!storage.includes('<script>') && !storage.includes('<img'), "Unsafe HTML or remote image emitted");
  const imported = lib.fromStorage(storage, "https://example.test/page");
  check(imported.includes("3. **First**") && imported.includes("- Deeper"), "Imported list hierarchy/start lost");
  check(imported.includes('[!warning] Check') && imported.includes('[!note]- Collapsed') && imported.includes('~~removed~~'), "Imported callout/strike lost");
  check(imported.includes("[ ] Todo") && imported.includes("[x] Done"), "Task state lost");
  check(imported.includes('a\\|b') && imported.includes('---:') && imported.includes('<#Header%20One>'), "Imported table/anchor lost");
  const again = lib.toStorage(lib.markdownLines(imported), linkFor);
  check(again.includes('ac:name="warning"') && again.includes('ac:name="expand"') && again.includes('start="3"'), "Round trip lost structures");
  const merged = lib.fromStorage('<table><tbody><tr><th colspan="2">Merged</th></tr><tr><td>A</td><td>B</td></tr></tbody></table>', 'https://example.test/page');
  check(merged.startsWith('```html') && merged.includes('colspan="2"'), "Merged table silently flattened");
  const titleLink = lib.fromStorage('<ac:link><ri:page ri:content-title="Unknown" /><ac:plain-text-link-body><![CDATA[Named page]]></ac:plain-text-link-body></ac:link>', 'https://example.test/page');
  check(!titleLink.includes('https://example.test/page') && titleLink.includes('Named page'), "Unknown page link fabricated a self-link");
  const duplicateHeadings = lib.toStorage(lib.markdownLines('# Duplicate\n\n# Duplicate'), linkFor);
  const duplicateLink = lib.fromStorage(duplicateHeadings + '<p><a href="https://example.test/page#duplicate-1">second</a></p>', 'https://example.test/page');
  check(duplicateLink.includes('https://example.test/page#duplicate-1'), "Duplicate heading target changed on import");
  const codeTable = lib.fromStorage('<table><tbody><tr><th>Code</th></tr><tr><td><code>a|b</code></td></tr></tbody></table>', 'https://example.test/page');
  const codeTableStorage = lib.toStorage(lib.markdownLines(codeTable), linkFor);
  check(codeTableStorage.includes('<code>a|b</code>'), "Code pipe split an imported table cell");
  const renderer = new lib.LocalMermaid();
  const diagram = 'flowchart LR\n A[Start] --> B[완료]';
  const png = await renderer.render(diagram);
  check(png.data.byteLength > 100 && png.name.endsWith('-mermaid.png'), "Offline PNG missing");
  const another = new lib.LocalMermaid();
  check((await another.render(diagram)).hash === png.hash, "Repeated diagram PNG differs");
  for (const code of ['sequenceDiagram\n A->>B: Ping\n B-->>A: Pong', 'classDiagram\n class Example\n Example : +run()']) {
    check((await renderer.render(code)).data.byteLength > 100, "Supported diagram failed");
  }
  for (const unsafe of ['%%{init: {securityLevel: "loose"}}%%\nflowchart LR\n A-->B',
    'flowchart LR\n A["<img src=https://example.test/secret>"]', 'flowchart LR\n click A "https://example.test"',
    '---\nconfig: {}\n---\nflowchart LR\n A-->B', 'flowchart LR\n' + 'x'.repeat(20_001)]) {
    let rejected = false;
    try { await renderer.render(unsafe); } catch (error) { rejected = error.message === lib.MERMAID_ERROR; }
    check(rejected, "Unsafe or oversized Mermaid accepted");
  }
  let syntaxFailed = false;
  try { await renderer.render('flowchart LR\n A[private_fixture_unclosed'); } catch (error) {
    syntaxFailed = error.message === lib.MERMAID_ERROR && !error.message.includes('private_fixture');
  }
  check(syntaxFailed, "Invalid syntax did not produce a redacted error");
  const units = lib.markdownLines('```mermaid\n' + diagram + '\n```');
  units[0].cfsDiagram = png;
  const diagramStorage = lib.toStorage(units, linkFor);
  const restored = lib.fromStorage(diagramStorage, 'https://example.test/page', new Map([[png.name, { path: 'assets/diagram.png', image: true }]]));
  check(restored.includes('![Mermaid diagram]') && lib.markdownLines(restored).some(token => token.type === 'fence' && token.content.trim() === diagram) && restored.includes('[!note]- Mermaid source'), "Mermaid image/source import lost");
  check(!document.querySelector('iframe[sandbox]'), "Renderer leaked frames");
  const cancelled = new lib.LocalMermaid();
  const pending = cancelled.renderFrame(diagram);
  cancelled.dispose();
  let cancelledSafely = false;
  try { await pending; } catch { cancelledSafely = true; }
  check(cancelledSafely && !document.querySelector('iframe[sandbox]'), "Renderer cancellation leaked frames");
  const timeoutRenderer = new lib.LocalMermaid();
  const timedOut = timeoutRenderer.renderFrame(diagram);
  document.querySelector('iframe[sandbox]').remove(); // Simulate a renderer that never replies.
  let timeoutSafely = false;
  try { await timedOut; } catch { timeoutSafely = true; }
  check(timeoutSafely && timeoutRenderer.jobs.size === 0 && !document.querySelector('iframe[sandbox]'), "Renderer timeout leaked resources");
  renderer.dispose(); another.dispose(); timeoutRenderer.dispose();
  return { fidelity: true, offlinePng: true, deterministic: true, sandboxNativeCapabilities: 'blocked', imageAndSource: true };
};
