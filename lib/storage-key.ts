import path from "node:path";

export function isValidStorageKey(storageKey: string) {
  return (
    storageKey.length > 0 &&
    storageKey.length <= 255 &&
    path.basename(storageKey) === storageKey &&
    /^[a-zA-Z0-9._-]+$/.test(storageKey)
  );
}
