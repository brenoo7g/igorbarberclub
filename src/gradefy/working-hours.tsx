import type { WorkingDay } from '../types';
import { Button, Input } from './components';
export const weekdays = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const initialDays = (): WorkingDay[] =>
  weekdays.map((_, weekday) => ({
    weekday,
    active: weekday > 0 && weekday < 6,
    start_time: '09:00',
    end_time: '20:00',
    breaks: [],
  }));
export function WorkingHours({
  days,
  onChange,
  disabled = false,
}: {
  days: WorkingDay[] | null;
  onChange: (days: WorkingDay[] | null) => void;
  disabled?: boolean;
}) {
  const patch = (index: number, value: Partial<WorkingDay>) =>
    onChange(days!.map((day, i) => (i === index ? { ...day, ...value } : day)));
  return (
    <div className="gf-mini-hours">
      <label className="gf-check">
        <input
          type="checkbox"
          checked={days !== null}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? initialDays() : null)}
        />
        Definir horários comerciais
      </label>
      {days === null ? (
        <p className="gf-mini-muted">
          Nenhum horário comercial definido. O site orientará o cliente a consultar a agenda.
        </p>
      ) : (
        days.map((day, index) => (
          <div key={day.weekday} className="gf-mini-day">
            <label className="gf-check">
              <input
                type="checkbox"
                checked={day.active}
                disabled={disabled}
                onChange={(e) => patch(index, { active: e.target.checked })}
              />
              {weekdays[day.weekday]}
              {!day.active && <span>Fechado</span>}
            </label>
            {day.active && (
              <>
                <div className="gf-field-pair">
                  <Input
                    type="time"
                    label={`Abertura — ${weekdays[day.weekday]}`}
                    required
                    disabled={disabled}
                    value={day.start_time}
                    onChange={(e) => patch(index, { start_time: e.target.value })}
                  />
                  <Input
                    type="time"
                    label={`Encerramento — ${weekdays[day.weekday]}`}
                    required
                    disabled={disabled}
                    value={day.end_time}
                    onChange={(e) => patch(index, { end_time: e.target.value })}
                  />
                </div>
                {day.breaks.map((pause, at) => (
                  <div key={at} className="gf-mini-pause">
                    <Input
                      type="time"
                      label={`Início da pausa ${at + 1} — ${weekdays[day.weekday]}`}
                      value={pause.start_time}
                      required
                      disabled={disabled}
                      onChange={(e) =>
                        patch(index, {
                          breaks: day.breaks.map((p, i) =>
                            i === at ? { ...p, start_time: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    <Input
                      type="time"
                      label={`Fim da pausa ${at + 1} — ${weekdays[day.weekday]}`}
                      value={pause.end_time}
                      required
                      disabled={disabled}
                      onChange={(e) =>
                        patch(index, {
                          breaks: day.breaks.map((p, i) =>
                            i === at ? { ...p, end_time: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      aria-label={`Remover pausa ${at + 1} — ${weekdays[day.weekday]}`}
                      onClick={() =>
                        patch(index, { breaks: day.breaks.filter((_, i) => i !== at) })
                      }
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || day.breaks.length >= 4}
                  onClick={() =>
                    patch(index, {
                      breaks: [...day.breaks, { start_time: '12:00', end_time: '13:00' }],
                    })
                  }
                >
                  Adicionar pausa — {weekdays[day.weekday]}
                </Button>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}
