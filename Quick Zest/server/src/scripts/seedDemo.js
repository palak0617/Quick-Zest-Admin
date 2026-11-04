/**
 * Fills the database with sample Quick Zest data (products, orders, payments, expenses)
 * so you can explore the dashboard. Refuses to run if products already exist,
 * unless you pass --reset (which DELETES all business data, never the admin account).
 *
 *   npm run seed:demo            # only on an empty database
 *   npm run seed:demo -- --reset # wipe business data and re-seed
 */
const config = require('../config');
const mongoose = require('mongoose');
const M = require('../models');
const { nextSeq, getSettings } = require('../utils/helpers');
const { changeStock, deductForItems } = require('../utils/stock');
const { syncOrder } = require('../routes/payments');

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pickOne = (arr) => arr[rand(0, arr.length - 1)];
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(rand(9, 19), rand(0, 59), 0, 0);
  return d;
};

const PRODUCTS = [
  { name: 'Pasta Premix', sku: 'QZ-PAS', category: 'Premix', packSize: '50 g', costPrice: 18, sellingPrice: 45, reorderLevel: 40, quantity: 520 },
  { name: 'Peri Peri Premix', sku: 'QZ-PPR', category: 'Seasoning', packSize: '50 g', costPrice: 15, sellingPrice: 40, reorderLevel: 40, quantity: 430 },
  { name: 'Pav Bhaji Premix', sku: 'QZ-PBJ', category: 'Premix', packSize: '100 g', costPrice: 22, sellingPrice: 55, reorderLevel: 30, quantity: 310 },
  { name: 'White Sauce Premix', sku: 'QZ-WSP', category: 'Premix', packSize: '75 g', costPrice: 25, sellingPrice: 65, reorderLevel: 25, quantity: 260 },
  { name: 'Chilli Garlic Noodles Premix', sku: 'QZ-CGN', category: 'Premix', packSize: '60 g', costPrice: 17, sellingPrice: 42, reorderLevel: 30, quantity: 300 },
  { name: 'Biryani Premix', sku: 'QZ-BIR', category: 'Premix', packSize: '100 g', costPrice: 30, sellingPrice: 80, reorderLevel: 25, quantity: 230 },
  { name: 'Red Sauce Pasta Premix', sku: 'QZ-RSP', category: 'Premix', packSize: '75 g', costPrice: 24, sellingPrice: 60, reorderLevel: 25, quantity: 140 },
  { name: 'Packaging Pouches', sku: 'RM-POU', category: 'Packaging', unit: 'pieces', costPrice: 2, sellingPrice: 0, reorderLevel: 500, quantity: 380 },
];

const CUSTOMERS = [
  ['Sharma General Store', '9876501234'], ['FreshMart Supermarket', '9811122233'], ['Cafe Brewbox', '9822033344'],
  ['Gupta Kirana', '9833044455'], ['Anita Verma', '9844055566'], ['The Pasta Corner', '9855066677'],
  ['Hotel Shivam', '9866077788'], ['Rohan Mehta', '9877088899'], ['Daily Needs Mart', '9888099900'], ['Spice Route Caterers', '9899100011'],
];

