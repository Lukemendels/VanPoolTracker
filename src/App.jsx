import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  MapPin, 
  TrendingUp, 
  User, 
  ShieldAlert, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { getMonthCalendarWeeks, isWeekend } from './utils/dateHelpers';
import { exportToExcel } from './excelExporter';

const RIDERS = [
  "Isabel Nguyen",
  "Heiddy Rocha",
  "Luke Mendelsohn",
  "Andrea Dixon",
  "Thomas Keene",
  "Christopher Beavers"
];

const DEFAULT_DRIVERS = ["Luke Mendelsohn", "Christopher Beavers"];

export default function App() {
  const [selectedMonth, setSelectedMonth] = useState(new Date(2026, 6, 1)); // Default: July 2026
  const [startingMileage, setStartingMileage] = useState(109867);
  const [endingMileage, setEndingMileage] = useState('');
  const [isMileageOverridden, setIsMileageOverridden] = useState(false);
  const [weeks, setWeeks] = useState([]);
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Load calendar structure on month change
  useEffect(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const calendarWeeks = getMonthCalendarWeeks(year, month);
    
    // Initialize day options for editing
    const initializedWeeks = calendarWeeks.map(week => 
      week.map(day => {
        const isDayNR = day.isWeekend || day.holiday !== null;
        
        // Initialize default rider statuses
        const ridersStatus = {};
        RIDERS.forEach(rider => {
          ridersStatus[rider] = {
            am: isDayNR ? 'NR' : 'R',
            pm: isDayNR ? 'NR' : 'R'
          };
        });

        return {
          ...day,
          isNR: isDayNR,
          isHoliday: day.holiday !== null,
          driverAm: isDayNR ? '' : 'Luke Mendelsohn', // Placeholder
          driverPm: isDayNR ? '' : 'Luke Mendelsohn', // Placeholder
          riders: ridersStatus
        };
      })
    );

    // Seed the default ridership and driving patterns on initial load
    const seededWeeks = runSeedingAlgorithm(initializedWeeks);
    setWeeks(seededWeeks);
    setActiveWeekIdx(0);
  }, [selectedMonth]);

  // Toast auto-clear
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Seeding Algorithm
  const runSeedingAlgorithm = (weeksData) => {
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
      // Alternate drivers: Luke drives on even active days, Chris on odd active days
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

    // 3. Heidi is out Mondays and Fridays by default
    activeDays.forEach(day => {
      const dayObj = updatedWeeks[day.wIdx][day.dIdx];
      const dVal = new Date(dayObj.date);
      const dayOfWeek = dVal.getDay(); // 1 = Monday, 5 = Friday
      
      if (dayOfWeek === 1 || dayOfWeek === 5) {
        if (dayObj.riders["Heiddy Rocha"]) {
          dayObj.riders["Heiddy Rocha"].am = 'X';
          dayObj.riders["Heiddy Rocha"].pm = 'X';
        }
      }
    });

    // 4. Seeding random absences: everyone out 1-2 days a month
    RIDERS.forEach(rider => {
      // Absences: 1 or 2 days
      const absenceCount = Math.floor(Math.random() * 2) + 1;
      
      // Shuffle active days list and take first N days
      const shuffledActiveDays = [...activeDays].sort(() => 0.5 - Math.random());
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
  };

  const handleSeed = () => {
    // Generate clean template, then seed it
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const calendarWeeks = getMonthCalendarWeeks(year, month);
    
    const initializedWeeks = calendarWeeks.map(week => 
      week.map(day => {
        const isDayNR = day.isWeekend || day.holiday !== null;
        const ridersStatus = {};
        RIDERS.forEach(rider => {
          ridersStatus[rider] = {
            am: isDayNR ? 'NR' : 'R',
            pm: isDayNR ? 'NR' : 'R'
          };
        });

        return {
          ...day,
          isNR: isDayNR,
          isHoliday: day.holiday !== null,
          driverAm: isDayNR ? '' : 'Luke Mendelsohn',
          driverPm: isDayNR ? '' : 'Luke Mendelsohn',
          riders: ridersStatus
        };
      })
    );

    const seeded = runSeedingAlgorithm(initializedWeeks);
    setWeeks(seeded);
    showToast("Ridership randomly seeded! Heidi is out Mon/Fri, others are out 1-2 days.");
  };

  // Get count of active commute days in current state
  const getActiveCommuteDays = () => {
    let count = 0;
    weeks.forEach(week => {
      week.forEach(day => {
        if (day.inMonth && !day.isNR) {
          count++;
        }
      });
    });
    return count;
  };

  const activeDaysCount = getActiveCommuteDays();
  const calculatedEndingMileage = startingMileage + activeDaysCount * 90; // 90 miles per active day roundtrip
  const finalEndingMileage = isMileageOverridden ? endingMileage : calculatedEndingMileage;

  const showToast = (msg) => {
    setToast(msg);
  };

  // Day Status selection: Commute vs NR vs Holiday
  const handleDayStatusChange = (wIdx, dIdx, status) => {
    const updated = [...weeks];
    const day = updated[wIdx][dIdx];
    
    if (status === 'commute') {
      day.isNR = false;
      day.isHoliday = false;
      day.driverAm = day.driverAm || 'Luke Mendelsohn';
      day.driverPm = day.driverPm || 'Luke Mendelsohn';
      RIDERS.forEach(r => {
        day.riders[r] = {
          am: r === day.driverAm ? 'D' : 'R',
          pm: r === day.driverPm ? 'D' : 'R'
        };
      });
    } else if (status === 'nr') {
      day.isNR = true;
      day.isHoliday = false;
      day.driverAm = '';
      day.driverPm = '';
      RIDERS.forEach(r => {
        day.riders[r] = { am: 'NR', pm: 'NR' };
      });
    } else if (status === 'holiday') {
      day.isNR = true;
      day.isHoliday = true;
      day.driverAm = '';
      day.driverPm = '';
      RIDERS.forEach(r => {
        day.riders[r] = { am: 'NR', pm: 'NR' };
      });
    }
    
    setWeeks(updated);
  };

  // Driver Change Handler
  const handleDriverChange = (wIdx, dIdx, period, driverName) => {
    const updated = [...weeks];
    const day = updated[wIdx][dIdx];
    
    if (period === 'am') {
      const oldDriver = day.driverAm;
      day.driverAm = driverName;
      
      // Update riders status
      if (day.riders[driverName].am === 'X' || day.riders[driverName].am === 'R' || day.riders[driverName].am === 'D') {
        day.riders[driverName].am = 'D'; // New driver drove
      }
      if (oldDriver && oldDriver !== driverName) {
        // If old driver is still in van, revert to ride 'R'
        if (day.riders[oldDriver].am === 'D') {
          day.riders[oldDriver].am = 'R';
        }
      }
    } else {
      const oldDriver = day.driverPm;
      day.driverPm = driverName;
      
      if (day.riders[driverName].pm === 'X' || day.riders[driverName].pm === 'R' || day.riders[driverName].pm === 'D') {
        day.riders[driverName].pm = 'D';
      }
      if (oldDriver && oldDriver !== driverName) {
        if (day.riders[oldDriver].pm === 'D') {
          day.riders[oldDriver].pm = 'R';
        }
      }
    }
    setWeeks(updated);
  };

  // Rider presence checkbox handler
  const handleRiderPresence = (wIdx, dIdx, period, riderName, checked) => {
    const updated = [...weeks];
    const day = updated[wIdx][dIdx];
    
    if (checked) {
      // If checked: set to 'R' (unless they are selected as the driver, then they are 'D')
      const isDriver = period === 'am' ? day.driverAm === riderName : day.driverPm === riderName;
      day.riders[riderName][period] = isDriver ? 'D' : 'R';
    } else {
      // If unchecked: set to 'X'
      day.riders[riderName][period] = 'X';
      
      // If this rider was the driver, we must unassign driver and pick a backup
      if (period === 'am' && day.driverAm === riderName) {
        const backup = DEFAULT_DRIVERS.find(d => d !== riderName) || "Luke Mendelsohn";
        day.driverAm = backup;
        day.riders[backup].am = 'D';
      }
      if (period === 'pm' && day.driverPm === riderName) {
        const backup = DEFAULT_DRIVERS.find(d => d !== riderName) || "Luke Mendelsohn";
        day.driverPm = backup;
        day.riders[backup].pm = 'D';
      }
    }
    setWeeks(updated);
  };

  // Handle PV (Personal Vehicle) toggle on NR days
  const handlePVToggle = (wIdx, dIdx, riderName, checked) => {
    const updated = [...weeks];
    const day = updated[wIdx][dIdx];
    
    if (checked) {
      day.riders[riderName].am = 'PV';
      day.riders[riderName].pm = 'PV';
    } else {
      day.riders[riderName].am = 'NR';
      day.riders[riderName].pm = 'NR';
    }
    setWeeks(updated);
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      await exportToExcel(
        selectedMonth, 
        weeks, 
        startingMileage, 
        finalEndingMileage, 
        RIDERS
      );
      showToast("Excel spreadsheet generated and downloaded successfully!");
    } catch (err) {
      console.error(err);
      alert("Error exporting Excel: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getMonthOptions = () => {
    const options = [];
    const date = new Date(2026, 0, 1); // Start Jan 2026
    for (let i = 0; i < 24; i++) {
      options.push(new Date(date));
      date.setMonth(date.getMonth() + 1);
    }
    return options;
  };

  return (
    <div className="animate-fade-in">
      {/* Toast Notification */}
      {toast && (
        <div className="toast-msg">
          <CheckCircle2 size={18} className="text-accent-teal" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Panel */}
      <header className="glass-card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarIcon size={24} className="text-white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.6rem', lineHeight: '1.2' }}>VanPool Tracker</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>ABS05 • Fredericksburg to Springfield</p>
          </div>
        </div>

        {/* Month Picker */}
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label className="odometer-label" style={{ display: 'block', marginBottom: '6px' }}>Commute Month</label>
            <select 
              className="input-glass"
              value={selectedMonth.getTime()}
              onChange={(e) => setSelectedMonth(new Date(Number(e.target.value)))}
              style={{ paddingRight: '30px' }}
            >
              {getMonthOptions().map((date, idx) => (
                <option key={idx} value={date.getTime()}>
                  {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button 
              className="btn-secondary" 
              onClick={handleSeed}
              title="Re-seed Ridership Randomly"
              style={{ height: '48px', padding: '0 16px' }}
            >
              <RefreshCw size={18} />
              <span style={{ fontSize: '0.9rem' }}>Seed</span>
            </button>
          </div>
        </div>
      </header>

      {/* Odometer Tracking Box */}
      <section className="glass-card" style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={18} className="text-accent-primary" />
          Odometer Log (Miles)
        </h2>
        <div className="odometer-grid">
          <div>
            <label className="odometer-label">Beginning Mileage</label>
            <input 
              type="number" 
              className="input-glass"
              value={startingMileage}
              onChange={(e) => setStartingMileage(Number(e.target.value))}
              placeholder="e.g. 109867"
            />
          </div>
          <div>
            <label className="odometer-label">
              Ending Mileage {isMileageOverridden && "(Manual)"}
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type="number" 
                className="input-glass"
                value={finalEndingMileage}
                onChange={(e) => {
                  setEndingMileage(Number(e.target.value));
                  setIsMileageOverridden(true);
                }}
                placeholder="e.g. 111867"
              />
              {isMileageOverridden && (
                <button 
                  onClick={() => setIsMileageOverridden(false)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span>Active commute days: <strong>{activeDaysCount}</strong></span>
          <span>Auto-est distance: <strong>{activeDaysCount * 90} miles</strong></span>
        </div>
      </section>

      {/* Week Navigator Tabs */}
      <nav className="week-tabs" style={{ marginBottom: '8px' }}>
        {weeks.map((_, idx) => (
          <button 
            key={idx}
            className={`week-tab-btn ${activeWeekIdx === idx ? 'active' : ''}`}
            onClick={() => setActiveWeekIdx(idx)}
          >
            Week {idx + 1}
          </button>
        ))}
      </nav>

      {/* Week View Cards */}
      <main style={{ minHeight: '300px' }}>
        {weeks[activeWeekIdx]?.map((day, dIdx) => (
          <div 
            key={dIdx} 
            className={`day-card ${!day.inMonth ? 'nr' : day.isHoliday ? 'holiday' : day.isNR ? 'nr' : 'active'}`}
            style={{ display: day.inMonth ? 'flex' : 'none' }}
          >
            {/* Header of the Day */}
            <div className="day-header">
              <div className="day-title">
                <span className="day-name">
                  {day.date.toLocaleDateString('default', { weekday: 'long' })}
                </span>
                <span className="day-date">
                  {day.date.toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                </span>
                {day.holiday && (
                  <span style={{ fontSize: '0.7rem', background: 'var(--accent-orange)', color: 'white', padding: '2px 6px', borderRadius: '6px', fontWeight: 'bold', marginLeft: '6px' }}>
                    {day.holiday}
                  </span>
                )}
              </div>

              {/* Status pills */}
              <div className="status-pills">
                <div 
                  className={`status-pill ${!day.isNR ? 'active commute' : ''}`}
                  onClick={() => handleDayStatusChange(activeWeekIdx, dIdx, 'commute')}
                >
                  Commute
                </div>
                <div 
                  className={`status-pill ${day.isNR && !day.isHoliday ? 'active nr' : ''}`}
                  onClick={() => handleDayStatusChange(activeWeekIdx, dIdx, 'nr')}
                >
                  NR
                </div>
                <div 
                  className={`status-pill ${day.isNR && day.isHoliday ? 'active holiday' : ''}`}
                  onClick={() => handleDayStatusChange(activeWeekIdx, dIdx, 'holiday')}
                >
                  Holiday
                </div>
              </div>
            </div>

            {/* Commute AM/PM Grid */}
            {!day.isNR ? (
              <div className="commute-split">
                {/* AM Trip */}
                <div className="commute-block">
                  <div className="commute-block-title">🌅 AM Commute</div>
                  
                  {/* Driver Select */}
                  <div className="driver-select-container">
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Driver</label>
                    <select 
                      className="input-glass"
                      style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px' }}
                      value={day.driverAm}
                      onChange={(e) => handleDriverChange(activeWeekIdx, dIdx, 'am', e.target.value)}
                    >
                      {RIDERS.map((r, rIdx) => (
                        <option key={rIdx} value={r}>{r.split(' ')[0]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rider Checklist */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {RIDERS.map((rider, rIdx) => {
                      const status = day.riders[rider]?.am;
                      const isDriver = day.driverAm === rider;
                      const isAbsent = status === 'X';

                      return (
                        <div key={rIdx} className="rider-row">
                          <span className={`rider-name ${isDriver ? 'driver' : ''} ${isAbsent ? 'absent' : ''}`}>
                            {rider.split(' ')[0]} {isDriver && "(D)"}
                          </span>
                          <label className="checkbox-glass">
                            <input 
                              type="checkbox" 
                              checked={!isAbsent}
                              onChange={(e) => handleRiderPresence(activeWeekIdx, dIdx, 'am', rider, e.target.checked)}
                            />
                            <span className="checkmark"></span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PM Trip */}
                <div className="commute-block">
                  <div className="commute-block-title">🌇 PM Commute</div>
                  
                  {/* Driver Select */}
                  <div className="driver-select-container">
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Driver</label>
                    <select 
                      className="input-glass"
                      style={{ padding: '6px 8px', fontSize: '0.8rem', borderRadius: '8px' }}
                      value={day.driverPm}
                      onChange={(e) => handleDriverChange(activeWeekIdx, dIdx, 'pm', e.target.value)}
                    >
                      {RIDERS.map((r, rIdx) => (
                        <option key={rIdx} value={r}>{r.split(' ')[0]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rider Checklist */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {RIDERS.map((rider, rIdx) => {
                      const status = day.riders[rider]?.pm;
                      const isDriver = day.driverPm === rider;
                      const isAbsent = status === 'X';

                      return (
                        <div key={rIdx} className="rider-row">
                          <span className={`rider-name ${isDriver ? 'driver' : ''} ${isAbsent ? 'absent' : ''}`}>
                            {rider.split(' ')[0]} {isDriver && "(D)"}
                          </span>
                          <label className="checkbox-glass">
                            <input 
                              type="checkbox" 
                              checked={!isAbsent}
                              onChange={(e) => handleRiderPresence(activeWeekIdx, dIdx, 'pm', rider, e.target.checked)}
                            />
                            <span className="checkmark"></span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              // NR/Holiday Layout (No commuting, but can log personal vehicle travel PV)
              <div style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '12px', padding: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <AlertCircle size={14} className="text-text-muted" />
                  No Vanpool Commute. Toggle riders who drove personal vehicle (PV):
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {RIDERS.map((rider, rIdx) => {
                    const isPV = day.riders[rider]?.am === 'PV';
                    return (
                      <div key={rIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: isPV ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: isPV ? '600' : 'normal' }}>
                          {rider.split(' ')[0]} {isPV && "(PV)"}
                        </span>
                        <label className="checkbox-glass">
                          <input 
                            type="checkbox" 
                            checked={isPV}
                            onChange={(e) => handlePVToggle(activeWeekIdx, dIdx, rider, e.target.checked)}
                          />
                          <span className="checkmark" style={{ borderColor: isPV ? 'var(--accent-teal)' : 'var(--border-glass)' }}></span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </main>

      {/* Sticky Bottom Actions */}
      <footer className="action-panel">
        <button 
          className="btn-primary" 
          onClick={handleExport}
          disabled={loading}
          style={{ flex: 1, padding: '16px' }}
        >
          {loading ? (
            <RefreshCw size={20} className="animate-spin" />
          ) : (
            <Download size={20} />
          )}
          <span>{loading ? 'Exporting...' : 'Download Report (.xlsx)'}</span>
        </button>
      </footer>
    </div>
  );
}
