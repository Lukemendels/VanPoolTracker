import { getMonthCalendarWeeks } from './utils/dateHelpers.js';
import { RIDERS, DEFAULT_DRIVERS, MILES_PER_COMMUTE_DAY } from './vanpoolConfig.js';

export function initializeMonth(year, month) {
  return getMonthCalendarWeeks(year, month).map(week => week.map(day => {
    const isDayNR = day.isWeekend || day.holiday !== null;
    const riders = Object.fromEntries(RIDERS.map(rider => [rider, {
      am: isDayNR ? 'NR' : 'R', pm: isDayNR ? 'NR' : 'R'
    }]));
    return {
      ...day, isNR: isDayNR, isHoliday: day.holiday !== null,
      driverAm: isDayNR ? '' : 'Luke Mendelsohn',
      driverPm: isDayNR ? '' : 'Luke Mendelsohn', riders
    };
  }));
}

export function generateEstimatedWeeks(year, month, random = Math.random) {
  return runSeedingAlgorithm(initializeMonth(year, month), random);
}

export function countCommuteDays(weeks) {
  return weeks.flat().filter(day => day.inMonth && !day.isNR).length;
}

export function calculateEndingMileage(startingMileage, weeks) {
  return startingMileage + countCommuteDays(weeks) * MILES_PER_COMMUTE_DAY;
}

// FNV-1a seed hash + Mulberry32. Passing the same seed restarts the same stream.
// The original app's random-comparator sort and backup-driver order are retained.
export function createSeededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function runSeedingAlgorithm(weeksData, random = Math.random) {
    const updatedWeeks = weeksData.map(week =>
      week.map(day => ({
        ...day,
        date: new Date(day.date),
        riders: JSON.parse(JSON.stringify(day.riders))
      }))
    );
    
    // 1. Find all active commute weekdays
    const activeDays = [];
    updatedWeeks.forEach((week, wIdx) => {
      week.forEach((day, dIdx) => {
        if (day.inMonth && !day.isWeekend && !day.isHoliday) {
          activeDays.push({ wIdx, dIdx });
        }
      });
    });

    // 2. Set default driver rotations and base ridership
    activeDays.forEach((day, idx) => {
      const dayObj = updatedWeeks[day.wIdx][day.dIdx];
      // Rotate among the configured drivers
      const primaryDriver = DEFAULT_DRIVERS[idx % DEFAULT_DRIVERS.length];
      
      dayObj.driverAm = primaryDriver;
      dayObj.driverPm = primaryDriver;

      RIDERS.forEach(rider => {
        dayObj.riders[rider] = {
          am: rider === primaryDriver ? 'D' : 'R',
          pm: rider === primaryDriver ? 'D' : 'R'
        };
      });
    });

    // 3. Seeding random absences: everyone out 1-2 days a month
    RIDERS.forEach(rider => {
      // Absences: 1 or 2 days
      const absenceCount = Math.floor(random() * 2) + 1;
      
      // Shuffle active days list and take first N days
      const shuffledActiveDays = [...activeDays].sort(() => 0.5 - random());
      const absenceDays = shuffledActiveDays.slice(0, absenceCount);

      absenceDays.forEach(day => {
        const dayObj = updatedWeeks[day.wIdx][day.dIdx];
        
        dayObj.riders[rider].am = 'X';
        dayObj.riders[rider].pm = 'X';

        // Backup plan: If this rider was the driver, assign the other driver!
        if (rider === dayObj.driverAm) {
          const backupDriver = DEFAULT_DRIVERS.find(d => d !== rider) || "Luke Mendelsohn";
          dayObj.driverAm = backupDriver;
          dayObj.riders[backupDriver].am = 'D';
        }
        if (rider === dayObj.driverPm) {
          const backupDriver = DEFAULT_DRIVERS.find(d => d !== rider) || "Luke Mendelsohn";
          dayObj.driverPm = backupDriver;
          dayObj.riders[backupDriver].pm = 'D';
        }
      });
    });

    return updatedWeeks;
  }
