const router = require('express').Router();
const { Order, Product, Payment } = require('../models');
const { ah, HttpError, nextSeq, getSettings, dateRange, escapeRegex, pick } = require('../utils/helpers');
const { deductForItems, restoreForItems } = require('../utils/stock');

const INFO_FIELDS = ['customerName', 'customerPhone', 'customerEmail', 'customerAddress', 'date', 'discount', 'shipping', 'notes'];
const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

/** Turn [{product, quantity, price?}] into validated items with snapshot name/price/cost */
async function buildItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new HttpError(400, 'Add at least one item');
  const merged = new Map();
  for (const r of rawItems) {
    const qty = Math.floor(Number(r.quantity));
    if (!r.product || !(qty > 0)) throw new HttpError(400, 'Each item needs a product and a quantity of at least 1');
    const prev = merged.get(String(r.product));
    merged.set(String(r.product), { product: r.product, quantity: (prev?.quantity || 0) + qty, price: r.price ?? prev?.price });
  }
  const products = await Product.find({ _id: { $in: [...merged.keys()] } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return [...merged.values()].map((r) => {
    const p = byId.get(String(r.product));
    if (!p) throw new HttpError(400, 'One of the products no longer exists');
    const price = r.price === undefined || r.price === '' ? p.sellingPrice : Number(r.price);
    if (!(price >= 0)) throw new HttpError(400, `Invalid price for ${p.name}`);
    return { product: p._id, name: p.name, quantity: r.quantity, price, cost: p.costPrice };
  });
}

router.get(
  '/',
  ah(async (req, res) => {
    const q = { ...dateRange(req.query) };
    if (req.query.status) q.status = req.query.status;
    if (req.query.paymentStatus) q.paymentStatus = req.query.paymentStatus;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      q.$or = [{ customerName: rx }, { customerPhone: rx }, { orderNo: rx }, { 'items.name': rx }];
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const [orders, total, agg] = await Promise.all([
      Order.find(q).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(q),
      Order.aggregate([
        { $match: { ...q, status: q.status || { $ne: 'cancelled' } } },
        { $group: { _id: null, value: { $sum: '$total' }, paid: { $sum: '$amountPaid' }, count: { $sum: 1 } } },
      ]),
    ]);
    const a = agg[0] || { value: 0, paid: 0, count: 0 };
    res.json({ orders, total, page, pages: Math.ceil(total / limit), summary: { count: a.count, value: a.value, paid: a.paid, due: a.value - a.paid } });
  })
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const order = await Order.findById(req.params.id).lean();
    if (!order) throw new HttpError(404, 'Order not found');
    const payments = await Payment.find({ order: order._id }).populate('receivedBy', 'name').sort({ date: -1 }).lean();
    res.json({ order, payments });
  })
);

router.post(
  '/',
  ah(async (req, res) => {
    const info = pick(req.body, INFO_FIELDS);
    if (!info.customerName) throw new HttpError(400, 'Customer name is required');
    const settings = await getSettings();
    const items = await buildItems(req.body.items);
    const seq = await nextSeq('order');
    const order = new Order({ ...info, items, orderNo: `${settings.orderPrefix}-${String(seq).padStart(5, '0')}` });
    if (STATUSES.includes(req.body.status)) order.status = req.body.status;
    order.recalculate();
    if (order.status !== 'cancelled') await deductForItems(order.items, order); // stock leaves the shelf
    await order.save();
    res.status(201).json({ order });
  })
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    const wasCancelled = order.status === 'cancelled';
    const newStatus = STATUSES.includes(req.body.status) ? req.body.status : order.status;
    const willBeCancelled = newStatus === 'cancelled';
    const itemsChanged = Array.isArray(req.body.items);

    Object.assign(order, pick(req.body, INFO_FIELDS));

    if (itemsChanged || wasCancelled !== willBeCancelled) {
      const newItems = itemsChanged ? await buildItems(req.body.items) : order.items.map((i) => i.toObject());
      // Put back the old stock, then take the new stock
      if (!wasCancelled) await restoreForItems(order.items, order, `Order ${order.orderNo} edited`);
      if (!willBeCancelled) {
        try {
          await deductForItems(newItems, order);
        } catch (err) {
          if (!wasCancelled) await deductForItems(order.items, order); // undo the restore
          throw err;
        }
      }
      order.items = newItems;
    }
    order.status = newStatus;
    order.recalculate();
    await order.save();
    res.json({ order });
  })
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, 'Order not found');
    if (await Payment.exists({ order: order._id })) {
      throw new HttpError(400, 'This order has payments recorded. Delete those payments first, or mark the order as cancelled.');
    }
    if (order.status !== 'cancelled') await restoreForItems(order.items, order, `Order ${order.orderNo} deleted`);
    await order.deleteOne();
    res.json({ ok: true });
  })
);

module.exports = router;
