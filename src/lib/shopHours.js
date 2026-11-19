const DAYS = [
  ['monday', 'Monday'],
  ['tuesday', 'Tuesday'],
  ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'],
  ['friday', 'Friday'],
  ['saturday', 'Saturday'],
  ['sunday', 'Sunday'],
];

function formatTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function shopHoursRows(shopHours) {
  if (!shopHours) return null;
  return DAYS.map(([key, day]) => {
    const hours = shopHours[key];
    return [
      day,
      hours.closed ? 'Closed' : `${formatTime(hours.open)}–${formatTime(hours.close)}`,
    ];
  });
}
