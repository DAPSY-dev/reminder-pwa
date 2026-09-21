import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field, Notice } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { validateReminder } from '../../lib/validation';
import { nextOccurrence, recurrenceSummary } from '../../lib/recurrence';
import { friendlyError } from '../../lib/errors';
import { reminderService } from '../../services/reminders';
import { upserted, useAppDispatch, useAppSelector } from '../../store';
import { useOnline } from '../../hooks/useOnline';
import type { Reminder, ReminderInput, RecurrenceUnit } from '../../types/models';

function initialValue(reminder?: Reminder): ReminderInput {
  if (reminder)
    return {
      title: reminder.title,
      details: reminder.details,
      start_date: reminder.start_date,
      time_of_day: reminder.time_of_day.slice(0, 5),
      timezone: reminder.timezone,
      recurrence_interval: reminder.recurrence_interval,
      recurrence_unit: reminder.recurrence_unit,
      recurrence_end_type: reminder.recurrence_end_type,
      recurrence_end_date: reminder.recurrence_end_date,
      snooze_duration_minutes: reminder.snooze_duration_minutes,
    };
  const date = new Date();
  return {
    title: '',
    details: '',
    start_date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    time_of_day: '09:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    recurrence_interval: 1,
    recurrence_unit: 'day',
    recurrence_end_type: 'never',
    recurrence_end_date: null,
    snooze_duration_minutes: 10,
  };
}
export function ReminderForm({ reminder }: { reminder?: Reminder }) {
  const [value, setValue] = useState<ReminderInput>(() => initialValue(reminder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const online = useOnline();
  function update<K extends keyof ReminderInput>(key: K, input: ReminderInput[K]) {
    setValue((previous) => ({ ...previous, [key]: input }));
  }
  const invalid = validateReminder(value);
  let preview: string | null = null;
  if (!invalid) {
    try {
      preview = nextOccurrence(value);
    } catch {
      preview = null;
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!user || !online) {
      setError('Connect to the internet to save your reminder.');
      return;
    }
    setBusy(true);
    try {
      dispatch(
        upserted(
          await reminderService.save(
            {
              ...value,
              title: value.title.trim(),
              details: value.details.trim(),
              recurrence_end_date:
                value.recurrence_end_type === 'never' ? null : value.recurrence_end_date,
            },
            user.id,
            reminder?.id,
          ),
        ),
      );
      navigate('/');
    } catch (failure) {
      setError(friendlyError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-layout">
      <form className="reminder-form panel" onSubmit={(event) => void submit(event)}>
        {error && <Notice>{error}</Notice>}
        <section className="form-section">
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>The little thing to remember</h2>
              <p>Give your reminder a name that feels clear to you.</p>
            </div>
          </div>
          <Field
            label="Title"
            placeholder="e.g. Water the plants"
            required
            maxLength={120}
            value={value.title}
            onChange={(event) => update('title', event.target.value)}
          />
          <div className="field">
            <label htmlFor="details">
              Details <span className="optional">optional</span>
            </label>
            <textarea
              id="details"
              rows={3}
              maxLength={2000}
              placeholder="Anything else you’d like to remember?"
              value={value.details}
              onChange={(event) => update('details', event.target.value)}
            />
          </div>
        </section>
        <section className="form-section">
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2>Find the right moment</h2>
              <p>Choose when it starts and how often it comes around.</p>
            </div>
          </div>
          <div className="field-row">
            <Field
              label="Start date"
              type="date"
              required
              value={value.start_date}
              onChange={(event) => update('start_date', event.target.value)}
            />
            <Field
              label="Time"
              type="time"
              required
              value={value.time_of_day}
              onChange={(event) => update('time_of_day', event.target.value)}
            />
          </div>
          <Field
            label="Time zone"
            required
            value={value.timezone}
            onChange={(event) => update('timezone', event.target.value)}
            list="timezones"
            hint="Reminders follow this local time, including daylight-saving changes."
          />
          <datalist id="timezones">
            {Array.from(new Set([value.timezone, ...Intl.supportedValuesOf('timeZone')])).map(
              (zone) => (
                <option key={zone} value={zone} />
              ),
            )}
          </datalist>
          <div className="field">
            <label htmlFor="interval">Repeat</label>
            <div className="repeat-input">
              <span>Every</span>
              <input
                id="interval"
                type="number"
                min={1}
                max={1000}
                required
                value={value.recurrence_interval || ''}
                onChange={(event) => update('recurrence_interval', Number(event.target.value))}
                aria-label="Recurrence interval"
              />
              <select
                aria-label="Recurrence unit"
                value={value.recurrence_unit}
                onChange={(event) =>
                  update('recurrence_unit', event.target.value as RecurrenceUnit)
                }
              >
                {(['day', 'week', 'month', 'year'] as const).map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                    {value.recurrence_interval === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="end-options">
            <legend>Ends</legend>
            <label>
              <input
                type="radio"
                name="end"
                checked={value.recurrence_end_type === 'never'}
                onChange={() => update('recurrence_end_type', 'never')}
              />
              Never
            </label>
            <label>
              <input
                type="radio"
                name="end"
                checked={value.recurrence_end_type === 'date'}
                onChange={() => update('recurrence_end_type', 'date')}
              />
              On a date
            </label>
          </fieldset>
          {value.recurrence_end_type === 'date' && (
            <Field
              label="End date"
              type="date"
              min={value.start_date}
              required
              value={value.recurrence_end_date ?? ''}
              onChange={(event) => update('recurrence_end_date', event.target.value)}
            />
          )}
        </section>
        <section className="form-section">
          <div className="section-heading">
            <span>03</span>
            <div>
              <h2>A little breathing room</h2>
              <p>Not quite ready? Snooze this occurrence for a few minutes.</p>
            </div>
          </div>
          <Field
            label="Snooze duration (minutes)"
            type="number"
            min={1}
            max={10080}
            required
            value={value.snooze_duration_minutes || ''}
            onChange={(event) => update('snooze_duration_minutes', Number(event.target.value))}
            hint="Snoozing won’t change your regular reminder schedule."
          />
        </section>
        <div className="form-actions">
          <Link to="/" className="button secondary">
            Cancel
          </Link>
          <button className="button primary" type="submit" disabled={busy || !online}>
            {busy ? 'Saving…' : reminder ? 'Save changes' : 'Create reminder'}
            <Icon name="check" size={18} />
          </button>
        </div>
      </form>
      <aside className="schedule-preview panel">
        <span className="preview-icon">
          <Icon name="bell" size={26} />
        </span>
        <span className="eyebrow">YOUR REMINDER, AT A GLANCE</span>
        <h3>{value.title.trim() || 'Something to remember'}</h3>
        <p>{recurrenceSummary(value)}</p>
        <div className="preview-date">
          <Icon name="calendar" size={18} />
          <div>
            <span>Next occurrence</span>
            <strong>
              {preview
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: value.timezone,
                  }).format(new Date(preview))
                : invalid
                  ? 'Fill in your schedule'
                  : 'No future occurrences'}
            </strong>
          </div>
        </div>
        {reminder?.status === 'paused' && (
          <p className="preview-note">This reminder stays paused until you resume it.</p>
        )}
        <p className="preview-note">
          Set it once. We’ll keep the rhythm.
          <br />
          You can edit or pause it whenever you need.
        </p>
      </aside>
    </div>
  );
}
