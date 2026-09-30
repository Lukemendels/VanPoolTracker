import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import { RIDERS, DEFAULT_DRIVERS } from '../src/vanpoolConfig.js';
import { getUSFederalHolidays, getReportSendDate, parseMonth } from '../src/utils/dateHelpers.js';
import { generateEstimatedWeeks, createSeededRandom, countCommuteDays, calculateEndingMileage } from '../src/reportLogic.js';
import { buildReportWorkbook } from '../src/reportWorkbook.js';
import { generateReport, normalizeInput } from '../scripts/generate-report.mjs';

const template = await fs.readFile(new URL('../public/ABS05 - I. Nguyen 7.1.26.xlsx', import.meta.url));
const original = new ExcelJS.Workbook();
await original.xlsx.load(template);
const sheetNames = ['Current Roster', 'Current Route Info.', 'Monthly'];
const dayColumns = [2, 4, 6, 8, 10, 12, 14];

function reportData(year, month) {
  const weeks = generateEstimatedWeeks(year, month, createSeededRandom(`test:${year}-${month}`));
  return { template, selectedMonth: new Date(year, month, 1), weeks,
    startingMileage: 100000, endingMileage: calculateEndingMileage(100000, weeks), estimated: true };
}

async function roundTrip(data) {
  const workbook = await buildReportWorkbook(data);
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  return reloaded;
}

for (const [year, month, expectedWeeks, expectedDays] of [[2026, 1, 4, 19], [2026, 9, 5, 21], [2026, 7, 6, 21]]) {
  test(`${expectedWeeks}-week form: all seven names, dates, codes, mileage, footer and other sheets survive XLSX round trip`, async () => {
    const data = reportData(year, month);
    assert.equal(data.weeks.length, expectedWeeks);
    assert.equal(countCommuteDays(data.weeks), expectedDays);
    const workbook = await roundTrip(data);
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), sheetNames);
    for (const name of sheetNames.slice(0, 2)) {
      assert.deepEqual(workbook.getWorksheet(name).model.rows, original.getWorksheet(name).model.rows);
    }
    const sheet = workbook.getWorksheet('Monthly');
    assert.match(sheet.getCell('A1').value, /estimated draft/);
    assert.equal(sheet.sheetProtection, undefined);
    assert.equal(sheet.getCell('A7').value, 100000);
    const endingRow = expectedWeeks === 6 ? 57 : 47;
    assert.equal(sheet.getCell(`A${endingRow}`).value, 100000 + expectedDays * 90);
    assert.equal(sheet.getCell(`A${endingRow - 1}`).value, 'Ending Mileage:');
    const footerRow = expectedWeeks === 6 ? 66 : 56;
    assert.equal(sheet.getCell(`A${footerRow}`).value, original.getWorksheet('Monthly').getCell('A56').value);
    assert.ok(sheet.model.merges.includes(`A${footerRow}:O${footerRow + 1}`));
    assert.equal(sheet.getColumn(1).width, original.getWorksheet('Monthly').getColumn(1).width);
    const observedDates = [];
    for (let w = 0; w < Math.max(5, expectedWeeks); w++) {
      const header = 6 + w * 10;
      for (let r = 0; r < RIDERS.length; r++) {
        assert.equal(sheet.getCell(header + 3 + r, 1).value, RIDERS[r]);
        assert.deepEqual(sheet.getCell(header + 9, 2).style, sheet.getCell(header + 8, 2).style);
      }
      for (let d = 0; d < 7; d++) {
        const day = data.weeks[w]?.[d];
        const cellDate = sheet.getCell(header + 1, dayColumns[d]).value;
        if (day?.inMonth) {
          assert.ok(cellDate instanceof Date);
          assert.equal(cellDate.toISOString(), `${day.dateStr}T00:00:00.000Z`);
          observedDates.push(day.dateStr);
        } else assert.equal(cellDate, null, 'unused dates must not retain July template values');
        for (let r = 0; r < RIDERS.length; r++) {
          for (const [period, offset] of [['am', 0], ['pm', 1]]) {
            assert.equal(sheet.getCell(header + 3 + r, dayColumns[d] + offset).value,
              day?.inMonth ? day.riders[RIDERS[r]][period] : null);
          }
        }
      }
    }
    assert.equal(observedDates.length, new Date(year, month + 1, 0).getDate());
    assert.equal(new Set(observedDates).size, observedDates.length);
    // Saved cells remain editable; re-save a colleague's changed attendance.
    sheet.getCell('J11').value = 'X';
    const edited = new ExcelJS.Workbook();
    await edited.xlsx.load(await workbook.xlsx.writeBuffer());
    assert.equal(edited.getWorksheet('Monthly').getCell('J11').value, 'X');
  });
}

