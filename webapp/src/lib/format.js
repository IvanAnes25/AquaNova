export const money = (amount) => `₱${Number(amount).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const stockLabel = (stock) => {
  if (stock === 0) return '! Sold out';
  if (stock <= 5) return 'Low stock';
  return 'In stock';
};

export const initials = (name) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
