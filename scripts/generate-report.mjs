#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parseMonth, getReportSendDate } from '../src/utils/dateHelpers.js';
import { RIDERS, MILES_PER_COMMUTE_DAY } from '../src/vanpoolConfig.js';
import { generateEstimatedWeeks, createSeededRandom, countCommuteDays, calculateEndingMileage } from '../src/reportLogic.js';
import { buildReportWorkbook, reportFilename, validateMileage } from '../src/reportWorkbook.js';

export const GENERATOR_VERSION = 'estimated-draft-v1';
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const TEMPLATE_PATH = new URL('../public/ABS05 - I. Nguyen 7.1.26.xlsx', import.meta.url);
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be a JSON object.');
  const unknown = Object.keys(input).filter(key => !['month', 'startingMileage', 'endingMileage', 'seed'].includes(key));
  if (unknown.length) throw new Error(`Unknown input field(s): ${unknown.join(', ')}.`);
  parseMonth(input.month);
  validateMileage(input.startingMileage, 'startingMileage');
  if ('endingMileage' in input) {
    validateMileage(input.endingMileage, 'endingMileage');
    if (input.endingMileage < input.startingMileage) throw new Error('endingMileage cannot be less than startingMileage.');
  }
  if ('seed' in input && (typeof input.seed !== 'string' || !input.seed.trim())) throw new Error('seed must be a non-empty string.');
  return {
    month: input.month,
    startingMileage: input.startingMileage,
    ...('endingMileage' in input ? { endingMileage: input.endingMileage } : {}),
    seed: input.seed ?? `vanpool:${input.month}:${GENERATOR_VERSION}`
  };
}

// Resolve existing ancestors too, so a symlink cannot accidentally route a
// private run into the web app's publicly served files.
async function canonicalPath(target) {
  try { return await fs.realpath(target); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(await canonicalPath(path.dirname(target)), path.basename(target));
  }
}

async function assertPrivatePath(target) {
  const actual = await canonicalPath(path.resolve(target));
  const root = await fs.realpath(REPO_ROOT);
  const relative = path.relative(root, actual);
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) {
    throw new Error('Keep monthly inputs and outputs outside the repository; the web development server can serve files from its root.');
  }
}

export async function generateReport({ inputPath, outputDir }) {
  if (!inputPath || !outputDir) throw new Error('Both --input and --output are required.');
  await assertPrivatePath(inputPath);
  await assertPrivatePath(outputDir);
  const input = normalizeInput(JSON.parse(await fs.readFile(inputPath, 'utf8')));
  const { year, month } = parseMonth(input.month);
  const selectedMonth = new Date(year, month, 1);
  const filename = reportFilename(selectedMonth, true);
  const destination = path.resolve(outputDir);
  const inputHash = sha256(JSON.stringify(input));
  const template = await fs.readFile(TEMPLATE_PATH);
  const templateHash = sha256(template);
  const manifestPath = path.join(destination, 'manifest.json');
  const workbookPath = path.join(destination, filename);

  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  // A single writer per destination; never break a possibly active lock.
  const lockPath = `${destination}.lock`;
  let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('This output is locked by another run. Inspect the run before removing a stale lock.');
    throw error;
  }
  let staging;
  try {
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (manifest) {
      if (manifest.inputHash !== inputHash || manifest.templateHash !== templateHash || manifest.generatorVersion !== GENERATOR_VERSION) {
        throw new Error('This destination already contains a different run. Use a new private output directory for an intentional revision.');
      }
      if (manifest.filename !== filename || sha256(await fs.readFile(workbookPath)) !== manifest.workbookSha256) {
        throw new Error('The existing workbook was edited or does not match its manifest. It will not be overwritten.');
      }
      return { status: 'existing', outputDir: destination, filename, ...manifest.summary };
    }
    try {
      await fs.lstat(destination);
      throw new Error('Output directory already exists without a complete manifest. Choose a new private directory; no files were overwritten.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }

    const weeks = generateEstimatedWeeks(year, month, createSeededRandom(input.seed));
    const estimatedEndingMileage = calculateEndingMileage(input.startingMileage, weeks);
    const endingMileage = input.endingMileage ?? estimatedEndingMileage;
    const workbook = await buildReportWorkbook({ template, selectedMonth, weeks,
      startingMileage: input.startingMileage, endingMileage, estimated: true });
    const buffer = await workbook.xlsx.writeBuffer();
    const summary = {
      month: input.month,
      commuteDays: countCommuteDays(weeks),
      estimatedMiles: countCommuteDays(weeks) * MILES_PER_COMMUTE_DAY,
      estimatedEndingMileage,
      endingMileage,
      endingMileageOverridden: 'endingMileage' in input,
      sendDate: getReportSendDate(year, month),
      estimated: true
    };
    manifest = {
      generatorVersion: GENERATOR_VERSION,
      nodeVersion: process.version,
      inputHash, templateHash, filename, workbookSha256: sha256(buffer),
      input, summary, riders: RIDERS, weeks,
      status: 'generated-not-sent'
    };
    staging = await fs.mkdtemp(`${destination}.tmp-`);
    await fs.writeFile(path.join(staging, filename), buffer, { mode: 0o600 });
    await fs.writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    // Both files become visible together. Retrying a completed run reuses bytes.
    await fs.rename(staging, destination);
    staging = undefined;
    return { status: 'created', outputDir: destination, filename, ...summary };
  } finally {
    if (staging) await fs.rm(staging, { recursive: true, force: true });
    await lock.close();
    await fs.unlink(lockPath);
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' }, output: { type: 'string' },
    'send-date': { type: 'string' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help) {
    console.log('Generate an editable estimated draft (does not send email):\n  npm run report -- --input /private/2026-10.json --output /private/reports/2026-10\n\nCalculate the three-business-day lead date:\n  npm run report -- --send-date 2026-10');
    return;
  }
  if (values['send-date']) {
    if (values.input || values.output) throw new Error('--send-date cannot be combined with generation options.');
    const { year, month } = parseMonth(values['send-date']);
    console.log(getReportSendDate(year, month));
    return;
  }
  console.log(JSON.stringify(await generateReport({ inputPath: values.input, outputDir: values.output }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Report not generated: ${error.message}`); process.exitCode = 1; });
}