test('October 2026: 21 commuting days and 1,890 estimated miles, holiday NR and configured drivers', () => {
  const weeks = generateEstimatedWeeks(2026, 9, createSeededRandom('october'));
  assert.equal(countCommuteDays(weeks), 21);
  assert.equal(calculateEndingMileage(100000, weeks), 101890);
  for (const day of weeks.flat().filter(day => day.inMonth)) {
    for (const rider of RIDERS) {
      assert.equal(day.riders[rider].am, day.riders[rider].pm);
      assert.ok((day.isNR ? ['NR'] : ['X', 'R', 'D']).includes(day.riders[rider].am));
    }
    if (day.isNR) assert.equal(day.driverAm, '');
    else {
      assert.ok(DEFAULT_DRIVERS.includes(day.driverAm));
      assert.equal(day.riders[day.driverAm].am, 'D');
      assert.equal(RIDERS.filter(rider => day.riders[rider].am === 'D').length, 1);
    }
  }
  const holiday = weeks.flat().find(day => day.dateStr === '2026-10-12');
  assert.equal(holiday.holiday, 'Columbus Day');
  assert.equal(holiday.isNR, true);
});

test('same seed is reproducible; an intentional new seed changes attendance', () => {
  const one = generateEstimatedWeeks(2026, 9, createSeededRandom('repeat'));
  assert.deepEqual(one, generateEstimatedWeeks(2026, 9, createSeededRandom('repeat')));
  assert.notDeepEqual(one, generateEstimatedWeeks(2026, 9, createSeededRandom('another')));
});

test('federal observed holidays and three-business-day send dates cover weekends and year boundaries', () => {
  assert.equal(getUSFederalHolidays(2026)['2026-07-03'], 'Independence Day');
  assert.equal(getUSFederalHolidays(2027)['2027-12-31'], "New Year's Day (Observed)");
  assert.equal(getUSFederalHolidays(2023)['2023-01-02'], "New Year's Day");
  assert.equal(getReportSendDate(2026, 9), '2026-10-28'); // month-end Saturday
  assert.equal(getReportSendDate(2026, 4), '2026-05-27'); // month-end Sunday
  assert.equal(getReportSendDate(2026, 7), '2026-08-26'); // month-end Monday
  assert.equal(getReportSendDate(2026, 10), '2026-11-24'); // Thanksgiving in lead window
  assert.equal(getReportSendDate(2027, 4), '2027-05-26'); // month-end holiday
  assert.equal(getReportSendDate(2027, 11), '2027-12-28'); // month-end observed holiday
  assert.throws(() => getReportSendDate(2026, 9, 0));
});

