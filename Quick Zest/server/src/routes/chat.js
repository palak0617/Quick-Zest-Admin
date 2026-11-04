/**
 * Quick Zest assistant: answers questions straight from the database.
 * Works fully offline with built-in rules (stock, orders, money, profit...).
 * If ANTHROPIC_API_KEY is set, questions the rules can't handle are sent to Claude
 * together with a snapshot of the live data.
 */
const router = require('express').Router();
const config = require('../config');
const { Product, Order } = require('../models');
const { ah, HttpError } = require('../utils/helpers');
const { financeSummary, topProducts, topCustomers, lowStock } = require('../utils/finance');

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const singular = (w) => (w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

const STOP = new Set(
  'how many much packet packets unit units of the a an are is there do we have in stock left available what whats quantity qty count number pcs piece pieces our current currently show tell me about for and with item items product products remaining total kg g gm grams'.split(' ')
);
const GENERIC = new Set(['premix', 'mix', 'masala', 'powder', 'pack']);

/* ---------- Period parsing ---------- */
function parsePeriod(text, fallback = 'this month') {
  const now = new Date();
  const d0 = (y, m, d) => new Date(y, m, d);
  const end = (d) => (d.setHours(23, 59, 59, 999), d);
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const P = {
    today: () => ({ from: d0(y, m, d), to: end(d0(y, m, d)), label: 'today' }),
    yesterday: () => ({ from: d0(y, m, d - 1), to: end(d0(y, m, d - 1)), label: 'yesterday' }),
    'this week': () => {
      const off = (now.getDay() + 6) % 7; // Monday start
      return { from: d0(y, m, d - off), to: end(d0(y, m, d)), label: 'this week' };
    },
    'last week': () => {
      const off = ((now.getDay() + 6) % 7) + 7;
      return { from: d0(y, m, d - off), to: end(d0(y, m, d - off + 6)), label: 'last week' };
    },
    'this month': () => ({ from: d0(y, m, 1), to: end(d0(y, m, d)), label: 'this month' }),
    'last month': () => ({ from: d0(y, m - 1, 1), to: end(d0(y, m, 0)), label: 'last month' }),
    'this year': () => ({ from: d0(y, 0, 1), to: end(d0(y, m, d)), label: 'this year' }),
    'last year': () => ({ from: d0(y - 1, 0, 1), to: end(d0(y - 1, 11, 31)), label: 'last year' }),
    'all time': () => ({ from: undefined, to: undefined, label: 'all time' }),
  };
  const t = ` ${text} `;
  const nDays = t.match(/last (\d{1,3}) days?/);
  if (nDays) return { from: d0(y, m, d - Number(nDays[1]) + 1), to: end(d0(y, m, d)), label: `the last ${nDays[1]} days` };
  if (/ today /.test(t)) return P.today();
  if (/ yesterday /.test(t)) return P.yesterday();
  if (/ (this|current) week /.test(t)) return P['this week']();
  if (/ last week /.test(t)) return P['last week']();
  if (/ (last|previous) month /.test(t)) return P['last month']();
  if (/ (this|current) month /.test(t)) return P['this month']();
  if (/ (this|current) year /.test(t)) return P['this year']();
  if (/ last year /.test(t)) return P['last year']();
  if (/ (all time|overall|total|ever|till now|so far|lifetime) /.test(t)) return P['all time']();
  return P[fallback]();
}

/* ---------- Product matching ---------- */
function matchProducts(text, products) {
  const words = new Set(norm(text).split(' ').map(singular));
  const scored = products.map((p) => {
    const tokens = norm(p.name).split(' ').filter((w) => w && !STOP.has(w)).map(singular);
    let score = 0, strong = 0;
    for (const tk of tokens) {
      if (words.has(tk)) {
        const g = GENERIC.has(tk);
        score += g ? 0.3 : 1;
        if (!g) strong += 1;
      }
    }
    if (p.sku && words.has(norm(p.sku))) (score += 2), (strong += 1);
    // bonus when the whole name appears as a phrase
    if (norm(text).includes(norm(p.name))) score += 1;
    return { p, score, strong, coverage: tokens.length ? score / tokens.length : 0 };
  });
  const good = scored.filter((s) => s.strong > 0).sort((a, b) => b.score - a.score || b.coverage - a.coverage);
  if (!good.length) return [];
  const best = good[0].score;
  return good.filter((s) => s.score === best).map((s) => s.p);
}

const has = (t, rx) => rx.test(t);

/* ---------- Rule-based answers ---------- */
async function ruleAnswer(message) {
  const t = norm(message);
  const products = await Product.find({ active: true }).sort({ name: 1 }).lean();

  if (!t || has(t, /^(hi|hello|hey|help|namaste|what can you do)\b/)) {
    return {
      text:
        "Hi! I read straight from your Quick Zest data. Try:\n• How many packets of pasta premix are there?\n• Which items are low on stock?\n• Show all inventory\n• How many orders this month?\n• What's our profit this month?\n• How much did we spend last month?\n• What's our current balance?\n• Who hasn't paid yet?\n• Top selling products",
    };
  }

  // Low stock
  if (has(t, /\b(low|reorder|running out|out of stock|finish|finishing|refill|restock)\b/)) {
    const low = await lowStock();
    if (!low.length) return { text: 'All good — no product is at or below its reorder level right now. ✅' };
    return {
      text: `${low.length} item${low.length > 1 ? 's are' : ' is'} at or below reorder level:\n` +
        low.map((p) => `• ${p.name}: ${p.quantity} ${p.unit} (reorder at ${p.reorderLevel})`).join('\n'),
    };
  }

  // Specific product stock / price
  const wantsMoney = has(t, /\b(profit|expense|spent|spend|income|revenue|balance|earn|sales|received|due|pending payment|unpaid)\b/);
  const matched = wantsMoney ? [] : matchProducts(t, products);
  if (matched.length) {
    if (has(t, /\b(price|cost|rate|mrp|selling|margin)\b/)) {
      return {
        text: matched
          .map((p) => `${p.name}: selling price ${inr(p.sellingPrice)}, cost ${inr(p.costPrice)} → margin ${inr(p.sellingPrice - p.costPrice)} per ${p.unit.replace(/s$/, '')}`)
          .join('\n'),
      };
    }
    if (has(t, /\b(sold|sell|sale|ordered)\b/)) {
      const period = parsePeriod(t, 'this month');
      const tops = await topProducts(period, 1000);
      return {
        text: matched
          .map((p) => {
            const r = tops.find((x) => String(x._id) === String(p._id));
            return `${p.name}: ${r ? r.quantity : 0} ${p.unit} sold ${period.label}${r ? ` (${inr(r.revenue)} sales)` : ''}`;
          })
          .join('\n'),
      };
    }
    return {
      text: matched
        .map((p) => {
          const flag = p.quantity === 0 ? ' ⚠️ out of stock' : p.quantity <= p.reorderLevel ? ' ⚠️ low — time to restock' : '';
          return `There ${p.quantity === 1 ? 'is' : 'are'} ${p.quantity} ${p.unit} of ${p.name}${p.packSize ? ` (${p.packSize} each)` : ''} in stock.${flag}`;
        })
        .join('\n'),
    };
  }

  // Full inventory list
  if (has(t, /\b(inventory|stock|all products|all items|list products|what do we have|products)\b/) && !wantsMoney) {
    if (!products.length) return { text: 'No products in inventory yet. Add some from the Inventory page.' };
    const units = products.reduce((s, p) => s + p.quantity, 0);
    return {
      text: `You have ${products.length} products, ${units} units in total:\n` + products.map((p) => `• ${p.name}: ${p.quantity} ${p.unit}`).join('\n'),
    };
  }

  // Balance
  if (has(t, /\b(balance|cash in hand|in hand|bank balance|how much money do we have)\b/)) {
    const s = await financeSummary();
    return { text: `Current balance: ${inr(s.balance)}\n(opening ${inr(s.openingBalance)} + all money received ${inr(s.income + 0)} − all spending ${inr(s.expenses)})` };
  }

  // Receivables
  if (has(t, /\b(due|owe|owes|outstanding|unpaid|pending payment|pending payments|not paid|hasn t paid|havent paid|receivable)\b/)) {
    const orders = await Order.find({ status: { $ne: 'cancelled' }, paymentStatus: { $ne: 'paid' } }).sort({ date: 1 }).lean();
    if (!orders.length) return { text: 'Every order is fully paid. 🎉' };
    const total = orders.reduce((s, o) => s + (o.total - o.amountPaid), 0);
    return {
      text: `${inr(total)} is still to be collected from ${orders.length} order${orders.length > 1 ? 's' : ''}:\n` +
        orders.slice(0, 10).map((o) => `• ${o.orderNo} — ${o.customerName}: ${inr(o.total - o.amountPaid)} due`).join('\n') +
        (orders.length > 10 ? `\n…and ${orders.length - 10} more on the Orders page.` : ''),
    };
  }

  const period = parsePeriod(t, 'this month');

  if (has(t, /\b(profit|loss|margin|earning|net)\b/)) {
    const s = await financeSummary(period);
    return {
      text: `Profit for ${period.label}:\n• Money received: ${inr(s.income)}\n• Money spent: ${inr(s.expenses)}\n• Net profit (cash): ${inr(s.netProfit)}\n• Gross profit on products sold: ${inr(s.grossProfit)} (${s.grossMargin}% margin)\n• Gross profit − expenses: ${inr(s.operatingProfit)}`,
    };
  }

  if (has(t, /\b(expense|expenses|spent|spend|spending|cost us|paid out)\b/)) {
    const s = await financeSummary(period);
    return { text: `We spent ${inr(s.expenses)} ${period.label} across ${s.expensesCount} expense entr${s.expensesCount === 1 ? 'y' : 'ies'}.` };
  }

  if (has(t, /\b(income|received|receive|collected|revenue|money came|money in|payments)\b/)) {
    const s = await financeSummary(period);
    return { text: `We received ${inr(s.income)} ${period.label} from ${s.paymentsCount} payment${s.paymentsCount === 1 ? '' : 's'}.` };
  }

  if (has(t, /\b(best|top|most) (selling|sold|seller|product)/) || has(t, /\bbest ?seller/)) {
    const tops = await topProducts(period, 5);
    if (!tops.length) return { text: `No sales ${period.label} yet.` };
    return { text: `Top sellers ${period.label}:\n` + tops.map((p, i) => `${i + 1}. ${p.name} — ${p.quantity} sold (${inr(p.revenue)})`).join('\n') };
  }

  if (has(t, /\b(top|best|biggest) (customer|client|buyer)/)) {
    const tops = await topCustomers(period, 5);
    if (!tops.length) return { text: `No orders ${period.label} yet.` };
    return { text: `Top customers ${period.label}:\n` + tops.map((c, i) => `${i + 1}. ${c.name} — ${c.orders} orders, ${inr(c.value)}`).join('\n') };
  }

  if (has(t, /\b(sales|sold)\b/)) {
    const s = await financeSummary(period);
    return { text: `Sales ${period.label}: ${inr(s.sales)} from ${s.ordersCount} order${s.ordersCount === 1 ? '' : 's'}.` };
  }

  if (has(t, /\b(order|orders)\b/)) {
    const statusMatch = t.match(/\b(pending|processing|shipped|delivered|cancelled)\b/);
    const q = {};
    if (period.from) q.date = { $gte: period.from, $lte: period.to };
    if (statusMatch) {
      q.status = statusMatch[1];
      const orders = await Order.find(statusMatch && !/ (today|week|month|year|days) /.test(` ${t} `) ? { status: statusMatch[1] } : q).sort({ date: -1 }).lean();
      if (!orders.length) return { text: `No ${statusMatch[1]} orders.` };
      return {
        text: `${orders.length} ${statusMatch[1]} order${orders.length > 1 ? 's' : ''}:\n` +
          orders.slice(0, 10).map((o) => `• ${o.orderNo} — ${o.customerName}, ${inr(o.total)} on ${new Date(o.date).toLocaleDateString('en-IN')}`).join('\n'),
      };
    }
    const orders = await Order.find({ ...q, status: { $ne: 'cancelled' } }).sort({ date: -1 }).lean();
    const value = orders.reduce((s, o) => s + o.total, 0);
    let text = `${orders.length} order${orders.length === 1 ? '' : 's'} ${period.label}, worth ${inr(value)}.`;
    if (orders.length) text += '\nLatest:\n' + orders.slice(0, 5).map((o) => `• ${o.orderNo} — ${o.customerName}, ${inr(o.total)} (${o.status})`).join('\n');
    return { text };
  }

  return null; // not understood by rules
}

/* ---------- Optional: Claude for free-form questions ---------- */
async function llmAnswer(message, history = []) {
  const now = new Date();
  const [products, month, all, recent] = await Promise.all([
    Product.find({ active: true }).select('name sku category unit packSize quantity reorderLevel costPrice sellingPrice -_id').lean(),
    financeSummary({ from: new Date(now.getFullYear(), now.getMonth(), 1) }),
    financeSummary(),
    Order.find().sort({ date: -1 }).limit(30).select('orderNo customerName date total amountPaid paymentStatus status items.name items.quantity -_id').lean(),
  ]);
  const snapshot = { today: now.toISOString().slice(0, 10), products, financeThisMonth: month, financeAllTime: all, recentOrders: recent };
  const system =
    'You are the internal assistant for Quick Zest, a premix food brand. Answer the admin briefly and only from the JSON data provided. ' +
    'Amounts are in Indian Rupees (₹). If the data does not contain the answer, say so plainly. Do not invent numbers.\n\nDATA:\n' +
    JSON.stringify(snapshot);
  const messages = [
    ...history.slice(-6).filter((m) => m && m.content).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) })),
    { role: 'user', content: message },
  ];
  // The API requires the first message to come from the user
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.anthropicModel, max_tokens: 600, system, messages }),
  });
  if (!r.ok) throw new Error(`AI service error ${r.status}`);
  const data = await r.json();
  return data.content?.map((c) => c.text || '').join('').trim();
}

router.post(
  '/',
  ah(async (req, res) => {
    const message = String(req.body.message || '').slice(0, 1000);
    if (!message.trim()) throw new HttpError(400, 'Type a question');
    const rule = await ruleAnswer(message);
    if (rule) return res.json({ reply: rule.text, source: 'data' });
    if (config.anthropicKey) {
      try {
        const text = await llmAnswer(message, req.body.history);
        if (text) return res.json({ reply: text, source: 'ai' });
      } catch (e) {
        console.error('Chat AI error:', e.message);
      }
    }
    res.json({
      reply:
        "Sorry, I didn't catch that. I can answer things like:\n• How many packets of <product> are there?\n• Low stock items\n• Orders today / this month\n• Profit, spending or money received this month\n• Current balance\n• Who still has to pay?",
      source: 'data',
    });
  })
);

module.exports = router;
module.exports._test = { matchProducts, parsePeriod, norm };
