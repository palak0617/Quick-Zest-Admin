const { Order, Payment, Expense, Product } = require('../models');
const { getSettings, round2 } = require('./helpers');

function rangeMatch(from, to, field = 'date') {
  const m = {};
  if (from) m.$gte = from;
  if (to) m.$lte = to;
  return Object.keys(m).length ? { [field]: m } : {};
}

/**
 * All money numbers for a period, calculated automatically from the entries.
 *  - income        = confirmed payments received
 *  - expenses      = all spending entries
 *  - netProfit     = income − expenses           (cash in hand view)
 *  - sales         = value of non-cancelled orders
 *  - costOfGoods   = cost price × quantity of items sold
 *  - grossProfit   = sales − costOfGoods         (profit on products)
 *  - operatingProfit = grossProfit − expenses
 *  - balance       = opening balance + all income ever − all expenses ever
 */
async function financeSummary({ from, to } = {}) {
  const dm = rangeMatch(from, to);
  const [inc, exp, sales, allInc, allExp, dueAgg, settings] = await Promise.all([
    Payment.aggregate([{ $match: { ...dm, confirmed: true } }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Expense.aggregate([{ $match: dm }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...dm, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, sales: { $sum: '$total' }, cost: { $sum: '$costTotal' }, n: { $sum: 1 } } },
    ]),
    Payment.aggregate([{ $match: { confirmed: true } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $group: { _id: null, sum: { $sum: '$amount' } } }]),
    Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, due: { $sum: { $max: [0, { $subtract: ['$total', '$amountPaid'] }] } } } },
    ]),
    getSettings(),
  ]);
  const income = inc[0]?.sum || 0;
  const expenses = exp[0]?.sum || 0;
  const s = sales[0] || { sales: 0, cost: 0, n: 0 };
  const grossProfit = s.sales - s.cost;
  return {
    income: round2(income),
    paymentsCount: inc[0]?.n || 0,
    expenses: round2(expenses),
    expensesCount: exp[0]?.n || 0,
    netProfit: round2(income - expenses),
    sales: round2(s.sales),
    ordersCount: s.n,
    costOfGoods: round2(s.cost),
    grossProfit: round2(grossProfit),
    grossMargin: s.sales ? round2((grossProfit / s.sales) * 100) : 0,
    operatingProfit: round2(grossProfit - expenses),
    balance: round2((settings.openingBalance || 0) + (allInc[0]?.sum || 0) - (allExp[0]?.sum || 0)),
    openingBalance: settings.openingBalance || 0,
    receivable: round2(dueAgg[0]?.due || 0),
  };
}

/** Month-by-month income, expenses, sales and profit for the last N months. */
async function monthlySeries(months = 12) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - (months - 1));
  const tz = process.env.TZ || 'Asia/Kolkata';
  const key = { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz } };
  const [inc, exp, ord] = await Promise.all([
    Payment.aggregate([{ $match: { date: { $gte: start }, confirmed: true } }, { $group: { _id: key, v: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: { date: { $gte: start } } }, { $group: { _id: key, v: { $sum: '$amount' } } }]),
    Order.aggregate([
      { $match: { date: { $gte: start }, status: { $ne: 'cancelled' } } },
      { $group: { _id: key, sales: { $sum: '$total' }, cost: { $sum: '$costTotal' }, n: { $sum: 1 } } },
    ]),
  ]);
  const map = (arr) => new Map(arr.map((x) => [x._id, x]));
  const I = map(inc), E = map(exp), O = map(ord);
  const out = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const income = I.get(k)?.v || 0;
    const expenses = E.get(k)?.v || 0;
    const o = O.get(k) || { sales: 0, cost: 0, n: 0 };
    out.push({
      month: k,
      label: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      income: round2(income),
      expenses: round2(expenses),
      netProfit: round2(income - expenses),
      sales: round2(o.sales),
      grossProfit: round2(o.sales - o.cost),
      orders: o.n,
    });
  }
  return out;
}

async function topProducts({ from, to } = {}, limit = 5) {
  return Order.aggregate([
    { $match: { ...rangeMatch(from, to), status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $last: '$items.name' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
        profit: { $sum: { $multiply: ['$items.quantity', { $subtract: ['$items.price', '$items.cost'] }] } },
      },
    },
    { $sort: { quantity: -1 } },
    { $limit: limit },
  ]);
}

async function topCustomers({ from, to } = {}, limit = 5) {
  return Order.aggregate([
    { $match: { ...rangeMatch(from, to), status: { $ne: 'cancelled' } } },
    { $group: { _id: { $toLower: '$customerName' }, name: { $last: '$customerName' }, orders: { $sum: 1 }, value: { $sum: '$total' } } },
    { $sort: { value: -1 } },
    { $limit: limit },
  ]);
}

async function lowStock() {
  return Product.find({ active: true, $expr: { $lte: ['$quantity', '$reorderLevel'] } }).sort({ quantity: 1 }).lean();
}

module.exports = { financeSummary, monthlySeries, topProducts, topCustomers, lowStock };
