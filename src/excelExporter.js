import ExcelJS from 'exceljs';

/**
 * Exports the ridership data to the ABS Vans Excel template
 * @param {Date} selectedMonth - Date object representing the selected month (e.g. July 2026)
 * @param {Array} weeks - Calendar weeks with ridership and mileage data
 * @param {number} startingMileage - Beginning mileage value
 * @param {number} endingMileage - Ending mileage value
 * @param {Array} riders - List of rider names in the exact order as the template
 */
export async function exportToExcel(selectedMonth, weeks, startingMileage, endingMileage, riders) {
  // 1. Fetch the original template as an array buffer
  const response = await fetch('/ABS05 - I. Nguyen 7.1.26.xlsx');
  if (!response.ok) {
    throw new Error('Failed to load the spreadsheet template.');
  }
  const arrayBuffer = await response.arrayBuffer();

  // 2. Load the workbook with ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const sheet = workbook.getWorksheet('Monthly');
  if (!sheet) {
    throw new Error('Sheet "Monthly" not found in template.');
  }

  const year = selectedMonth.getFullYear();
  const monthIdx = selectedMonth.getMonth();
  const monthName = selectedMonth.toLocaleString('default', { month: 'long' });

  // 3. Set the Month Year title in cell A1
  sheet.getCell('A1').value = `${monthName} ${year}`;

  const numWeeks = weeks.length;
  const is6WeekMonth = numWeeks === 6;

  // 4. Handle 6-week months dynamically
  if (is6WeekMonth) {
    // 5th week block starts at row 46, ending at 54. Footer starts at 56.
    // Insert 10 rows starting at row 56 for Week 6 (56 to 65).
    // First, unmerge the footer at rows 56-57 so it doesn't collide with the new rows
    sheet.unMergeCells('A56:O57');
    
    // We insert 10 rows at 56
    sheet.insertRows(56, Array(10).fill([]));

    // Copy Week 4 (rows 36 to 45) to Week 6 (rows 56 to 65)
    const srcStart = 36;
    const srcEnd = 45;
    const destStart = 56;
    const offset = destStart - srcStart;

    for (let r = srcStart; r <= srcEnd; r++) {
      const srcRow = sheet.getRow(r);
      const destRow = sheet.getRow(r + offset);

      if (srcRow.height) {
        destRow.height = srcRow.height;
      }

      for (let c = 1; c <= 15; c++) {
        const srcCell = srcRow.getCell(c);
        const destCell = destRow.getCell(c);

        destCell.value = srcCell.value;
        // Deep copy style
        destCell.style = JSON.parse(JSON.stringify(srcCell.style || {}));
      }
    }

    // Re-merge headers and dates in Week 6 (rows 56 and 57)
    const cols = [
      { start: 2, end: 3 },  // Sun
      { start: 4, end: 5 },  // Mon
      { start: 6, end: 7 },  // Tue
      { start: 8, end: 9 },  // Wed
      { start: 10, end: 11 },// Thur
      { start: 12, end: 13 },// Fri
      { start: 14, end: 15 } // Sat
    ];

    cols.forEach(col => {
      sheet.mergeCells(56, col.start, 56, col.end);
      sheet.mergeCells(57, col.start, 57, col.end);
    });

    // Clear Week 5 labels of Ending Mileage to make it a standard week
    sheet.getCell('A46').value = null;
    sheet.getCell('A47').value = null;

    // Set Week 6 as the Ending Mileage week
    sheet.getCell('A56').value = 'Ending Mileage:';
    sheet.getCell('A57').value = Number(endingMileage);

    // Re-merge the shifted footer (it was rows 56-57, now pushed by 10 rows to 66-67)
    sheet.mergeCells('A66:O67');
  } else {
    // 5-week month
    // Just write the mileage to standard cell coordinates
    sheet.getCell('A46').value = 'Ending Mileage:';
    sheet.getCell('A47').value = Number(endingMileage);
  }

  // 5. Write the Beginning Mileage to A7
  sheet.getCell('A7').value = Number(startingMileage);

  // 6. Write dates and ridership codes for each week
  // Sunday starts at column B (2) to Saturday at column N (14)
  const dayColMap = [2, 4, 6, 8, 10, 12, 14]; // Sun, Mon, Tue, Wed, Thu, Fri, Sat

  for (let w = 0; w < numWeeks; w++) {
    const weekData = weeks[w];
    const headerRow = 6 + w * 10;
    const dateRow = headerRow + 1;

    for (let d = 0; d < 7; d++) {
      const dayData = weekData[d];
      const dayCol = dayColMap[d];

      if (dayData && dayData.inMonth) {
        // Write date object
        const dVal = new Date(dayData.date);
        // Clear time to prevent timezones messing it up
        dVal.setHours(0, 0, 0, 0);
        sheet.getCell(dateRow, dayCol).value = dVal;

        // Write ridership codes for each rider
        riders.forEach((riderName, index) => {
          const riderRow = headerRow + 3 + index;
          const amCell = sheet.getCell(riderRow, dayCol);
          const pmCell = sheet.getCell(riderRow, dayCol + 1);

          if (dayData.isNR) {
            // Check if rider drove personal vehicle on NR days
            const isPV = dayData.riders[riderName]?.am === 'PV';
            amCell.value = isPV ? 'PV' : 'NR';
            pmCell.value = isPV ? 'PV' : 'NR';
          } else {
            // Commute day
            amCell.value = dayData.riders[riderName]?.am || 'X';
            pmCell.value = dayData.riders[riderName]?.pm || 'X';
          }
        });
      } else {
        // Outside month: clear date and ridership cells
        sheet.getCell(dateRow, dayCol).value = null;
        riders.forEach((riderName, index) => {
          const riderRow = headerRow + 3 + index;
          sheet.getCell(riderRow, dayCol).value = null;
          sheet.getCell(riderRow, dayCol + 1).value = null;
        });
      }
    }
  }

  // 7. Write the workbook to a buffer and trigger file download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  // File naming: ABS05 - I. Nguyen [MonthNumber].[1].[YearLastTwoDigits].xlsx
  const monthNum = monthIdx + 1;
  const shortYear = year.toString().slice(-2);
  a.download = `ABS05 - I. Nguyen ${monthNum}.1.${shortYear}.xlsx`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
