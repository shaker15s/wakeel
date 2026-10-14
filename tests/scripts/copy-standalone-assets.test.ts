import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyStandaloneAssets } from '../../scripts/copy-standalone-assets';

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('copyStandaloneAssets', () => {
  it('copies Next static assets and public files into the standalone tree', async () => {
    root = await mkdtemp(join(tmpdir(), 'wakeel-standalone-'));
    await mkdir(join(root, '.next', 'static'), { recursive: true });
    await mkdir(join(root, 'public'), { recursive: true });
    await writeFile(join(root, '.next', 'static', 'asset.js'), 'static');
    await writeFile(join(root, 'public', 'logo.svg'), 'public');

    await copyStandaloneAssets(root);

    await expect(readFile(join(root, '.next', 'standalone', '.next', 'static', 'asset.js'), 'utf8')).resolves.toBe('static');
    await expect(readFile(join(root, '.next', 'standalone', 'public', 'logo.svg'), 'utf8')).resolves.toBe('public');
  });

  it('is safe to rerun without nesting copied directories', async () => {
    root = await mkdtemp(join(tmpdir(), 'wakeel-standalone-'));
    await mkdir(join(root, '.next', 'static'), { recursive: true });
    await mkdir(join(root, 'public'), { recursive: true });
    await writeFile(join(root, '.next', 'static', 'asset.js'), 'static');
    await writeFile(join(root, 'public', 'logo.svg'), 'public');

    await copyStandaloneAssets(root);
    await copyStandaloneAssets(root);

    await expect(readFile(join(root, '.next', 'standalone', '.next', 'static', 'asset.js'), 'utf8')).resolves.toBe('static');
    await expect(readFile(join(root, '.next', 'standalone', 'public', 'logo.svg'), 'utf8')).resolves.toBe('public');
  });
});
