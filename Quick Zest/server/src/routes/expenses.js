const router = require('express').Router();
const { Expense, ExpenseCategory } = require('../models');
const { ah, HttpError, dateRange, escapeRegex, pick } = require('../utils/helpers');

const FIELDS = ['title', 'category', 'amount', 'date', 'paidTo', 'method', 'notes'];

/* ---------- Categories (admin-managed) ---------- */
router.get(
  '/categories',
  ah(async (req, res) => {
    const categories = await ExpenseCategory.find().sort({ name: 1 }).lean();
    const totals = await Expense.aggregate([{ $group: { _id: '$category', amount: { $sum: '$amount' } } }]);
    const byId = new Map(totals.map((t) => [String(t._id), t.amount]));
    res.json({ categories: categories.map((c) => ({ ...c, total: byId.get(String(c._id)) || 0 })) });
  })
);
router.post(
  '/categories',
  ah(async (req, res) => {
    if (!req.body.name?.trim()) throw new HttpError(400, 'Name is required');
    res.status(201).json({ category: await ExpenseCategory.create(pick(req.body, ['name', 'color'])) });
  })
);
router.put(
  '/categories/:id',
  ah(async (req, res) => {
    res.json({ category: await ExpenseCategory.findByIdAndUpdate(req.params.id, pick(req.body, ['name', 'color']), { new: true }) });
  })
);
router.delete(
  '/categories/:id',
  ah(async (req, res) => {
    await Expense.updateMany({ category: req.params.id }, { $unset: { category: 1 } });
    await ExpenseCategory.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

/* ---------- Expenses ---------- */
router.get(
  '/',
  ah(async (req, res) => {
    const q = { ...dateRange(req.query) };
    if (req.query.category) q.category = req.query.category;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      q.$or = [{ title: rx }, { paidTo: rx }, { notes: rx }];
    }
    const expenses = await Expense.find(q).populate('category', 'name color').sort({ date: -1, createdAt: -1 }).limit(500).lean();
    const byCategory = {};
    let total = 0;
    for (const e of expenses) {
      total += e.amount;
      const key = e.category?.name || 'Uncategorised';
      byCategory[key] = (byCategory[key] || 0) + e.amount;
    }
    res.json({ expenses, summary: { total, count: expenses.length, byCategory } });
  })
);

router.post(
  '/',
  ah(async (req, res) => {
    const data = pick(req.body, FIELDS);
    data.amount = Number(data.amount);
    if (!data.title) throw new HttpError(400, 'Title is required');
    if (!(data.amount > 0)) throw new HttpError(400, 'Enter an amount greater than 0');
    if (!data.category) delete data.category;
    const expense = await Expense.create(data);
    res.status(201).json({ expense: await expense.populate('category', 'name color') });
  })
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const data = pick(req.body, FIELDS);
    if (data.amount !== undefined && !(Number(data.amount) > 0)) throw new HttpError(400, 'Enter an amount greater than 0');
    const update = { $set: data };
    if (data.category === '' || data.category === null) {
      delete data.category;
      update.$unset = { category: 1 };
    }
    const expense = await Expense.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).populate('category', 'name color');
    if (!expense) throw new HttpError(404, 'Expense not found');
    res.json({ expense });
  })
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
