import { useState, useMemo } from "react";
import { Calendar, Zap, MapPin, TrendingUp, Info, LucideIcon } from "lucide-react";

type HolidayType = "fijo" | "trasladado" | "semana_santa";

interface Holiday {
  date: string;
  name: string;
  type: HolidayType;
}

interface VacOpp {
  startDate: string;
  endDate: string;
  vacationDays: number;
  totalDays: number;
  efficiency: number;
  holidays: string[];
}

interface MonthGridProps {
  year: number;
  month: number;
  holidays: Set<string>;
  highlighted?: { start: string; end: string };
  vacationDates?: Set<string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mkDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

function fmtShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

function fmtWeekday(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long",
  });
}

// ── Easter & Colombian holiday algorithm ─────────────────────────────────────

function getEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function nextMonday(d: Date): Date {
  const dow = d.getDay();
  if (dow === 1) return d;
  const diff = dow === 0 ? 1 : 8 - dow;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

function getColombianHolidays(year: number): Holiday[] {
  const easter = getEaster(year);
  const easterMs = easter.getTime();
  const DAY_MS = 86400000;

  const fixed = (month: number, day: number): string =>
    mkDateStr(new Date(year, month - 1, day));

  const emiliani = (month: number, day: number): string =>
    mkDateStr(nextMonday(new Date(year, month - 1, day)));

  const easterOff = (days: number): string =>
    mkDateStr(nextMonday(new Date(easterMs + days * DAY_MS)));

  const holidays: Holiday[] = [
    { date: fixed(1, 1),      name: "Año Nuevo",                  type: "fijo" },
    { date: emiliani(1, 6),   name: "Reyes Magos",                type: "trasladado" },
    { date: emiliani(3, 19),  name: "San José",                   type: "trasladado" },
    { date: mkDateStr(new Date(easterMs - 3 * DAY_MS)), name: "Jueves Santo",  type: "semana_santa" },
    { date: mkDateStr(new Date(easterMs - 2 * DAY_MS)), name: "Viernes Santo", type: "semana_santa" },
    { date: fixed(5, 1),      name: "Día del Trabajo",            type: "fijo" },
    { date: easterOff(39),    name: "Ascensión del Señor",        type: "trasladado" },
    { date: easterOff(60),    name: "Corpus Christi",             type: "trasladado" },
    { date: easterOff(68),    name: "Sagrado Corazón",            type: "trasladado" },
    { date: emiliani(6, 29),  name: "San Pedro y San Pablo",      type: "trasladado" },
    { date: fixed(7, 20),     name: "Independencia de Colombia",  type: "fijo" },
    { date: fixed(8, 7),      name: "Batalla de Boyacá",          type: "fijo" },
    { date: emiliani(8, 15),  name: "Asunción de la Virgen",      type: "trasladado" },
    { date: emiliani(10, 12), name: "Día de la Raza",             type: "trasladado" },
    { date: emiliani(11, 1),  name: "Todos los Santos",           type: "trasladado" },
    { date: emiliani(11, 11), name: "Independencia de Cartagena", type: "trasladado" },
    { date: fixed(12, 8),     name: "Inmaculada Concepción",      type: "fijo" },
    { date: fixed(12, 25),    name: "Navidad",                    type: "fijo" },
  ];

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Vacation optimizer ───────────────────────────────────────────────────────

function computeOpportunities(year: number, maxVac: number, holidays: Holiday[]): VacOpp[] {
  const hSet = new Set(holidays.map((h) => h.date));
  const isOff = (d: Date) => isWeekend(d) || hSet.has(mkDateStr(d));

  type Block = { type: "off" | "work"; count: number; start: string; end: string };
  const blocks: Block[] = [];
  let cur = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  while (cur <= yearEnd) {
    const off = isOff(cur);
    const ds = mkDateStr(cur);
    const last = blocks[blocks.length - 1];
    if (last && last.type === (off ? "off" : "work")) {
      last.count++;
      last.end = ds;
    } else {
      blocks.push({ type: off ? "off" : "work", count: 1, start: ds, end: ds });
    }
    cur = addDays(cur, 1);
  }

  const opps: VacOpp[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== "off") continue;

    let totalWork = 0;
    let totalDays = blocks[i].count;

    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[j].type === "work") {
        totalWork += blocks[j].count;
        totalDays += blocks[j].count;
        if (totalWork > maxVac) break;
      } else {
        totalDays += blocks[j].count;
        if (totalWork > 0) {
          const key = `${blocks[i].start}-${blocks[j].end}`;
          if (!seen.has(key)) {
            seen.add(key);
            const windowHolidays = holidays
              .filter((h) => h.date >= blocks[i].start && h.date <= blocks[j].end)
              .map((h) => h.name);
            if (windowHolidays.length > 0) {
              opps.push({
                startDate: blocks[i].start,
                endDate: blocks[j].end,
                vacationDays: totalWork,
                totalDays,
                efficiency: totalDays / totalWork,
                holidays: windowHolidays,
              });
            }
          }
        }
      }
    }
  }

  return opps
    .sort((a, b) => b.efficiency - a.efficiency || b.totalDays - a.totalDays)
    .slice(0, 18);
}

// ── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAYS_ABBR = ["D", "L", "M", "X", "J", "V", "S"];

const TYPE_LABELS: Record<HolidayType, string> = {
  fijo: "Fijo",
  trasladado: "Trasladado",
  semana_santa: "Semana Santa",
};

const TYPE_COLORS: Record<HolidayType, string> = {
  fijo: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  trasladado: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  semana_santa: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

// ── Sub-components ───────────────────────────────────────────────────────────

function MonthGrid({ year, month, holidays, highlighted, vacationDates }: MonthGridProps) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  return (
    <div>
      <div
        className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-widest"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {MONTHS[month]}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {DAYS_ABBR.map((d) => (
          <div key={d} className="text-[9px] text-center text-muted-foreground/60 pb-1"
            style={{ fontFamily: "'DM Mono', monospace" }}>
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          const cellKey = `${year}-${month}-${day ?? "e" + idx}`;
          if (!day) return <div key={cellKey} />;
          const d = new Date(year, month, day);
          const ds = mkDateStr(d);
          const isHol = holidays.has(ds);
          const isSat = d.getDay() === 6;
          const isSun = d.getDay() === 0;
          const isHL = highlighted != null && ds >= highlighted.start && ds <= highlighted.end;
          const isVac = vacationDates != null && vacationDates.has(ds);

          let cls = "text-[10px] text-center rounded py-px leading-4 ";
          if (isHol) {
            cls += "bg-yellow-400 text-black font-bold";
          } else if (isVac) {
            cls += "bg-red-500/50 text-red-200 font-medium";
          } else if (isHL) {
            cls += "bg-emerald-500/20 text-emerald-300";
          } else if (isSun) {
            cls += "text-red-400/80";
          } else if (isSat) {
            cls += "text-blue-400/80";
          } else {
            cls += "text-foreground/50";
          }

          return (
            <div key={cellKey} className={cls} style={{ fontFamily: "'DM Mono', monospace" }}>
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

type TabId = "festivos" | "optimizador";

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: "festivos", label: "Festivos", Icon: Calendar },
  { id: "optimizador", label: "Optimizador de Vacaciones", Icon: Zap },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("festivos");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [vacDays, setVacDays] = useState(5);
  const [selectedOpp, setSelectedOpp] = useState<VacOpp | null>(null);
  const [showFutureYears, setShowFutureYears] = useState(false);

  const futureYears = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + 1 + i);

  const holidays = useMemo(() => getColombianHolidays(year), [year]);
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const opportunities = useMemo(
    () => computeOpportunities(year, vacDays, holidays),
    [year, vacDays, holidays]
  );

  const highlighted = selectedOpp
    ? { start: selectedOpp.startDate, end: selectedOpp.endDate }
    : undefined;

  const vacationDates = useMemo(() => {
    if (!selectedOpp) return undefined;
    const hSet = new Set(holidays.map((h) => h.date));
    const isOff = (d: Date) => isWeekend(d) || hSet.has(mkDateStr(d));
    const result = new Set<string>();
    let cur = new Date(selectedOpp.startDate + "T12:00:00");
    const end = new Date(selectedOpp.endDate + "T12:00:00");
    while (cur <= end) {
      if (!isOff(cur)) result.add(mkDateStr(cur));
      cur = addDays(cur, 1);
    }
    return result;
  }, [selectedOpp, holidays]);

  const affectedMonths = useMemo(() => {
    if (!selectedOpp) return [];
    const start = new Date(selectedOpp.startDate + "T12:00:00");
    const end = new Date(selectedOpp.endDate + "T12:00:00");
    const months: { year: number; month: number }[] = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return months;
  }, [selectedOpp]);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Colombia flag stripe */}
      <div className="h-[3px] w-full flex">
        <div className="flex-[2] bg-yellow-400" />
        <div className="flex-1 bg-blue-700" />
        <div className="flex-1 bg-red-600" />
      </div>

      {/* Header */}
      <header className="border-b border-border px-5 py-4 sticky top-0 z-20 bg-background/95">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-none">
                Festivos Colombia
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Calendario oficial + optimizador de vacaciones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
            {/* Current year — always visible */}
            <button
              onClick={() => { setYear(CURRENT_YEAR); setSelectedOpp(null); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                year === CURRENT_YEAR
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              {CURRENT_YEAR}
            </button>

            {/* Future years — revealed on demand */}
            {showFutureYears && futureYears.map((y) => (
              <button
                key={y}
                onClick={() => { setYear(y); setSelectedOpp(null); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  year === y
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                {y}
              </button>
            ))}

            {/* Toggle button */}
            <button
              onClick={() => {
                setShowFutureYears((v) => {
                  if (v) { setYear(CURRENT_YEAR); setSelectedOpp(null); }
                  return !v;
                });
              }}
              className="px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground transition-all border border-border/50 ml-1"
              title={showFutureYears ? "Ocultar años futuros" : "Ver años futuros"}
            >
              {showFutureYears ? "−" : "+ años"}
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border px-5">
        <div className="max-w-6xl mx-auto flex">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                tab === id
                  ? "border-yellow-400 text-yellow-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-5 py-8">

        {/* FESTIVOS TAB */}
        {tab === "festivos" && (
          <div className="space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-3xl font-bold text-yellow-400" style={{ fontFamily: "'DM Mono', monospace" }}>
                  {holidays.length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Días festivos</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-3xl font-bold text-blue-400" style={{ fontFamily: "'DM Mono', monospace" }}>
                  {holidays.filter((h) => h.type === "fijo").length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Festivos fijos</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-3xl font-bold text-purple-400" style={{ fontFamily: "'DM Mono', monospace" }}>
                  {holidays.filter((h) => h.type === "trasladado").length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Trasladados (Ley Emiliani)</div>
              </div>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4">
                  <MonthGrid year={year} month={i} holidays={holidaySet} />
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-400" />
                <span>Festivo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">D</span>
                <span>Domingo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400">S</span>
                <span>Sábado</span>
              </div>
            </div>

            {/* Holiday list */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                  style={{ fontFamily: "'DM Mono', monospace" }}>
                  Lista completa — {year}
                </h2>
                <span className="text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>
                  {holidays.length} festivos
                </span>
              </div>
              <div className="divide-y divide-border/50">
                {holidays.map((h) => (
                  <div key={h.date} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="text-xs text-muted-foreground shrink-0 w-20"
                        style={{ fontFamily: "'DM Mono', monospace" }}>
                        {fmtShort(h.date)}
                      </div>
                      <div className="text-sm font-medium truncate">{h.name}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className={"text-[10px] px-2 py-0.5 rounded border font-medium " + TYPE_COLORS[h.type]}>
                        {TYPE_LABELS[h.type]}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize hidden sm:block"
                        style={{ fontFamily: "'DM Mono', monospace" }}>
                        {fmtWeekday(h.date)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OPTIMIZADOR TAB */}
        {tab === "optimizador" && (
          <div className="space-y-6">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex gap-3">
              <Info className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Encuentra los mejores puentes de {year}: indica cuántos días de vacaciones tienes
                disponibles y el optimizador te muestra cuándo pedirlos para obtener la mayor
                cantidad de días libres consecutivos, aprovechando festivos y fines de semana.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <label className="text-sm font-medium">Días de vacaciones disponibles</label>
                  <p className="text-xs text-muted-foreground mt-0.5">Puedes usar menos días en cada oportunidad</p>
                </div>
                <div className="text-4xl font-bold text-yellow-400 leading-none"
                  style={{ fontFamily: "'DM Mono', monospace" }}>
                  {vacDays}
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={vacDays}
                onChange={(e) => { setVacDays(Number(e.target.value)); setSelectedOpp(null); }}
                className="w-full accent-yellow-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1"
                style={{ fontFamily: "'DM Mono', monospace" }}>
                <span>1 día</span>
                <span>10 días</span>
                <span>20 días</span>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
              {/* Opportunity list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
                    style={{ fontFamily: "'DM Mono', monospace" }}>
                    Mejores oportunidades — hasta {vacDays} días
                  </h2>
                  <span className="text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {opportunities.length} opciones
                  </span>
                </div>

                {opportunities.length === 0 && (
                  <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground text-sm">
                    No se encontraron puentes con {vacDays} día{vacDays > 1 ? "s" : ""}.
                  </div>
                )}

                {opportunities.map((opp, idx) => {
                  const isSelected = selectedOpp === opp;
                  const rank = String(idx + 1).padStart(2, "0");
                  return (
                    <button
                      key={opp.startDate + "-" + opp.endDate}
                      onClick={() => setSelectedOpp(isSelected ? null : opp)}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        isSelected
                          ? "border-yellow-400/50 bg-yellow-500/5"
                          : "border-border bg-card hover:bg-muted/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={"text-xs font-medium shrink-0 mt-0.5 " + (isSelected ? "text-yellow-400" : "text-muted-foreground/40")}
                          style={{ fontFamily: "'DM Mono', monospace" }}
                        >
                          {rank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">
                              {fmtShort(opp.startDate)} – {fmtShort(opp.endDate)}
                            </span>
                            <div className="text-right shrink-0">
                              <span className="text-lg font-bold text-emerald-400 leading-none"
                                style={{ fontFamily: "'DM Mono', monospace" }}>
                                {opp.totalDays}d
                              </span>
                              <span className="text-muted-foreground text-xs ml-1">libres</span>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                              {opp.vacationDays} día{opp.vacationDays > 1 ? "s" : ""} vac.
                            </span>
                            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full"
                              style={{ fontFamily: "'DM Mono', monospace" }}>
                              {opp.efficiency.toFixed(1)}x rendimiento
                            </span>
                            {opp.holidays.slice(0, 2).map((h) => (
                              <span key={h} className="text-xs text-muted-foreground truncate max-w-[120px]">
                                · {h}
                              </span>
                            ))}
                            {opp.holidays.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{opp.holidays.length - 2} más
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-4 pt-4 border-t border-border/40 grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-xl font-bold text-yellow-400"
                              style={{ fontFamily: "'DM Mono', monospace" }}>
                              {opp.vacationDays}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">días de vacaciones</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-emerald-400"
                              style={{ fontFamily: "'DM Mono', monospace" }}>
                              {opp.totalDays}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">días libres totales</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-blue-400"
                              style={{ fontFamily: "'DM Mono', monospace" }}>
                              {opp.efficiency.toFixed(1)}x
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">días por día pedido</div>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Calendar preview */}
              <div className="lg:sticky lg:top-24">
                <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3"
                  style={{ fontFamily: "'DM Mono', monospace" }}>
                  {selectedOpp ? "Vista en calendario" : "Selecciona una oportunidad"}
                </h2>

                {!selectedOpp ? (
                  <div className="bg-card border border-border rounded-xl p-8 text-center">
                    <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Selecciona una oportunidad para ver el período marcado en el calendario.
                    </p>
                  </div>
                ) : (
                  <div className="bg-card border border-yellow-400/20 rounded-xl p-5 space-y-5">
                    <div>
                      <p className="font-semibold text-base">
                        {fmtShort(selectedOpp.startDate)} – {fmtShort(selectedOpp.endDate)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Pide{" "}
                        <span className="text-red-400 font-medium">
                          {selectedOpp.vacationDays} día{selectedOpp.vacationDays > 1 ? "s" : ""} de vacaciones
                        </span>{" "}
                        y obtienes{" "}
                        <span className="text-emerald-400 font-medium">
                          {selectedOpp.totalDays} días libres
                        </span>{" "}
                        consecutivos.
                      </p>
                    </div>

                    <div className="flex gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-yellow-400" />
                        <span className="text-muted-foreground">Festivo</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-red-500/50" />
                        <span className="text-muted-foreground">Pedir vacaciones</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm bg-emerald-500/20" />
                        <span className="text-muted-foreground">Período libre</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {affectedMonths.map(({ year: y, month: m }) => (
                        <div key={y + "-" + m} className="bg-muted/20 rounded-lg p-3 border border-border/50">
                          <MonthGrid
                            year={y}
                            month={m}
                            holidays={holidaySet}
                            highlighted={highlighted}
                            vacationDates={vacationDates}
                          />
                        </div>
                      ))}
                    </div>

                    {selectedOpp.holidays.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2"
                          style={{ fontFamily: "'DM Mono', monospace" }}>
                          Festivos incluidos
                        </p>
                        <div className="flex flex-col gap-1">
                          {selectedOpp.holidays.map((h) => (
                            <div key={h} className="flex items-center gap-2 text-sm">
                              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                              <span className="text-foreground/80">{h}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
