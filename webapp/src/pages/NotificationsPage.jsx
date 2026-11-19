import { useState } from 'react';
import { Button, EmptyState, SectionTitle, SkeletonList } from '../components/UI.jsx';

function relativeTime(value) {
  const timestamp = typeof value === 'string' && !/[zZ]|[+-]\d\d:\d\d$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return String(value || '');
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, 'second');
}

function statusLabel(status) {
  return status ? status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
}

function notificationGroups(notifications) {
  const groups = new Map();
  for (const notification of notifications || []) {
    const key = notification.order_id == null ? 'other' : `order:${notification.order_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        orderId: notification.order_id == null ? null : Number(notification.order_id),
        orderNumber: notification.order_number,
        orderStatus: notification.order_status,
        messages: [],
      });
    }
    groups.get(key).messages.push(notification);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    messages: group.messages.sort((left, right) => (
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        || Number(left.id) - Number(right.id)
    )),
  }));
}

export default function NotificationsPage({
  notifications,
  pagination,
  unreadCount,
  page = 1,
  onPage,
  onRead,
  onReadGroup,
  onReadAll,
  onDelete,
  onDeleteGroup,
  onDeleteAll,
  loading = false,
}) {
  const [openGroups, setOpenGroups] = useState({});
  const groups = notificationGroups(notifications);
  const unread = (notifications || []).filter((notification) => !notification.read_at).length;
  const allUnread = Number.isFinite(Number(unreadCount)) ? Number(unreadCount) : unread;
  const hasReadMessages = Number(pagination?.total || 0) > allUnread;
  const pageCount = Math.max(1, Number(pagination?.pages) || 0);

  function toggleGroup(group) {
    const opening = !openGroups[group.key];
    setOpenGroups((current) => ({ ...current, [group.key]: opening }));
    if (opening) onReadGroup(group.orderId);
  }

  return <>
    <SectionTitle
      eyebrow="ORDER UPDATES"
      title="Notifications"
      action={<div className="notification-actions">
        {allUnread > 0 && <Button variant="secondary" onClick={onReadAll}>Mark all as read</Button>}
        {hasReadMessages && <Button variant="secondary" onClick={onDeleteAll}>Delete all read</Button>}
      </div>}
    />
    <section className="panel notification-list">
      {loading || notifications == null ? <SkeletonList count={3} /> : groups.length ? <div className="notification-groups">
        {groups.map((group) => {
          const groupUnread = group.messages.filter((notification) => !notification.read_at).length;
          const preview = openGroups[group.key]
            ? null
            : group.messages.find((notification) => !notification.read_at);
          const heading = group.orderId === null
            ? 'Other'
            : `Order ${group.orderNumber || `#${group.orderId}`}${group.orderStatus ? ` · ${statusLabel(group.orderStatus)}` : ''}`;
          return <article className="notification-group" key={group.key}>
            <div className="notification-group-heading">
              <button
                type="button"
                className="notification-group-toggle"
                aria-expanded={Boolean(openGroups[group.key])}
                onClick={() => toggleGroup(group)}
              >
                <span><b>{heading}</b><small>{group.messages.length} messages · {groupUnread} unread</small></span>
                <span aria-hidden="true">{openGroups[group.key] ? '−' : '+'}</span>
              </button>
              {group.messages.some((notification) => notification.read_at)
                && <Button variant="secondary" onClick={() => onDeleteGroup(group.orderId)}>Delete read</Button>}
            </div>
            {preview && <article className="notification-row notification-unread notification-group-preview">
              <div><b>{preview.title}</b><p>{preview.body}</p><time dateTime={preview.created_at}>{relativeTime(preview.created_at)}</time></div>
              <Button variant="secondary" aria-label="Mark read" onClick={() => onRead(preview.id)}>Mark read</Button>
            </article>}
            {openGroups[group.key] && <div className="notification-timeline">
              {group.messages.map((notification) => <article
                className={`notification-row ${notification.read_at ? '' : 'notification-unread'}`}
                key={notification.id}
              >
                <div>
                  <b>{notification.title}</b>
                  <p>{notification.body}</p>
                  <time dateTime={notification.created_at} title={notification.created_at}>
                    {relativeTime(notification.created_at)}
                  </time>
                </div>
                <div className="notification-message-actions">
                  {!notification.read_at && <Button variant="secondary" aria-label="Mark read" onClick={() => onRead(notification.id)}>Mark read</Button>}
                  {notification.read_at && <Button variant="secondary" aria-label="Delete notification" onClick={() => onDelete(notification.id)}>Delete</Button>}
                </div>
              </article>)}
            </div>}
          </article>;
        })}
      </div> : <EmptyState title="No notifications yet" text="Updates about your orders will appear here." />}
      {!loading && pagination && pagination.total > 0 && <nav className="notification-pagination" aria-label="Notification pages">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span>Page {page} of {pageCount}</span>
        <Button variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button>
      </nav>}
    </section>
  </>;
}
