const { Product, StockMovement } = require('../models');
const { HttpError } = require('./helpers');

/**
 * Atomically change a product's stock. A negative change only succeeds if enough stock exists,
 * so two orders at the same moment can never push quantity below zero.
 */
async function changeStock(productId, delta, { type, note, order } = {}) {
  const filter = { _id: productId };
  if (delta < 0) filter.quantity = { $gte: -delta };
  const product = await Product.findOneAndUpdate(filter, { $inc: { quantity: delta } }, { new: true });
  if (!product) {
    const p = await Product.findById(productId).select('name quantity unit');
    if (!p) throw new HttpError(404, 'Product not found');
    throw new HttpError(400, `Not enough stock for "${p.name}" — only ${p.quantity} ${p.unit} left`);
  }
  await StockMovement.create({
    product: product._id,
    productName: product.name,
    type,
    quantity: delta,
    balanceAfter: product.quantity,
    note,
    order,
  });
  return product;
}

/** Deduct stock for each order item; if one fails, put back what was already taken. */
async function deductForItems(items, order) {
  const done = [];
  try {
    for (const it of items) {
      await changeStock(it.product, -it.quantity, { type: 'order', note: `Order ${order.orderNo}`, order: order._id });
      done.push(it);
    }
  } catch (err) {
    for (const it of done) {
      await changeStock(it.product, it.quantity, { type: 'order-cancel', note: `Rollback ${order.orderNo}`, order: order._id });
    }
    throw err;
  }
}

async function restoreForItems(items, order, note) {
  for (const it of items) {
    const exists = await Product.exists({ _id: it.product });
    if (exists) {
      await changeStock(it.product, it.quantity, { type: 'order-cancel', note: note || `Order ${order.orderNo} reversed`, order: order._id });
    }
  }
}

module.exports = { changeStock, deductForItems, restoreForItems };
