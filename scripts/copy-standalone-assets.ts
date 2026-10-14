import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function copyStandaloneAssets(root = process.cwd()): Promise<void> {
  const staticSource = path.join(root, '.next', 'static');
  const staticDestination = path.join(root, '.next', 'standalone', '.next', 'static');
  const publicSource = path.join(root, 'public');
  const publicDestination = path.join(root, '.next', 'standalone', 'public');

  await mkdir(path.dirname(staticDestination), { recursive: true });
  await mkdir(publicDestination, { recursive: true });
  await cp(staticSource, staticDestination, { recursive: true, force: true });
  await cp(publicSource, publicDestination, { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void copyStandaloneAssets().catch((error: unknown) => {
    console.error('Failed to copy standalone assets:', error);
    process.exitCode = 1;
  });
}
