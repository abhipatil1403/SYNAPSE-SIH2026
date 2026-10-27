"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "./symbols";
import {
  addCalendarDays,
  calendarDayKey,
  calendarMonthDays,
  eventsOnDay,
  formatCalendarDay,
  shiftCalendarMonth,
  type CalendarEvent,
} from "@/lib/calendar";
import { Card } from "./ui";

export function useTodayKey() {
  const [today, setToday] = useState(() => calendarDayKey(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => setToday(calendarDayKey(new Date()));
    const schedule = () => {
      const key = calendarDayKey(new Date());
      const delay =
        Date.parse(`${addCalendarDays(key, 1)}T00:00:00+05:30`) -
        Date.now() +
        50;
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, delay);
    };
    schedule();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function CalendarMonthGrid({
  month,
  today,
  selected,
  events,
  onSelect,
  onMonthChange,
  compact = false,
}: {
  month: string;
  today: string;
  selected: string;
  events: readonly CalendarEvent[];
  onSelect: (key: string) => void;
  onMonthChange: (month: string) => void;
  compact?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const days = calendarMonthDays(month, true);
  function select(key: string, focus = false) {
    if (key.slice(0, 7) !== month) onMonthChange(key.slice(0, 7));
    onSelect(key);
    if (focus)
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLButtonElement>(`[data-calendar-day="${key}"]`)
          ?.focus(),
      );
  }
  function keyboard(e: KeyboardEvent<HTMLButtonElement>, key: string) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    let next: string | undefined;
    if (e.key in offsets) next = addCalendarDays(key, offsets[e.key]);
    if (e.key === "Home" || e.key === "End") {
      const index = days.findIndex((d) => d.key === key) % 7;
      next = addCalendarDays(key, e.key === "Home" ? -index : 6 - index);
    }
    if (e.key === "PageUp" || e.key === "PageDown")
      next = `${shiftCalendarMonth(month, e.key === "PageUp" ? -1 : 1)}-01`;
    if (next) {
      e.preventDefault();
      select(next, true);
    }
  }
  return (
    <div ref={root} className={compact ? "quick-month" : "calendar-month"}>
      <div className={compact ? "quick-calendar-week" : "calendar-week"}>
        {weekdays.map((day) => (
          <span key={day}>
            <abbr title={day}>
              {compact ? day.slice(0, 1) : day.slice(0, 3)}
            </abbr>
          </span>
        ))}
      </div>
      <div
        className={
          compact ? "quick-calendar-grid month-enter" : "calendar-grid"
        }
        key={month}
        role="group"
        aria-label={`${formatCalendarDay(`${month}-01`, { month: "long", year: "numeric" })} dates`}
      >
        {days.map((d) => {
          const items = eventsOnDay(events, d.key);
          return (
            <button
              type="button"
              key={d.key}
              data-calendar-day={d.key}
              tabIndex={compact && d.key !== selected ? -1 : 0}
              aria-label={`${formatCalendarDay(d.key, { day: "numeric", month: "long", year: "numeric" })}, ${items.length} events`}
              aria-current={d.key === today ? "date" : undefined}
              aria-pressed={selected === d.key}
              className={`${compact ? "quick-calendar-day" : "calendar-day"} ${d.outside ? "outside" : ""} ${d.key === today ? "today" : ""} ${d.key === selected ? "selected" : ""}`}
              onClick={() => select(d.key)}
              onKeyDown={(e) => keyboard(e, d.key)}
            >
              <span className="day-number">{d.day}</span>
              {compact ? (
                <span className="calendar-indicators" aria-hidden="true">
                  {Array.from(new Set(items.map((e) => e.type)))
                    .slice(0, 3)
                    .map((type) => (
                      <i
                        key={type}
                        className={
                          type === "Bureau reviews" || type === "Approvals"
                            ? "review"
                            : ""
                        }
                      />
                    ))}
                </span>
              ) : (
                <>
                  {items.slice(0, 2).map((event) => (
                    <span
                      key={event.id}
                      className={`calendar-event ${event.type === "Bureau reviews" ? "review" : ""}`}
                    >
                      {event.title}
                    </span>
                  ))}
                  {items.length > 2 && (
                    <span className="event-more">+{items.length - 2} more</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QuickCalendar({
  events,
  loading = false,
  error,
  eventsUnavailable = false,
}: {
  events: readonly CalendarEvent[];
  loading?: boolean;
  error?: string;
  eventsUnavailable?: boolean;
}) {
  const today = useTodayKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const visibleEvents = eventsUnavailable ? [] : events;
  const selectedEvents = eventsOnDay(visibleEvents, selected);
  const comingUp = visibleEvents.filter((e) => e.key > selected).slice(0, 1);
  function navigate(offset: number) {
    const next = shiftCalendarMonth(month, offset);
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  }
  return (
    <Card
      title="Calendar"
      className="quick-calendar-card"
      action={
        <Link
          className="icon-link"
          aria-label="Open full calendar"
          href={`/calendar?date=${selected}`}
          prefetch={false}
        >
          <ArrowUpRight size={18} />
        </Link>
      }
    >
      <div className="quick-calendar-toolbar">
        <h3 aria-live="polite">
          {formatCalendarDay(`${month}-01`, { month: "long", year: "numeric" })}
        </h3>
        <div>
          <button
            type="button"
            className="calendar-nav"
            aria-label="Previous month"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className="calendar-nav"
            aria-label="Next month"
            onClick={() => navigate(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="quick-calendar-loading" role="status">
          <div className="skeleton" />
          <p>Loading calendar events…</p>
        </div>
      ) : error ? (
        <div className="quick-calendar-message" role="alert">
          <p>{error}</p>
          <Link href="/calendar">Open Calendar</Link>
        </div>
      ) : (
        <>
          <CalendarMonthGrid
            month={month}
            today={today}
            selected={selected}
            events={visibleEvents}
            onSelect={setSelected}
            onMonthChange={setMonth}
            compact
          />
          <div className="quick-agenda-head">
            <h3>
              {selected === today
                ? "Today"
                : formatCalendarDay(selected, { weekday: "short" })}{" "}
              <span>
                ·{" "}
                {formatCalendarDay(selected, {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </h3>
            <button
              type="button"
              className="today-shortcut"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              Today
            </button>
          </div>
          <div
            className="quick-agenda"
            aria-live="polite"
            aria-label="Selected day events"
          >
            {eventsUnavailable ? <p className="quick-agenda-empty">Case events are unavailable until complaint access is approved.</p> : selectedEvents.length ? (
              selectedEvents.map((event) => (
                <AgendaEvent key={event.id} event={event} />
              ))
            ) : (
              <p className="quick-agenda-empty">
                No events scheduled for this day.
              </p>
            )}
          </div>
          {!selectedEvents.length && comingUp.length > 0 && (
            <div className="quick-upcoming">
              <div className="quick-upcoming-title">Next on your calendar</div>
              {comingUp.map((event) => (
                <AgendaEvent key={event.id} event={event} showDate />
              ))}
            </div>
          )}
          {!eventsUnavailable&&<div className="quick-calendar-legend">
            <span>
              <i />
              Due / follow-up
            </span>
            <span>
              <i className="review" />
              Review
            </span>
          </div>}
        </>
      )}
      <Link
        className="btn full quick-calendar-open"
        href={`/calendar?date=${selected}`}
        prefetch={false}
      >
        <CalendarDays size={16} />
        Open Full Calendar
        <ArrowUpRight size={15} />
      </Link>
    </Card>
  );
}
function AgendaEvent({
  event,
  showDate = false,
}: {
  event: CalendarEvent;
  showDate?: boolean;
}) {
  return (
    <Link
      href={event.href}
      className={`quick-agenda-event ${event.type === "Bureau reviews" ? "review" : ""}`}
      title={`${event.title} · ${event.caseId} · ${event.source}`}
    >
      <strong>{event.title}</strong>
      <span>
        {showDate
          ? `${formatCalendarDay(event.key, { day: "numeric", month: "short" })} · `
          : ""}
        {event.type === "SLA deadlines" ? "SLA deadline" : event.type} ·{" "}
        {event.caseId}
      </span>
    </Link>
  );
}
