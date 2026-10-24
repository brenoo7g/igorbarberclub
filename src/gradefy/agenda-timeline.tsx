import type { CSSProperties } from 'react';
import { ArrowRight, Clock3, LockKeyhole, UserRound } from 'lucide-react';
import { money, statusLabels } from '../lib';
import type { AgendaState } from './agenda-types';

type AppointmentEvent = {
  kind: 'appointment';
  key: string;
  start: number;
  end: number;
  item: AgendaState['items'][number];
};
type BlockEvent = {
  kind: 'block';
  key: string;
  start: number;
  end: number;
  item: AgendaState['blocks'][number];
};
type BreakEvent = {
  kind: 'break';
  key: string;
  start: number;
  end: number;
  item: AgendaState['recurringBreaks'][number];
};
type TimelineEvent = AppointmentEvent | BlockEvent | BreakEvent;
type PositionedEvent = TimelineEvent & { lane: number; lanes: number };
const pixelsPerMinute = 1.1;
const minimumVisibleMinutes = 40;

function minutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toLocaleUpperCase('pt-BR');
}

export function layoutAgendaEvents(events: TimelineEvent[]) {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const groups: TimelineEvent[][] = [];
  let group: TimelineEvent[] = [];
  let groupEnd = -1;
  for (const event of sorted) {
    if (group.length && event.start >= groupEnd) {
      groups.push(group);
      group = [];
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, event.end, event.start + minimumVisibleMinutes);
  }
  if (group.length) groups.push(group);
  const positioned: PositionedEvent[] = [];
  for (const entries of groups) {
    const laneEnds: number[] = [];
    const placements = entries.map((entry) => {
      let lane = laneEnds.findIndex((end) => end <= entry.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = Math.max(entry.end, entry.start + minimumVisibleMinutes);
      return { ...entry, lane };
    });
    positioned.push(...placements.map((entry) => ({ ...entry, lanes: laneEnds.length })));
  }
  const first = Math.min(...sorted.map((event) => event.start));
  const last = Math.max(...sorted.map((event) => event.end));
  const from = Math.max(0, Math.floor(first / 60) * 60 - 60);
  const to = Math.min(1440, Math.ceil(last / 60) * 60 + 60);
  return {
    events: positioned,
    from,
    to,
    height: Math.max(200, (to - from) * pixelsPerMinute + 30),
  };
}

export function AgendaTimeline({
  day,
  data,
  open,
}: {
  day: string;
  data: AgendaState;
  open: (id: string) => void;
}) {
  const events: TimelineEvent[] = [
    ...data.items
      .filter((item) => item.date === day)
      .map((item): AppointmentEvent => {
        const start = minutes(item.time);
        return { kind: 'appointment', key: item.id, start, end: start + item.duration, item };
      }),
    ...(data.blocks || [])
      .filter((item) => item.date === day)
      .map((item): BlockEvent => ({
        kind: 'block',
        key: item.id,
        start: item.startMinute,
        end: item.endMinute,
        item,
      })),
    ...(data.recurringBreaks || [])
      .filter((item) => item.date === day)
      .map((item): BreakEvent => ({
        kind: 'break',
        key: `${item.barberId}-${item.startMinute}-${item.endMinute}`,
        start: item.startMinute,
        end: item.endMinute,
        item,
      })),
  ];
  const timeline = layoutAgendaEvents(events);
  const hours = Array.from(
    { length: Math.floor((timeline.to - timeline.from) / 60) + 1 },
    (_, index) => timeline.from + index * 60,
  );
  return (
    <div className="gf-agenda-timeline-scroll">
      <div
        className="gf-agenda-timeline"
        style={{ '--timeline-height': `${timeline.height}px` } as CSSProperties}
      >
        <div className="gf-agenda-hour-guides" aria-hidden="true">
          {hours.map((hour) => (
            <span
              key={hour}
              style={
                {
                  '--event-top': `${(hour - timeline.from) * pixelsPerMinute + 10}px`,
                } as CSSProperties
              }
            >
              <time>{clock(hour)}</time>
            </span>
          ))}
        </div>
        <div className="gf-agenda-track">
          {timeline.events.map((event) => {
            const style = {
              '--event-top': `${(event.start - timeline.from) * pixelsPerMinute + 10}px`,
              '--event-height': `${Math.max(44, (event.end - event.start) * pixelsPerMinute)}px`,
              '--event-left': `calc(${(event.lane / event.lanes) * 100}% + 3px)`,
              '--event-width': `calc(${100 / event.lanes}% - 6px)`,
            } as CSSProperties;
            if (event.kind === 'appointment') {
              const item = event.item;
              return (
                <button
                  type="button"
                  key={'appointment-' + event.key}
                  style={style}
                  className={`gf-agenda-row gf-agenda-timeline-event gf-agenda-event-${item.status}${event.lanes > 1 ? ' gf-agenda-event-compact' : ''}`}
                  aria-label={'Ver atendimento de ' + item.clientName + ' às ' + item.time}
                  onClick={() => open(item.id)}
                >
                  <time dateTime={item.date + 'T' + item.time}>
                    {item.time}
                    <small>{clock(event.end)}</small>
                  </time>
                  <span className="gf-agenda-client" data-initials={initials(item.clientName)}>
                    <strong>{item.clientName}</strong>
                    <span>{item.services.map((service) => service.name).join(' + ')}</span>
                    <small>
                      <Clock3 size={12} /> {item.duration} min · {money(item.totalCents)}
                    </small>
                  </span>
                  <span
                    className="gf-agenda-professional"
                    data-initials={initials(item.professionalName)}
                  >
                    <UserRound size={13} /> {item.professionalName}
                  </span>
                  <span className={'gf-appointment-status gf-status-' + item.status}>
                    <i /> {statusLabels[item.status]}
                  </span>
                  <ArrowRight className="gf-agenda-event-arrow" size={16} aria-hidden="true" />
                </button>
              );
            }
            return (
              <div
                key={event.kind + '-' + event.key}
                style={style}
                className={`gf-agenda-block-row gf-agenda-timeline-event${event.kind === 'break' ? ' gf-agenda-recurring-break' : ''}`}
              >
                <time>{clock(event.start)}</time>
                <span>
                  {event.kind === 'break' ? <Clock3 size={17} /> : <LockKeyhole size={17} />}
                  <strong>
                    {event.kind === 'break' ? 'Intervalo recorrente' : event.item.reason}
                  </strong>
                  <small>
                    {event.item.professionalName} · até {clock(event.end)}
                  </small>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
