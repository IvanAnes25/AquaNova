import { Button, EmptyState, SectionTitle } from '../components/UI.jsx';

export default function NotificationsPage({ notifications, onRead, onReadAll }) {
  const unread = notifications.some((notification) => !notification.read_at);
  return <>
    <SectionTitle eyebrow="ORDER UPDATES" title="Notifications" action={unread ? <Button variant="secondary" onClick={onReadAll}>Mark all as read</Button> : null} />
    <section className="panel notification-list">
      {notifications.length ? notifications.map((notification) => <article className={`notification-row ${notification.read_at ? '' : 'notification-unread'}`} key={notification.id}>
        <div><b>{notification.title}</b><p>{notification.body}</p><small>{notification.created_at}</small></div>
        {!notification.read_at && <button className="text-button" onClick={() => onRead(notification.id)}>Mark read</button>}
      </article>) : <EmptyState title="No notifications yet" text="Updates about your orders will appear here." />}
    </section>
  </>;
}
