const router = require('express').Router();
const { Order, Product, Expense } = require('../models');
const { ah } = require('../utils/helpers');
const { financeSummary, monthlySeries, topProducts, topCustomers, lowStock } = require('../utils/finance');

function parseRange(q) {
  const from = q.from ? new Date(q.from) : undefined;
  let to;
  if (q.to) {
    to = new Date(q.to);
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

/** Everything the dashboard home page needs in one call */
router.get(
  '/dashboard',
  ah(async (req, res) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [allTime, thisMonth, today, months, low, recentOrders, products, statusCounts, topProds] = await Promise.all([
      financeSummary(),
      financeSummary({ from: monthStart }),
      financeSummary({ from: todayStart }),
      monthlySeries(6),
      lowStock(),
      Order.find().sort({ date: -1, createdAt: -1 }).limit(6).lean(),
      Product.find({ active: true }).select('quantity costPrice sellingPrice').lean(),
      Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      topProducts({ from: monthStart }),
    ]);
    const inventory = products.reduce(
      (s, p) => ((s.units += p.quantity), (s.value += p.quantity * p.costPrice), s),
      { products: products.length, units: 0, value: 0 }
    );
    res.json({
      allTime,
      thisMonth,
      today,
      months,
      lowStock: low,
      recentOrders,
      inventory,
      orderStatus: Object.fromEntries(statusCounts.map((s) => [s._id, s.n])),
      topProducts: topProds,
    });
  })
);

/** Profit & loss for any date range */
router.get(
  '/summary',
  ah(async (req, res) => {
    const range = parseRange(req.query);
    const [summary, products, customers, byCategory] = await Promise.all([
      financeSummary(range),
      topProducts(range, 10),
      topCustomers(range, 10),
      Expense.aggregate([
        { $match: range.from || range.to ? { date: { ...(range.from && { $gte: range.from }), ...(range.to && { $lte: range.to }) } } : {} },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } },
        { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'c' } },
        { $project: { amount: 1, name: { $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, 'Uncategorised'] }, color: { $arrayElemAt: ['$c.color', 0] } } },
        { $sort: { amount: -1 } },
      ]),
    ]);
    res.json({ summary, topProducts: products, topCustomers: customers, expensesByCategory: byCategory });
  })
);

router.get(
  '/monthly',
  ah(async (req, res) => {
    res.json({ months: await monthlySeries(Math.min(36, Number(req.query.months) || 12)) });
  })
);

module.exports = router;
