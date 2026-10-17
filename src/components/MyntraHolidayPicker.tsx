"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, ChevronLeft, ChevronRight, X, Trash2 } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

interface MyntraHolidayPickerProps {
  initialHolidays: string[];
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function MyntraHolidayPicker({ initialHolidays }: MyntraHolidayPickerProps) {
  const router = useRouter();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [holidays, setHolidays] = useState<Set<string>>(new Set(initialHolidays));
  useEffect(() => {
    setHolidays(new Set(initialHolidays));
  }, [initialHolidays]);
  const [busy, setBusy] = useState(false);
  const today = todayIST();
  const [viewYear, viewMonth] = (() => {
    const [y, m] = today.split("-").map(Number);
    return [y, m - 1]; // month is 0-indexed for Date
  })();
  const [calYear, setCalYear] = useState(viewYear);
  const [calMonth, setCalMonth] = useState(viewMonth);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  }

  async function toggleDate(dateStr: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggle: dateStr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Failed to toggle holiday");
        return;
      }
      const newSet = new Set<string>(data.holidays || []);
      setHolidays(newSet);
      if (newSet.has(dateStr)) {
        toast.success(`${dateStr} marked as holiday ✓`);
      } else {
        toast.success(`${dateStr} removed from holidays ✓`);
      }
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holidays: [] }),
      });
      if (!res.ok) {
        toast.error("Failed to clear holidays");
        return;
      }
      setHolidays(new Set());
      toast.success("All holidays cleared ✓");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  const upcomingHolidays = [...holidays].filter((d) => d >= today).sort();
  const weeks = monthGrid(calYear, calMonth);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border text-sm transition px-3 py-1.5 ${
          holidays.size > 0
            ? "border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-500 dark:bg-orange-500/20 dark:text-orange-300 font-semibold shadow-sm"
            : "border-black/15 bg-transparent text-neutral-800 hover:bg-black/5 dark:border-white/20 dark:text-neutral-200 dark:hover:bg-white/10"
        }`}
        title={holidays.size > 0 ? `${holidays.size} holiday(s) set — click to manage` : "Set Myntra holidays (ship-by skips these dates)"}
      >
        <CalendarOff size={14} className={holidays.size > 0 ? "text-orange-600 dark:text-orange-400" : "text-neutral-500"} />
        <span>Holidays</span>
        {holidays.size > 0 ? (
          <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] ${
            "bg-orange-500 text-white dark:bg-orange-500"
          }`}>
            {holidays.size}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => !busy && setIsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/10 pb-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <CalendarOff className="text-orange-500 dark:text-orange-400" size={18} />
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Myntra Holidays
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={busy}
                className="rounded-lg p-1 text-neutral-400 hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              Click dates to mark as holidays. Orders with ship-by on a holiday will automatically shift to the <b>next working day</b>.
            </p>

            {/* Calendar navigation */}
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={prevMonth} disabled={busy} className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button type="button" onClick={nextMonth} disabled={busy} className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Day headers */}
            <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
              {DAY_HEADERS.map((d) => <span key={d}>{d}</span>)}
            </div>

            {/* Calendar grid */}
            <div className="mt-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 text-center">
                  {week.map((day, di) => {
                    if (day === null) return <span key={di} />;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isHoliday = holidays.has(dateStr);
                    const isToday = dateStr === today;
                    const isPast = dateStr < today;

                    return (
                      <button
                        key={di}
                        type="button"
                        disabled={busy || isPast}
                        onClick={() => toggleDate(dateStr)}
                        className={`relative m-0.5 rounded-lg py-1.5 text-xs font-medium transition ${
                          isHoliday
                            ? "bg-orange-500 text-white shadow-sm hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600"
                            : isPast
                              ? "text-neutral-300 dark:text-neutral-600 cursor-not-allowed"
                              : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
                        } ${isToday && !isHoliday ? "ring-2 ring-brand-500/50 ring-inset" : ""}`}
                        title={
                          isPast ? "Past date" : isHoliday ? `Remove ${dateStr} from holidays` : `Mark ${dateStr} as holiday`
                        }
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Upcoming holidays list */}
            {upcomingHolidays.length > 0 ? (
              <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Upcoming holidays ({upcomingHolidays.length})
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    <Trash2 size={11} />
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {upcomingHolidays.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleDate(d)}
                      className="inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:hover:bg-orange-500/30 transition"
                      title={`Click to remove ${d}`}
                    >
                      {d}
                      <X size={11} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 border-t border-black/10 pt-3 text-xs text-neutral-400 dark:border-white/10">
                No holidays set — all days are working days.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
