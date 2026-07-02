/**
 * Date and Holiday helper functions for the VanPool Tracker
 */

// Helper to check if a date is a weekend
export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

// Compute the Nth weekday of a month (e.g., 3rd Monday)
function getNthWeekday(year, month, weekday, n) {
  // weekday: 0 = Sunday, 1 = Monday, etc.
  // n: 1 = first, 2 = second, etc.
  const date = new Date(year, month, 1);
  let count = 0;
  while (date.getMonth() === month) {
    if (date.getDay() === weekday) {
      count++;
      if (count === n) {
        return new Date(date);
      }
    }
    date.setDate(date.getDate() + 1);
  }
  return null;
}

// Compute the last weekday of a month (e.g., last Monday of May)
function getLastWeekday(year, month, weekday) {
  const date = new Date(year, month + 1, 0); // Last day of month
  while (date.getMonth() === month) {
    if (date.getDay() === weekday) {
      return new Date(date);
    }
    date.setDate(date.getDate() - 1);
  }
  return null;
}

// Get observed holiday date
function getObservedHoliday(holidayDate) {
  const day = holidayDate.getDay();
  const observed = new Date(holidayDate);
  if (day === 6) { // Saturday -> Observed on Friday
    observed.setDate(holidayDate.getDate() - 1);
  } else if (day === 0) { // Sunday -> Observed on Monday
    observed.setDate(holidayDate.getDate() + 1);
  }
  return observed;
}

// Generate list of US Federal Holidays for a given year as 'YYYY-MM-DD' keys
export function getUSFederalHolidays(year) {
  const holidays = {};

  const addHoliday = (date, name) => {
    if (!date) return;
    const key = date.toISOString().split('T')[0];
    holidays[key] = name;
  };

  // 1. New Year's Day (Jan 1)
  const ny = new Date(year, 0, 1);
  addHoliday(getObservedHoliday(ny), "New Year's Day");
  // If Jan 1 of next year is observed on Dec 31 of this year
  const nextNy = new Date(year + 1, 0, 1);
  if (nextNy.getDay() === 6) {
    addHoliday(new Date(year, 11, 31), "New Year's Day (Observed)");
  }

  // 2. MLK Day (3rd Monday in Jan)
  addHoliday(getNthWeekday(year, 0, 1, 3), "Martin Luther King Jr. Day");

  // 3. Washington's Birthday / Presidents' Day (3rd Monday in Feb)
  addHoliday(getNthWeekday(year, 1, 1, 3), "Presidents' Day");

  // 4. Memorial Day (Last Monday in May)
  addHoliday(getLastWeekday(year, 4, 1), "Memorial Day");

  // 5. Juneteenth (June 19)
  const jt = new Date(year, 5, 19);
  addHoliday(getObservedHoliday(jt), "Juneteenth");

  // 6. Independence Day (July 4)
  const id = new Date(year, 6, 4);
  addHoliday(getObservedHoliday(id), "Independence Day");

  // 7. Labor Day (1st Monday in Sep)
  addHoliday(getNthWeekday(year, 8, 1, 1), "Labor Day");

  // 8. Columbus Day (2nd Monday in Oct)
  addHoliday(getNthWeekday(year, 9, 1, 2), "Columbus Day");

  // 9. Veterans Day (Nov 11)
  const vd = new Date(year, 10, 11);
  addHoliday(getObservedHoliday(vd), "Veterans Day");

  // 10. Thanksgiving (4th Thursday in Nov)
  addHoliday(getNthWeekday(year, 10, 4, 4), "Thanksgiving");

  // 11. Christmas (Dec 25)
  const xm = new Date(year, 11, 25);
  addHoliday(getObservedHoliday(xm), "Christmas Day");

  return holidays;
}

// Generate calendar weeks for a given month and year
// Returns array of weeks, where each week is array of 7 days (Sun-Sat)
export function getMonthCalendarWeeks(year, month) {
  const weeks = [];
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Get the start of the first week (the Sunday on or before the 1st of the month)
  const startOfCalendar = new Date(firstDayOfMonth);
  startOfCalendar.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay());

  // Get the end of the last week (the Saturday on or after the last day of the month)
  const endOfCalendar = new Date(lastDayOfMonth);
  endOfCalendar.setDate(lastDayOfMonth.getDate() + (6 - lastDayOfMonth.getDay()));

  const currentDate = new Date(startOfCalendar);
  const holidays = getUSFederalHolidays(year);

  let currentWeek = [];

  while (currentDate <= endOfCalendar) {
    const isCurrentMonth = currentDate.getMonth() === month;
    const dateKey = currentDate.toISOString().split('T')[0];
    const holidayName = holidays[dateKey] || null;

    currentWeek.push({
      date: new Date(currentDate),
      dateStr: dateKey,
      inMonth: isCurrentMonth,
      isWeekend: isWeekend(currentDate),
      holiday: holidayName,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return weeks;
}

// Formatter to match Excel date storage
export function formatToExcelDate(date) {
  // Return Date object or string
  return date;
}
