import fs from 'fs/promises';
import path from 'path';

export function lazy<T>(callback: () => T) {
  let loaded = false;
  let result: T;

  return () => {
    if (!loaded) {
      result = callback();
      loaded = true;
    }
    return result;
  };
}

export function logicalName(name: string) {
  return toPascalCase(name);
}

export async function existsAsync(input: string) {
  return fs
    .access(input)
    .then(() => true)
    .catch(() => false);
}

export async function findAbove(
  dir: string,
  target: string
): Promise<string | undefined> {
  if (dir === '/') return undefined;
  if (await existsAsync(path.join(dir, target))) return dir;
  return findAbove(path.resolve(path.join(dir, '..')), target);
}

function toPascalCase(string: string) {
  return `${string}`
    .toLowerCase()
    .replace(new RegExp(/[-_]+/, 'g'), ' ')
    .replace(new RegExp(/[^\w\s]/, 'g'), '')
    .replace(
      new RegExp(/\s+(.)(\w*)/, 'g'),
      ($1, $2, $3) => `${$2.toUpperCase() + $3}`
    )
    .replace(new RegExp(/\w/), s => s.toUpperCase());
}