(async () => {
  await mongoose.connect(config.mongoUri);
  const reset = process.argv.includes('--reset');
  if ((await M.Product.estimatedDocumentCount()) > 0 && !reset) {
    console.log('Data already exists. Run with --reset to wipe business data and re-seed.');
    return mongoose.disconnect();
  }
  if (reset) {
    await Promise.all(
      ['Product', 'StockMovement', 'Order', 'Payment', 'Receiver', 'Expense', 'ExpenseCategory', 'Counter'].map((m) => M[m].deleteMany({}))
    );
    console.log('Business data cleared.');
  }

  const settings = await getSettings();
  settings.openingBalance = 50000;
  await settings.save();

  const receivers = await M.Receiver.insertMany([
    { name: 'Company Bank (HDFC)' }, { name: 'Owner UPI' }, { name: 'Cash Box' }, { name: 'Sales Rep – Amit' },
  ]);
  const cats = await M.ExpenseCategory.insertMany([
    { name: 'Raw Materials', color: '#d97706' }, { name: 'Packaging', color: '#0891b2' }, { name: 'Salaries', color: '#7c3aed' },
    { name: 'Rent', color: '#475569' }, { name: 'Marketing', color: '#db2777' }, { name: 'Delivery', color: '#059669' }, { name: 'Utilities', color: '#2563eb' },
  ]);
  const cat = Object.fromEntries(cats.map((c) => [c.name, c._id]));

  // Products with stock received ~6 months ago
  const products = [];
  for (const p of PRODUCTS) {
    const { quantity, ...data } = p;
    const prod = await M.Product.create({ ...data, quantity: 0 });
    await changeStock(prod._id, quantity, { type: 'in', note: 'Opening stock' });
    products.push(prod);
  }
  const sellable = products.filter((p) => p.sellingPrice > 0);

  // Orders over the last ~180 days
  let made = 0;
  for (let day = 175; day >= 0; day -= rand(1, 4)) {
    const lines = Array.from({ length: rand(1, 3) }, () => ({ product: pickOne(sellable), quantity: rand(5, 30) }));
    const merged = new Map();
    for (const l of lines) merged.set(String(l.product._id), { p: l.product, q: (merged.get(String(l.product._id))?.q || 0) + l.quantity });
    const items = [...merged.values()].map(({ p, q }) => ({ product: p._id, name: p.name, quantity: q, price: p.sellingPrice, cost: p.costPrice }));
    const [customerName, customerPhone] = pickOne(CUSTOMERS);
    const seq = await nextSeq('order');
    const status = day > 10 ? (Math.random() < 0.06 ? 'cancelled' : 'delivered') : pickOne(['pending', 'processing', 'shipped', 'delivered']);
    const order = new M.Order({
      orderNo: `${settings.orderPrefix}-${String(seq).padStart(5, '0')}`,
      customerName, customerPhone, date: daysAgo(day), items, status,
      shipping: Math.random() < 0.3 ? 50 : 0, discount: Math.random() < 0.2 ? 25 : 0,
    });
    order.recalculate();
    try {
      if (status !== 'cancelled') await deductForItems(order.items, order);
    } catch {
      continue; // ran out of stock for this sample order
    }
    await order.save();
    made++;

    // Payments: older orders paid, recent ones partly/unpaid
    if (status !== 'cancelled') {
      const roll = Math.random();
      const payFull = day > 20 ? roll < 0.92 : roll < 0.4;
      const payPart = !payFull && roll < (day > 20 ? 1 : 0.65);
      if (payFull || payPart) {
        await M.Payment.create({
          order: order._id, orderNo: order.orderNo, customerName,
          amount: payFull ? order.total : Math.round(order.total / 2),
          date: daysAgo(Math.max(0, day - rand(0, 5))),
          method: pickOne(['upi', 'upi', 'bank', 'cash']),
          receivedBy: [pickOne(receivers)._id],
          confirmed: day > 3 || Math.random() < 0.5,
        });
        await syncOrder(order._id);
      }
    }
  }

  // Restocks along the way
  for (const p of sellable) {
    for (const d of [120, 60]) {
      await changeStock(p._id, rand(80, 200), { type: 'in', note: `Production batch (${d} days ago)` });
    }
  }

  // Expenses each month
  const exp = [];
  for (let m = 5; m >= 0; m--) {
    const base = m * 30;
    exp.push(
      { title: 'Spices & ingredients', category: cat['Raw Materials'], amount: rand(14000, 22000), date: daysAgo(base + 3), paidTo: 'Agarwal Spices' },
      { title: 'Pouches & labels', category: cat['Packaging'], amount: rand(3000, 6000), date: daysAgo(base + 6), paidTo: 'PackWell' },
      { title: 'Staff salaries', category: cat['Salaries'], amount: 24000, date: daysAgo(base + 1), paidTo: 'Staff', method: 'bank' },
      { title: 'Unit rent', category: cat['Rent'], amount: 12000, date: daysAgo(base + 2), paidTo: 'Landlord', method: 'bank' },
      { title: 'Courier charges', category: cat['Delivery'], amount: rand(1500, 3500), date: daysAgo(base + 12), paidTo: 'Delhivery' },
      { title: 'Electricity bill', category: cat['Utilities'], amount: rand(1800, 2600), date: daysAgo(base + 15) },
    );
    if (m % 2 === 0) exp.push({ title: 'Instagram ads', category: cat['Marketing'], amount: rand(3000, 8000), date: daysAgo(base + 10), paidTo: 'Meta', method: 'card' });
  }
  await M.Expense.insertMany(exp.filter((e) => e.date <= new Date()));

  console.log(`Demo data ready: ${products.length} products, ${made} orders, ${exp.length} expenses.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
