import { Link } from 'react-router-dom';
import type { Reminder } from '../../types/models';
import { recurrenceSummary } from '../../lib/recurrence';
import { Icon } from '../../components/Icon';

export function ReminderCard({
  reminder,
  busy,
  onToggle,
  onDelete,
}: {
  reminder: Reminder;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const paused = reminder.status === 'paused';
  const next = reminder.next_occurrence_at ? new Date(reminder.next_occurrence_at) : null;
  const date = next
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: reminder.timezone,
      }).format(next)
    : null;
  const time = next
    ? new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: reminder.timezone,
      }).format(next)
    : new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      }).format(new Date(`2000-01-01T${reminder.time_of_day}Z`));
  return (
    <article className={`reminder-card ${paused ? 'paused' : ''}`}>
      <div className="card-top">
        <span className="card-symbol">
          <Icon name={paused ? 'pause' : 'bell'} size={21} />
        </span>
        <span className={`status-badge ${paused ? 'paused' : !next ? 'ended' : ''}`}>
          <span />
          {paused ? 'Paused' : next ? 'Active' : 'Ended'}
        </span>
      </div>
      <h3>{reminder.title}</h3>
      <p className="card-details">{reminder.details || 'A little reminder, just for you.'}</p>
      <div className="next-occurrence">
        <span>{paused ? 'SCHEDULED TIME' : next ? 'NEXT REMINDER' : 'SCHEDULE COMPLETE'}</span>
        <strong>
          {date && !paused && (
            <>
              {date}
              <span className="time-divider">·</span>
            </>
          )}
          {time}
        </strong>
      </div>
      <div className="recurrence-line">
        <Icon name="repeat" size={15} />
        <span>{recurrenceSummary(reminder)}</span>
        <span className="timezone-label" title={reminder.timezone}>
          {reminder.timezone.split('/').pop()?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="card-actions">
        <Link to={`/reminders/${reminder.id}/edit`}>
          <Icon name="edit" size={16} />
          Edit
        </Link>
        <button onClick={onToggle} disabled={busy}>
          <Icon name={paused ? 'play' : 'pause'} size={16} />
          {busy ? 'Saving…' : paused ? 'Resume' : 'Pause'}
        </button>
        <button
          className="delete-button"
          onClick={onDelete}
          aria-label={`Delete ${reminder.title}`}
          disabled={busy}
        >
          <Icon name="trash" size={17} />
        </button>
      </div>
    </article>
  );
}
