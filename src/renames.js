function rekeySource(profile, oldPath, newPath) {
  const moves = Object.entries(profile.pages).filter(([key]) => key.startsWith("file:") &&
    pathIn(key.slice(5), oldPath)).map(([key, entry]) => ({
      key, entry, next: "file:" + newPath + key.slice(5 + oldPath.length),
    }));
  const moving = new Set(moves.map(item => item.key));
  for (const item of moves) {
    if (profile.pages[item.next] && !moving.has(item.next)) {
      throw new Error("A moved note already has another page mapping. Resolve its link first.");
    }
  }
  for (const item of moves) delete profile.pages[item.key];
  for (const item of moves) {
    item.entry.renamedFrom ??= item.key.slice(5);
    profile.pages[item.next] = item.entry;
  }
  // Folder titles cannot be changed through the v2 Folder API. Rebuild only the
  // selected destination branches, reparent pages, and preserve old folders.
  for (const key of Object.keys(profile.folders)) {
    if (key.startsWith("dir:") && pathIn(key.slice(4), oldPath)) delete profile.folders[key];
  }
  return moves.length;
}
