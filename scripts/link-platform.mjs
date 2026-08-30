/**
 * Resolves the MMAP platform checkout that supplies `@mmap/schema`.
 *
 * `@mmap/schema` is `private: true` and unpublished, so it cannot be installed
 * from a registry. Instead both local development and CI arrange for the
 * platform to appear at the same relative path — `.mmap-platform` — and the
 * workspace depends on `link:.mmap-platform/packages/schema`.
 *
 *   local  →  a symlink (directory junction on Windows) to a sibling checkout
 *   CI     →  actions/checkout with `path: .mmap-platform` at the pinned commit
 *
 * Run this BEFORE `pnpm install`; pnpm needs the link target to exist to
 * resolve the dependency.
 */
import { existsSync, lstatSync, readlinkSync, symlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const linkPath = join(repoRoot, '.mmap-platform');

/** Directories to try, in order, when MMAP_PLATFORM_PATH is not set. */
const SIBLING_CANDIDATES = ['marine-mammal-assessment', 'marine-mammal-assessment-platform'];

function looksLikePlatformCheckout(candidate) {
  return existsSync(join(candidate, 'packages', 'schema', 'registry.json'));
}

function findPlatform() {
  const fromEnv = process.env.MMAP_PLATFORM_PATH;
  if (fromEnv) {
    const resolved = isAbsolute(fromEnv) ? fromEnv : resolve(repoRoot, fromEnv);
    if (!looksLikePlatformCheckout(resolved)) {
      throw new Error(
        `MMAP_PLATFORM_PATH is set to ${resolved}, but that is not an MMAP platform checkout ` +
          `(expected packages/schema/registry.json beneath it).`,
      );
    }
    return resolved;
  }

  const parent = resolve(repoRoot, '..');
  for (const name of SIBLING_CANDIDATES) {
    const candidate = join(parent, name);
    if (looksLikePlatformCheckout(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Could not find an MMAP platform checkout.\n' +
      `Looked for ${SIBLING_CANDIDATES.map((n) => join(parent, n)).join(' and ')}.\n` +
      'Clone it beside this repo, or set MMAP_PLATFORM_PATH to its location:\n' +
      '  git clone https://github.com/SaveMarineMammals/marine-mammal-assessment-platform.git',
  );
}

function main() {
  if (existsSync(linkPath)) {
    // CI checks the platform out directly at this path; a real directory is fine.
    const stat = lstatSync(linkPath);
    const target = stat.isSymbolicLink() ? readlinkSync(linkPath) : linkPath;

    if (!looksLikePlatformCheckout(linkPath)) {
      throw new Error(
        `.mmap-platform exists but does not contain packages/schema/registry.json.\n` +
          `It points at ${target}. Remove it and re-run.`,
      );
    }
    console.log(`.mmap-platform already resolves to a platform checkout (${target})`);
    return;
  }

  const platform = findPlatform();
  // 'junction' works on Windows without elevated privileges; 'dir' elsewhere.
  symlinkSync(platform, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  console.log(`Linked .mmap-platform → ${platform}`);
}

try {
  main();
} catch (error) {
  console.error(`\nlink-platform failed:\n${error.message}\n`);
  process.exit(1);
}
