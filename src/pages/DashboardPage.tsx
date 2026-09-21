import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReminders } from '../hooks/useReminders';
import { useOnline } from '../hooks/useOnline';
import { loadReminders, removed, upserted, useAppDispatch } from '../store';
import { reminderService } from '../services/reminders';
import { friendlyError } from '../lib/errors';
import { ReminderCard } from '../features/reminders/ReminderCard';
import { NotificationCard } from '../features/notifications/NotificationCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Notice } from '../components/Field';
import { Icon } from '../components/Icon';
import type { Reminder } from '../types/models';

type Filter = 'all' | 'active' | 'paused';
export function DashboardPage() {
  const { items, loading, loaded, error } = useReminders();
  const online = useOnline();
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function toggle(reminder: Reminder) {
    if (!online) {
      setActionError('Connect to the internet to change this reminder.');
      return;
    }
    setBusyId(reminder.id);
    setActionError(null);
    try {
      dispatch(
        upserted(
          await reminderService.status(
            reminder.id,
            reminder.status === 'paused' ? 'active' : 'paused',
          ),
        ),
      );
    } catch (failure) {
      setActionError(friendlyError(failure));
    } finally {
      setBusyId(null);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusyId(deleting.id);
    setDeleteError(null);
    try {
      await reminderService.remove(deleting.id);
      dispatch(removed(deleting.id));
      setDeleting(null);
    } catch (failure) {
      setDeleteError(friendlyError(failure));
    } finally {
      setBusyId(null);
    }
  }
  const active = items.filter((item) => item.status === 'active' && item.next_occurrence_at);
  const next = active.reduce<string | null>(
    (earliest, item) =>
      !earliest || item.next_occurrence_at! < earliest ? item.next_occurrence_at : earliest,
    null,
  );
  const visible = items.filter((item) => filter === 'all' || item.status === filter);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A CLEARER HEAD STARTS HERE</span>
          <h1>
            Your reminders<span className="heading-dot">.</span>
          </h1>
          <p>The little things, taken care of.</p>
        </div>
        <Link to="/reminders/new" className="button primary">
          <Icon name="plus" />
          Add Reminder
        </Link>
      </div>
      <NotificationCard />
      <div className="stats-grid">
        <div className="stat">
          <span className="stat-icon">
            <Icon name="bell" />
          </span>
          <div>
            <span>Total reminders</span>
            <strong>
              {loaded ? items.length : '—'}
              <small>things off your mind</small>
            </strong>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <Icon name="check" />
          </span>
          <div>
            <span>Active reminders</span>
            <strong>
              {loaded ? active.length : '—'}
              <small>keeping you on track</small>
            </strong>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <Icon name="clock" />
          </span>
          <div>
            <span>Next up</span>
            <strong className="next-stat">
              {next
                ? new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(next))
                : 'All clear'}
              <small>one less thing to remember</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="filter-tabs" aria-label="Filter reminders">
          {(['all', 'active', 'paused'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={filter === value ? 'selected' : ''}
              aria-pressed={filter === value}
            >
              {value === 'all' ? 'All reminders' : value === 'active' ? 'Active' : 'Paused'}
              <span>
                {value === 'all'
                  ? items.length
                  : items.filter((item) => item.status === value).length}
              </span>
            </button>
          ))}
        </div>
        <button
          className="text-button refresh-button"
          onClick={() => void dispatch(loadReminders())}
          disabled={loading || !online}
        >
          <Icon name="repeat" size={15} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {(error || actionError) && <Notice>{error || actionError}</Notice>}
      {loading && !loaded ? (
        <div className="loading-state" role="status">
          <span className="spinner" />
          Gathering your reminders…
        </div>
      ) : visible.length ? (
        <div className="reminders-grid">
          {visible.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              busy={busyId === reminder.id || !online}
              onToggle={() => void toggle(reminder)}
              onDelete={() => {
                setDeleteError(null);
                setDeleting(reminder);
              }}
            />
          ))}
          <Link to="/reminders/new" className="add-card">
            <span>
              <Icon name="plus" size={25} />
            </span>
            <strong>A little less to remember</strong>
            <p>Add a new reminder</p>
          </Link>
        </div>
      ) : (
        !error && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="bell" size={34} />
            </span>
            <h2>{filter === 'all' ? 'Make room in your mind' : `No ${filter} reminders`}</h2>
            <p>
              {filter === 'all'
                ? 'From watering the plants to your annual checkup, give the little things a place to live.'
                : 'Your reminders will appear here when their status matches.'}
            </p>
            <Link to="/reminders/new" className="button primary">
              <Icon name="plus" />
              Add your first reminder
            </Link>
            <span className="empty-caption">Set it once. We’ll take it from here.</span>
          </div>
        )
      )}
      {deleting && (
        <ConfirmDialog
          title={deleting.title}
          busy={busyId === deleting.id}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}
