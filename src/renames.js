function rekeySource(profile, oldPath, newPath) {
  const conflict = profile.renameConflicts?.filter(item => pathIn(oldPath, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const exactConflict = conflict && conflict.to === oldPath;
  if (exactConflict && newPath === conflict.from) {
    profile.renameConflicts = profile.renameConflicts.filter(item => item !== conflict);
    return 0;
  }
  if (conflict) {
    oldPath = conflict.from + oldPath.slice(conflict.to.length);
    if (pathIn(newPath, conflict.to)) newPath = conflict.from + newPath.slice(conflict.to.length);
  }
  const moves = Object.entries(profile.pages).filter(([key]) => key.startsWith("file:") &&
    pathIn(key.slice(5), oldPath)).map(([key, entry]) => ({
      key, entry, next: "file:" + newPath + key.slice(5 + oldPath.length),
    }));
  const moving = new Set(moves.map(item => item.key));
  for (const item of moves) {
    if (profile.pages[item.next] && !moving.has(item.next)) {
      const error = new Error("A moved note already has another page mapping. Resolve its link first.");
      error.code = "RENAME_COLLISION";
      error.from = oldPath;
      throw error;
    }
  }
  for (const item of moves) delete profile.pages[item.key];
  for (const item of moves) {
    item.entry.renamedFrom ??= item.key.slice(5);
    profile.pages[item.next] = item.entry;
  }
  if (exactConflict) profile.renameConflicts = profile.renameConflicts.filter(item => item !== conflict);
  for (const item of profile.renameConflicts ?? []) {
    if (pathIn(item.from, oldPath)) item.from = newPath + item.from.slice(oldPath.length);
    if (pathIn(item.to, oldPath)) item.to = newPath + item.to.slice(oldPath.length);
  }
  // Folder titles cannot be changed through the v2 Folder API. Rebuild only the
  // selected destination branches, reparent pages, and preserve old folders.
  for (const key of Object.keys(profile.folders)) {
    if (key.startsWith("dir:") && pathIn(key.slice(4), oldPath)) {
      profile.retiredFolders ??= {};
      profile.retiredFolders[key] = profile.folders[key];
      delete profile.folders[key];
    }
  }
  return moves.length;
}

function guardMappedPath(profile, path) {
  if (profile.renameConflicts?.some(item => pathIn(path, item.from) || pathIn(path, item.to))) {
    throw new Error("A local rename has a conflicting page mapping. Undo the move or choose a new path.");
  }
}
