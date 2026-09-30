import { buildReportWorkbook, reportFilename } from './reportWorkbook.js';

/** Browser download wrapper around the same workbook builder as the Node CLI. */
export async function exportToExcel(selectedMonth, weeks, startingMileage, endingMileage, riders) {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const response = await fetch(`${baseUrl}ABS05 - I. Nguyen 7.1.26.xlsx`);
  if (!response.ok) throw new Error('Failed to load the spreadsheet template.');
  const workbook = await buildReportWorkbook({
    template: await response.arrayBuffer(), selectedMonth, weeks,
    startingMileage, endingMileage, riders
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = reportFilename(selectedMonth);
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }
}