test('civil calendar keys and report schedule are independent of runtime timezone', () => {
  const code = `import {getMonthCalendarWeeks,getReportSendDate} from './src/utils/dateHelpers.js';
    console.log(JSON.stringify([getMonthCalendarWeeks(2026,9).flat().map(({dateStr,inMonth,holiday,isWeekend})=>({dateStr,inMonth,holiday,isWeekend})),getReportSendDate(2026,9)]));`;
  const outputs = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'].map(TZ =>
    execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('../', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8' }));
  assert.ok(outputs.every(output => output === outputs[0]));
});

test('month and mileage inputs distinguish missing, placeholder, unknown and zero', () => {
  for (const startingMileage of [undefined, null, '', '100000', 'TBD', -1, 1.5, Infinity]) {
    assert.throws(() => normalizeInput({ month: '2026-10', startingMileage }));
  }
  assert.equal(normalizeInput({ month: '2026-10', startingMileage: 0 }).startingMileage, 0);
  assert.throws(() => normalizeInput({ month: '2026-10', startingMileage: 100, endingMileage: 99 }));
  assert.throws(() => normalizeInput({ month: '2026-10', startingMileage: 100, recipient: 'unknown' }));
  assert.throws(() => normalizeInput({ month: '2026-10', startingMileage: 100, seed: '' }));
  for (const month of ['2026-13', '26-10', '2026-1', 'October', null]) assert.throws(() => parseMonth(month));
});

test('ending override is honored; missing rider codes are errors, never guessed X', async () => {
  const data = reportData(2026, 9);
  data.endingMileage = 102000;
  const workbook = await roundTrip(data);
  assert.equal(workbook.getWorksheet('Monthly').getCell('A47').value, 102000);
  const day = data.weeks.flat().find(day => day.inMonth && !day.isNR);
  delete day.riders[RIDERS[0]].am;
  await assert.rejects(buildReportWorkbook(data), /Missing or invalid/);
  day.riders[RIDERS[0]].am = 'TBD';
  await assert.rejects(buildReportWorkbook(data), /Missing or invalid/);
});

test('PV edits on NR days are preserved', async () => {
  const data = reportData(2026, 9);
  const day = data.weeks[0][6];
  day.riders[RIDERS[0]] = { am: 'PV', pm: 'PV' };
  const workbook = await roundTrip(data);
  assert.equal(workbook.getWorksheet('Monthly').getCell('N9').value, 'PV');
  assert.equal(workbook.getWorksheet('Monthly').getCell('O9').value, 'PV');
});

test('CLI persists one private run; retries reuse unchanged bytes and do not overwrite edits or new inputs', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vanpool-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'input.json');
  const outputDir = path.join(directory, 'run');
  const input = { month: '2026-10', startingMileage: 100000 };
  await fs.writeFile(inputPath, JSON.stringify(input));
  const first = await generateReport({ inputPath, outputDir });
  assert.equal(first.status, 'created');
  assert.equal(first.commuteDays, 21);
  assert.equal(first.sendDate, '2026-10-28');
  const file = path.join(outputDir, first.filename);
  const before = await fs.readFile(file);
  const second = await generateReport({ inputPath, outputDir });
  assert.equal(second.status, 'existing');
  assert.deepEqual(await fs.readFile(file), before);
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json')));
  assert.equal(manifest.status, 'generated-not-sent');
  assert.equal(manifest.input.startingMileage, 100000);
  assert.ok(manifest.input.seed);
  await fs.writeFile(inputPath, JSON.stringify({ ...input, startingMileage: 100001 }));
  await assert.rejects(generateReport({ inputPath, outputDir }), /different run/);
  await fs.writeFile(inputPath, JSON.stringify(input));
  await fs.appendFile(file, 'edited');
  await assert.rejects(generateReport({ inputPath, outputDir }), /will not be overwritten/);
  await fs.writeFile(`${outputDir}.lock`, 'running');
  await assert.rejects(generateReport({ inputPath, outputDir }), /locked/);
});

test('CLI rejects public paths and incomplete existing runs', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vanpool-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'input.json');
  await fs.writeFile(inputPath, JSON.stringify({ month: '2026-10', startingMileage: 0 }));
  await assert.rejects(generateReport({ inputPath, outputDir: new URL('../public/reports', import.meta.url).pathname }), /outside the repository/);
  await assert.rejects(generateReport({ inputPath, outputDir: directory }), /without a complete manifest/);
});

test('CLI rejects even ignored in-repo storage and symlinks into the checkout', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vanpool-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'input.json');
  await fs.writeFile(inputPath, JSON.stringify({ month: '2026-10', startingMileage: 0 }));
  const privateInRepo = new URL('../private', import.meta.url).pathname;
  await assert.rejects(generateReport({ inputPath, outputDir: privateInRepo }), /outside the repository/);
  const link = path.join(directory, 'public-link');
  await fs.symlink(new URL('../public', import.meta.url).pathname, link, 'dir');
  await assert.rejects(generateReport({ inputPath, outputDir: path.join(link, 'reports') }), /outside the repository/);
  await assert.rejects(generateReport({ inputPath: path.join(privateInRepo, 'input.json'), outputDir: path.join(directory, 'report') }), /outside the repository/);
});
