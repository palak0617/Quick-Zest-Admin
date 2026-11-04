export const inr = (n, digits = 0) => {
  const v = Number(n || 0);
  return (v < 0 ? '−₹' : '₹') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: 2 });
};

export const num = (n) => Number(n || 0).toLocaleString('en-IN');

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** yyyy-mm-dd for <input type="date"> in local time */
export const toInputDate = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const monthStart = () => {
  const d = new Date();
  return toInputDate(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const METHODS = ['upi', 'cash', 'bank', 'card', 'cheque', 'other'];
export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
