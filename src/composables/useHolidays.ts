import { reactive } from "vue";
import h2025 from "@/assets/holidays-2025.json";
import h2026 from "@/assets/holidays-2026.json";

export interface HolidayDay {
  name: string;
  date: string; // YYYY-MM-DD
  isOffDay: boolean;
}

interface HolidayYear {
  year: number;
  days: HolidayDay[];
}

const vendored: Record<number, HolidayYear> = {
  2025: h2025 as unknown as HolidayYear,
  2026: h2026 as unknown as HolidayYear,
};

const dayMaps = new Map<number, Map<string, HolidayDay>>();
const inFlight = new Set<number>();
// 触发响应式：loadedYears 是 reactive set，每次 ensureYear 完成后 add。
const loadedYears = reactive<Set<number>>(new Set());

function indexYear(yd: HolidayYear): Map<string, HolidayDay> {
  const m = new Map<string, HolidayDay>();
  for (const d of yd.days) m.set(d.date, d);
  return m;
}

async function ensureYear(year: number) {
  if (loadedYears.has(year) || inFlight.has(year)) return;
  inFlight.add(year);
  try {
    let data: HolidayYear | null = vendored[year] ?? null;
    if (!data) {
      try {
        const url = `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`;
        const r = await fetch(url);
        if (r.ok) data = (await r.json()) as HolidayYear;
      } catch {
        // 离线 / 该年份未发布
      }
    }
    if (data) {
      dayMaps.set(year, indexYear(data));
      loadedYears.add(year);
    }
  } finally {
    inFlight.delete(year);
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getDay(year: number, month: number, day: number): HolidayDay | null {
  const key = `${year}-${pad(month)}-${pad(day)}`;
  return dayMaps.get(year)?.get(key) ?? null;
}

/// 每个节日的"正日"。仅元旦/劳动节/国庆节是固定公历；
/// 春节/清明/端午/中秋按农历或节气，这里硬编码 vendored 年份。
/// 其他年份（远端拉到的）查不到就直接显示「休」/「班」。
const CANONICAL_DATES: Record<number, Record<string, string>> = {
  2025: {
    元旦: "2025-01-01",
    春节: "2025-01-29",
    清明节: "2025-04-04",
    劳动节: "2025-05-01",
    端午节: "2025-05-31",
    中秋节: "2025-10-06",
    国庆节: "2025-10-01",
  },
  2026: {
    元旦: "2026-01-01",
    春节: "2026-02-17",
    清明节: "2026-04-05",
    劳动节: "2026-05-01",
    端午节: "2026-06-19",
    中秋节: "2026-09-25",
    国庆节: "2026-10-01",
  },
};

export interface HolidayLabel {
  text: string;
  isOffDay: boolean;
  isCanonical: boolean;
}

/// 取某天的展示信息：正日 text=节日名 isCanonical=true；
/// 其余放假 text="休"；调休补班 text="班"。
function getDayLabel(year: number, month: number, day: number): HolidayLabel | null {
  const h = getDay(year, month, day);
  if (!h) return null;
  const canonical = CANONICAL_DATES[year]?.[h.name];
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
  if (canonical === dateStr) {
    return { text: h.name, isOffDay: h.isOffDay, isCanonical: true };
  }
  return {
    text: h.isOffDay ? "休" : "班",
    isOffDay: h.isOffDay,
    isCanonical: false,
  };
}

export function useHolidays() {
  return { ensureYear, getDay, getDayLabel, loadedYears };
}
