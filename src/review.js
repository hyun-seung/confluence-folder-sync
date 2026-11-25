function reviewHunks(before, after) {
  const diff = diffLines(before, after);
  if (!diff) return [];
  const lines = diff.split("\n");
  const first = /^@@ from line (\d+) @@$/.exec(lines.shift());
  if (!first || lines[0]?.startsWith("Large comparison:")) {
    throw new Error("This comparison is too large for selective application. Use the regular preview.");
  }
  const base = before.trimEnd().split("\n");
  const hunks = [];
  let offset = Number(first[1]) - 1;
  let active;
  for (const line of lines) {
    const marker = line[0];
    if (marker === " ") {
      if (active) hunks.push(active);
      active = null;
      offset++;
      continue;
    }
    if (marker !== "-" && marker !== "+") throw new Error("The comparison could not be split into changes.");
    active ??= { offset, remove: [], insert: [] };
    if (marker === "-") {
      active.remove.push(line.slice(1));
      offset++;
    } else {
      active.insert.push(line.slice(1));
    }
  }
  if (active) hunks.push(active);
  return hunks.map(hunk => ({
    ...hunk,
    before: nearestNonblank(base, hunk.offset - 1, -1),
    after: nearestNonblank(base, hunk.offset + hunk.remove.length, 1),
  }));
}

function nearestNonblank(lines, position, step) {
  for (let at = position; at >= 0 && at < lines.length; at += step) {
    if (lines[at].trim()) return lines[at];
  }
  return null;
}

function textLines(text) {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function matchHunk(lines, hunk) {
  const locations = [];
  const matchesContext = start => {
    const before = nearestNonblank(lines, start - 1, -1);
    const after = nearestNonblank(lines, start + hunk.remove.length, 1);
    return before === hunk.before && after === hunk.after;
  };
  for (let start = 0; start <= lines.length - hunk.remove.length; start++) {
    if (hunk.remove.every((line, index) => line === lines[start + index]) && matchesContext(start)) {
      locations.push(start);
    }
  }
  if (hunk.remove.length) return locations.length === 1 ? locations[0] : null;
  // Empty lines between the same two anchors are equivalent insertion locations.
  // Distinct occurrences of the anchors are ambiguous.
  if (!locations.length ||
      locations.some((at, index) => index && at !== locations[index - 1] + 1)) return null;
  return locations[0];
}

function mergeSelected(original, chunks) {
  if (/\r(?!\n)/.test(original) || (original.includes("\r\n") && /(^|[^\r])\n/.test(original))) {
    throw new Error("This note has mixed line endings. Apply the changes manually.");
  }
  const lines = textLines(original);
  const sorted = chunks.slice().sort((left, right) => right.at - left.at);
  let boundary = lines.length + 1;
  for (const chunk of sorted) {
    if (chunk.at === null || chunk.at >= boundary || chunk.at + chunk.remove.length > boundary ||
        !chunk.remove.every((line, index) => lines[chunk.at + index] === line)) {
      throw new Error("The selected changes overlap or no longer match the note.");
    }
    lines.splice(chunk.at, chunk.remove.length, ...chunk.insert);
    boundary = chunk.at;
  }
  return lines.join(original.includes("\r\n") ? "\r\n" : "\n");
}

function mappedSource(profile, id, source) {
  const matches = Object.entries(profile.pages).filter(([key, entry]) =>
    key.startsWith("file:") && entry.id === id && key.slice(5).startsWith(source + "/"));
  if (matches.length !== 1) throw new Error("This page is not linked to one published note in the active source folder.");
  const [[key, entry]] = matches;
  return { path: key.slice(5), entry };
}

async function prepareLocalReview(app, client, profile, page) {
  const id = numericId(page.id);
  const { path, entry } = mappedSource(profile, id, client.config.source);
  if (entry.pending || entry.creating || !entry.bodyHash) {
    throw new Error("The link has an unfinished publish. Resolve it before reviewing edits.");
  }
  const file = app.vault.getFileByPath(path);
  if (!file || file.extension !== "md") throw new SyncError("The linked local Markdown file is unavailable: {path}", { path });
  const original = await app.vault.read(file);
  const latest = await checkedBody(client, page);
  const prior = page.version.number === entry.version ? latest : await checkedBody(client, page, entry.version);
  const url = client.pageUrl(id);
  const hunks = reviewHunks(fromStorage(prior, url), fromStorage(latest, url));
  return { id, path, original, baseVersion: entry.version, version: page.version.number,
    bodyHash: await digest(latest), origin: client.config.origin, folderId: client.config.folderId,
    hunks: hunks.map(hunk => ({ ...hunk, at: matchHunk(textLines(original), hunk) })) };
}

function editorMatches(app, path, original) {
  return app.workspace.getLeavesOfType("markdown").every(({ view }) =>
    view.file?.path !== path || !view.editor ||
      view.editor.getValue().replace(/\r\n/g, "\n") === original.replace(/\r\n/g, "\n"));
}

async function applyLocalReview(app, client, profile, page, review, selection) {
  if (client.config.origin !== review.origin || client.config.folderId !== review.folderId ||
      String(page.id) !== review.id || page.version.number !== review.version) {
    throw new Error("The Confluence page or destination changed. Review the latest version again.");
  }
  const { path, entry } = mappedSource(profile, review.id, client.config.source);
  if (path !== review.path || entry.version !== review.baseVersion || entry.pending ||
      await digest(await checkedBody(client, page)) !== review.bodyHash) {
    throw new Error("The Confluence page or its link changed. Review the latest version again.");
  }
  const indexes = Array.from(new Set(selection));
  if (!indexes.length || indexes.some(index => !Number.isInteger(index) || !review.hunks[index])) {
    throw new Error("Select at least one valid change.");
  }
  const changed = mergeSelected(review.original, indexes.map(index => review.hunks[index]));
  if (changed === review.original) throw new Error("The selected changes would not modify the note.");
  const file = app.vault.getFileByPath(path);
  if (!file || await app.vault.read(file) !== review.original || !editorMatches(app, path, review.original)) {
    throw new Error("The local note changed after review. Review it again.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-") + " " + crypto.randomUUID().slice(0, 8);
  const backup = client.config.inbox + "/Backups/" + stamp + "/" + path.slice(client.config.source.length + 1);
  await makeVaultFolders(app.vault, parentPath(backup), client.config.inbox);
  await app.vault.create(backup, review.original);

  // Recheck after creating the backup and let Vault.process guard against a newer local edit.
  const latest = await client.page(review.id);
  if (String(latest.id) !== review.id || String(latest.spaceId) !== client.spaceId ||
      latest.version.number !== review.version || String(latest.parentId) !== String(page.parentId) ||
      latest.title !== page.title || latest.status !== "current") {
    throw new Error("The Confluence page changed while preparing the backup. No local change was applied.");
  }
  await app.vault.process(file, current => {
    if (current !== review.original || file.path !== path || !editorMatches(app, path, current)) {
      throw new Error("The local note changed while applying the selection. No local change was applied.");
    }
    return changed;
  });
  return { count: indexes.length, backup };
}
