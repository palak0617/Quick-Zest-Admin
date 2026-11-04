const router = require('express').Router();
const { Product, StockMovement, Order } = require('../models');
const { ah, HttpError, escapeRegex, pick } = require('../utils/helpers');
const { changeStock } = require('../utils/stock');

const FIELDS = ['name', 'sku', 'category', 'unit', 'packSize', 'reorderLevel', 'costPrice', 'sellingPrice', 'active'];

// List products with search, category and low-stock filter
router.get(
  '/',
  ah(async (req, res) => {
    const q = {};
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      q.$or = [{ name: rx }, { sku: rx }, { category: rx }];
    }
    if (req.query.category) q.category = req.query.category;
    if (req.query.active !== 'all') q.active = true;
    if (req.query.lowStock === 'true') q.$expr = { $lte: ['$quantity', '$reorderLevel'] };
    const products = await Product.find(q).sort({ name: 1 }).lean();
    const summary = products.reduce(
      (s, p) => {
        s.totalUnits += p.quantity;
        s.stockValue += p.quantity * p.costPrice;
        s.retailValue += p.quantity * p.sellingPrice;
        if (p.quantity <= p.reorderLevel) s.lowStock += 1;
        if (p.quantity === 0) s.outOfStock += 1;
        return s;
      },
      { totalProducts: products.length, totalUnits: 0, stockValue: 0, retailValue: 0, lowStock: 0, outOfStock: 0 }
    );
    const categories = await Product.distinct('category');
    res.json({ products, summary, categories: categories.filter(Boolean).sort() });
  })
);

router.get(
  '/movements',
  ah(async (req, res) => {
    const q = req.query.product ? { product: req.query.product } : {};
    const movements = await StockMovement.find(q).sort({ date: -1 }).limit(Number(req.query.limit) || 100).lean();
    res.json({ movements });
  })
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const product = await Product.findById(req.params.id).lean();
    if (!product) throw new HttpError(404, 'Product not found');
    const movements = await StockMovement.find({ product: product._id }).sort({ date: -1 }).limit(50).lean();
    res.json({ product, movements });
  })
);

router.post(
  '/',
  ah(async (req, res) => {
    const data = pick(req.body, FIELDS);
    if (!data.name) throw new HttpError(400, 'Product name is required');
    const openingQty = Math.max(0, Number(req.body.quantity) || 0);
    const product = await Product.create({ ...data, quantity: 0 });
    if (openingQty > 0) await changeStock(product._id, openingQty, { type: 'in', note: 'Opening stock' });
    res.status(201).json({ product: await Product.findById(product._id) });
  })
);

// Edit details (quantity is changed only through /stock so every change is logged)
router.put(
  '/:id',
  ah(async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, pick(req.body, FIELDS), { new: true, runValidators: true });
    if (!product) throw new HttpError(404, 'Product not found');
    res.json({ product });
  })
);

/** Stock in / out / set exact count. body: { type: 'in'|'out'|'adjust', quantity, note } */
router.post(
  '/:id/stock',
  ah(async (req, res) => {
    const { type, note } = req.body;
    const qty = Number(req.body.quantity);
    if (!['in', 'out', 'adjust'].includes(type)) throw new HttpError(400, 'Type must be in, out or adjust');
    if (!Number.isFinite(qty) || qty < 0 || (type !== 'adjust' && qty === 0)) throw new HttpError(400, 'Enter a valid quantity');
    let delta = qty;
    if (type === 'out') delta = -qty;
    if (type === 'adjust') {
      const p = await Product.findById(req.params.id);
      if (!p) throw new HttpError(404, 'Product not found');
      delta = qty - p.quantity; // set to exact physical count
      if (delta === 0) return res.json({ product: p });
    }
    const product = await changeStock(req.params.id, delta, { type, note: note || (type === 'adjust' ? 'Stock count correction' : '') });
    res.json({ product });
  })
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const used = await Order.exists({ 'items.product': req.params.id });
    if (used) {
      // Keep history intact: archive instead of hard delete
      await Product.findByIdAndUpdate(req.params.id, { active: false });
      return res.json({ ok: true, archived: true, message: 'Product is used in orders, so it was archived instead of deleted.' });
    }
    await Product.findByIdAndDelete(req.params.id);
    await StockMovement.deleteMany({ product: req.params.id });
    res.json({ ok: true });
  })
);

module.exports = router;
