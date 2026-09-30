import ExcelJS from 'exceljs';
import { RIDERS } from './vanpoolConfig.js';
import { getMonthCalendarWeeks, formatDateKey } from './utils/dateHelpers.js';

const DAY_COLUMNS = [2, 4, 6, 8, 10, 12, 14];
const TEMPLATE_WEEKS = 5;
const RIDER_CAPACITY = 7; // Six template riders plus its existing spacer row.
const clone = value => JSON.parse(JSON.stringify(value));

export function validateMileage(value, name) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be an explicitly supplied non-negative whole number.`);
  }
}

function validateReport(selectedMonth, weeks, startingMileage, endingMileage, riders) {
  validateMileage(startingMileage, 'startingMileage');
  validateMileage(endingMileage, 'endingMileage');
  if (endingMileage < startingMileage) throw new Error('endingMileage cannot be less than startingMileage.');
  if (!(selectedMonth instanceof Date) || Number.isNaN(selectedMonth.getTime())) {
    throw new Error('A valid report month is required.');
  }
  if (riders.length < 1 || riders.length > RIDER_CAPACITY || new Set(riders).size !== riders.length) {
    throw new Error('The template supports one to seven unique riders.');
  }
  const expected = getMonthCalendarWeeks(selectedMonth.getFullYear(), selectedMonth.getMonth());
  if (!Array.isArray(weeks) || weeks.length !== expected.length) throw new Error('Report calendar does not match its month.');
  expected.forEach((week, w) => week.forEach((day, d) => {
    const actual = weeks[w]?.[d];
    if (weeks[w]?.length !== 7 || !actual || actual.inMonth !== day.inMonth ||
        formatDateKey(new Date(actual.date)) !== day.dateStr || actual.dateStr !== day.dateStr) {
      throw new Error(`Invalid calendar day at week ${w + 1}, day ${d + 1}.`);
    }
    if (!actual.inMonth) return;
    if (typeof actual.isNR !== 'boolean') throw new Error(`Unknown commute status on ${day.dateStr}.`);
    const allowed = actual.isNR ? ['NR', 'PV'] : ['R', 'D', 'X'];
    riders.forEach(rider => {
      for (const period of ['am', 'pm']) {
        if (!allowed.includes(actual.riders?.[rider]?.[period])) {
          throw new Error(`Missing or invalid ${period} status for ${rider} on ${day.dateStr}.`);
        }
      }
      if (actual.isNR && actual.riders[rider].am !== actual.riders[rider].pm) {
        throw new Error(`NR/PV status must match AM and PM for ${rider} on ${day.dateStr}.`);
      }
    });
  }));
}

/** Fill the original, editable three-sheet form. No browser or filesystem API. */
export async function buildReportWorkbook({ template, selectedMonth, weeks, startingMileage, endingMileage, riders = RIDERS, estimated = false }) {
  validateReport(selectedMonth, weeks, startingMileage, endingMileage, riders);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.getWorksheet('Monthly');
  if (!sheet) throw new Error('Sheet "Monthly" not found in template.');
  const monthName = selectedMonth.toLocaleString('en-US', { month: 'long' });
  sheet.getCell('A1').value = `${monthName} ${selectedMonth.getFullYear()}${estimated ? ' (estimated draft)' : ''}`;
  if (estimated) {
    workbook.subject = 'Estimated attendance and mileage draft for review and editing';
    workbook.description = 'Estimated from the VanPool Tracker calendar, driver rotation, and random absence logic. Review and edit before final submission.';
  }

  // Keep the original five blocks for four-week months, clearing unused data.
  // Add a sixth block only when needed, explicitly relocating the merged footer.
  const blockCount = Math.max(TEMPLATE_WEEKS, weeks.length);
  if (blockCount === 6) {
    const footerValue = sheet.getCell('A56').value;
    const footerStyle = clone(sheet.getCell('A56').style);
    const footerHeights = [sheet.getRow(56).height, sheet.getRow(57).height];
    sheet.unMergeCells('A56:O57');
    sheet.insertRows(56, Array.from({ length: 10 }, () => []));
    for (let offset = 0; offset < 10; offset++) {
      const source = sheet.getRow(36 + offset);
      const target = sheet.getRow(56 + offset);
      target.height = source.height;
      for (let col = 1; col <= 15; col++) {
        target.getCell(col).value = source.getCell(col).value;
        target.getCell(col).style = clone(source.getCell(col).style);
      }
    }
    for (const col of DAY_COLUMNS) {
      sheet.mergeCells(56, col, 56, col + 1);
      sheet.mergeCells(57, col, 57, col + 1);
    }
    sheet.mergeCells('A66:O67');
    sheet.getCell('A66').value = footerValue;
    sheet.getCell('A66').style = footerStyle;
    sheet.getRow(66).height = footerHeights[0];
    sheet.getRow(67).height = footerHeights[1];
  }

  sheet.getCell('A7').value = startingMileage;
  sheet.getCell('A46').value = blockCount === 5 ? 'Ending Mileage:' : null;
  sheet.getCell('A47').value = blockCount === 5 ? endingMileage : null;
  if (blockCount === 6) {
    // Use the same yellow mileage styling as the original ending-mileage field.
    sheet.getCell('A56').style = clone(sheet.getCell('A46').style);
    sheet.getCell('A57').style = clone(sheet.getCell('A47').style);
    sheet.getCell('A56').value = 'Ending Mileage:';
    sheet.getCell('A57').value = endingMileage;
  }

  for (let w = 0; w < blockCount; w++) {
    const headerRow = 6 + w * 10;
    // Labels and codes always use the same roster, including the seventh rider.
    for (let index = 0; index < RIDER_CAPACITY; index++) {
      const row = headerRow + 3 + index;
      if (index === 6) {
        sheet.getRow(row).height = sheet.getRow(row - 1).height;
        for (let col = 1; col <= 15; col++) {
          sheet.getCell(row, col).style = clone(sheet.getCell(row - 1, col).style);
        }
      }
      sheet.getCell(row, 1).value = riders[index] || null;
      for (const col of DAY_COLUMNS) {
        const day = weeks[w]?.[(col - 2) / 2];
        const status = day?.inMonth && riders[index] ? day.riders[riders[index]] : null;
        sheet.getCell(row, col).value = status?.am ?? null;
        sheet.getCell(row, col + 1).value = status?.pm ?? null;
      }
    }
    for (let d = 0; d < DAY_COLUMNS.length; d++) {
      const day = weeks[w]?.[d];
      // Excel stores a timezone-free civil date, encoded here at UTC midnight.
      sheet.getCell(headerRow + 1, DAY_COLUMNS[d]).value = day?.inMonth
        ? new Date(`${day.dateStr}T00:00:00.000Z`) : null;
    }
  }
  return workbook;
}

export function reportFilename(selectedMonth, estimated = false) {
  return `ABS05 - I. Nguyen ${selectedMonth.getMonth() + 1}.1.${String(selectedMonth.getFullYear()).slice(-2)}${estimated ? ' - estimated draft' : ''}.xlsx`;
}
