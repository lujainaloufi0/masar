// Records the completion animation for the README.
// Needs the app running with fresh demo data, and ffmpeg on the PATH.
//   pnpm db:seed && node apps/web/scripts/record-gif.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
const out = resolve(process.argv[2] || 'docs/completion.gif');
const dir = mkdtempSync(join(tmpdir(), 'masar-rec-'));
const size = { width: 1280, height: 800 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// Sign in first without recording, so the video starts on the dashboard.
const setup = await browser.newContext({ viewport: size });
const sp = await setup.newPage();
await sp.goto(`${base}/login`);
await sp.getByRole('button', { name: /Omar Al-Shehri/ }).click();
await sp.waitForURL('**/overview');
const state = await setup.storageState();
await setup.close();

const ctx = await browser.newContext({ viewport: size, storageState: state, recordVideo: { dir, size } });
const page = await ctx.newPage();
await page.goto(`${base}/overview`);
await page.waitForTimeout(3200);
await page.getByRole('button', { name: /Quarterly backup restore drill/ }).first().click();
await page.waitForTimeout(2600);
await page.getByRole('dialog').getByRole('checkbox', { checked: false }).click();
await page.waitForTimeout(5200);
await page.getByRole('button', { name: 'Close' }).first().click();
await page.waitForTimeout(2200);
await ctx.close();
await browser.close();

const video = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
mkdirSync(resolve(out, '..'), { recursive: true });
const filters = 'fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.2', '-i', video, '-vf', filters, '-loop', '0', out]);
console.log(`Saved ${out}`);
