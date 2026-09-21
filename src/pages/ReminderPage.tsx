import { Link, useParams } from 'react-router-dom';
import { ReminderForm } from '../features/reminders/ReminderForm';
import { useReminders } from '../hooks/useReminders';
import { Icon } from '../components/Icon';
import { Notice } from '../components/Field';

export function ReminderPage() {
  const { id } = useParams();
  const { items, loading, loaded, error } = useReminders();
  const reminder = items.find((item) => item.id === id);
  if (id && !loaded && loading) return <p role="status">Loading your reminder…</p>;
  if (id && error) return <Notice>{error}</Notice>;
  if (id && loaded && !reminder)
    return (
      <div className="empty-state">
        <h1>Reminder not found</h1>
        <p>It may have been deleted or belong to another account.</p>
        <Link className="button primary" to="/">
          Back to reminders
        </Link>
      </div>
    );
  if (id && !reminder) return <p role="status">Loading your reminder…</p>;
  return (
    <>
      <Link to="/" className="back-link">
        <Icon name="arrow" size={17} />
        All reminders
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE LESS THING ON YOUR MIND</span>
          <h1>
            {id ? 'Edit reminder' : 'A new reminder'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {id
              ? 'Adjust the details. We’ll take it from here.'
              : 'Set the rhythm, then get on with your day.'}
          </p>
        </div>
      </div>
      <ReminderForm key={id ?? 'new'} reminder={reminder} />
    </>
  );
}
