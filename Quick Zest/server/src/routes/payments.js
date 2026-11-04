const router = require('express').Router();
const mongoose = require('mongoose');
const { Payment, Order, Receiver } = require('../models');
const { ah, HttpError, dateRange, escapeRegex, pick } = require('../utils/helpers');

const FIELDS = ['amount', 'date', 'method', 'reference', 'receivedBy', 'confirmed', 'notes', 'customerName'];

/** Recompute an order's paid amount from its confirmed payments. */
async function syncOrder(orderId) {
  if (!orderId) return;
  const order = await Order.findById(orderId);
  if (!order) return;
  const [agg] = await Payment.aggregate([
    { $match: { order: order._id, confirmed: true } },
    { $group: { _id: null, sum: { $sum: '$amount' } } },
  ]);
  order.amountPaid = agg?.sum || 0;
  order.recalculate();
  await order.save();
}

async function attachOrder(data, orderId) {
  if (!orderId) {
    data.order = undefined;
    data.orderNo = undefined;
    return;
  }
  const order = await Order.findById(orderId).lean();
  if (!order) throw new HttpError(400, 'Order not found');
  data.order = order._id;
  data.orderNo = order.orderNo;
  data.customerName = data.customerName || order.customerName;
}

/* ---------- Receivers (admin-managed "who received the money" list) ---------- */
router.get(
  '/receivers',
  ah(async (req, res) => {
    const receivers = await Receiver.find().sort({ name: 1 }).lean();
    const totals = await Payment.aggregate([
      { $match: { confirmed: true } },
      { $unwind: '$receivedBy' },
      { $group: { _id: '$receivedBy', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const byId = new Map(totals.map((t) => [String(t._id), t]));
    res.json({ receivers: receivers.map((r) => ({ ...r, totalReceived: byId.get(String(r._id))?.amount || 0, payments: byId.get(String(r._id))?.count || 0 })) });
  })
);
router.post(
  '/receivers',
  ah(async (req, res) => {
    if (!req.body.name?.trim()) throw new HttpError(400, 'Name is required');
    res.status(201).json({ receiver: await Receiver.create(pick(req.body, ['name', 'note', 'active'])) });
  })
);
router.put(
  '/receivers/:id',
  ah(async (req, res) => {
    res.json({ receiver: await Receiver.findByIdAndUpdate(req.params.id, pick(req.body, ['name', 'note', 'active']), { new: true }) });
  })
);
router.delete(
  '/receivers/:id',
  ah(async (req, res) => {
    await Payment.updateMany({}, { $pull: { receivedBy: new mongoose.Types.ObjectId(req.params.id) } });
    await Receiver.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

/* ---------- Payments ---------- */
router.get(
  '/',
  ah(async (req, res) => {
    const q = { ...dateRange(req.query) };
    if (req.query.receiver) q.receivedBy = req.query.receiver;
    if (req.query.method) q.method = req.query.method;
    if (req.query.confirmed === 'true') q.confirmed = true;
    if (req.query.confirmed === 'false') q.confirmed = false;
    if (req.query.order) q.order = req.query.order;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      q.$or = [{ customerName: rx }, { orderNo: rx }, { reference: rx }, { notes: rx }];
    }
    const payments = await Payment.find(q).populate('receivedBy', 'name').sort({ date: -1, createdAt: -1 }).limit(500).lean();
    const summary = payments.reduce(
      (s, p) => {
        if (p.confirmed) s.received += p.amount;
        else s.unconfirmed += p.amount;
        s.count += 1;
        return s;
      },
      { received: 0, unconfirmed: 0, count: 0 }
    );
    res.json({ payments, summary });
  })
);

router.post(
  '/',
  ah(async (req, res) => {
    const data = pick(req.body, FIELDS);
    data.amount = Number(data.amount);
    if (!(data.amount > 0)) throw new HttpError(400, 'Enter an amount greater than 0');
    await attachOrder(data, req.body.order);
    const payment = await Payment.create(data);
    await syncOrder(payment.order);
    res.status(201).json({ payment: await payment.populate('receivedBy', 'name') });
  })
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new HttpError(404, 'Payment not found');
    const oldOrder = payment.order;
    const data = pick(req.body, FIELDS);
    if (data.amount !== undefined) {
      data.amount = Number(data.amount);
      if (!(data.amount > 0)) throw new HttpError(400, 'Enter an amount greater than 0');
    }
    if ('order' in req.body) await attachOrder(data, req.body.order);
    Object.assign(payment, data);
    await payment.save();
    await syncOrder(oldOrder);
    if (String(oldOrder) !== String(payment.order)) await syncOrder(payment.order);
    res.json({ payment: await payment.populate('receivedBy', 'name') });
  })
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (payment) await syncOrder(payment.order);
    res.json({ ok: true });
  })
);

module.exports = router;
module.exports.syncOrder = syncOrder;
