const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const opts = { timestamps: true };

/* ---------------- Admin + OTP ---------------- */
const AdminSchema = new Schema(
  {
    name: { type: String, default: 'Admin' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Two-factor login with an authenticator app (secrets stored encrypted)
    totpEnabled: { type: Boolean, default: false },
    totpSecret: String, // active secret (encrypted)
    totpPendingSecret: String, // being set up / moved to a new phone (encrypted)
    totpLastStep: { type: Number, default: -1 }, // last used code, so a code can't be replayed
    backupCodes: { type: [String], default: [] }, // sha256 hashes, each usable once
    failedCodes: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
  },
  opts
);

/* ---------------- Inventory ---------------- */
const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    category: { type: String, trim: true, default: 'Premix' },
    unit: { type: String, default: 'packets' },
    packSize: { type: String, trim: true }, // e.g. "100 g"
    quantity: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 10, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 }, // cost to make/buy one unit
    sellingPrice: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  opts
);
ProductSchema.index({ name: 'text', sku: 'text', category: 'text' });

const StockMovementSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: String,
    type: { type: String, enum: ['in', 'out', 'adjust', 'order', 'order-cancel'], required: true },
    quantity: { type: Number, required: true }, // signed change
    balanceAfter: Number,
    note: String,
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    date: { type: Date, default: Date.now },
  },
  opts
);

/* ---------------- Orders ---------------- */
const OrderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }, // selling price per unit at time of order
    cost: { type: Number, default: 0, min: 0 }, // cost per unit at time of order
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    orderNo: { type: String, unique: true },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, trim: true },
    customerEmail: { type: String, trim: true },
    customerAddress: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    items: { type: [OrderItemSchema], validate: (v) => v.length > 0 },
    discount: { type: Number, default: 0, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    subtotal: Number, // auto
    total: Number, // auto
    costTotal: Number, // auto
    amountPaid: { type: Number, default: 0 }, // auto, from payments
    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' }, // auto
    status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    notes: String,
  },
  opts
);

OrderSchema.methods.recalculate = function () {
  this.subtotal = this.items.reduce((s, i) => s + i.quantity * i.price, 0);
  this.costTotal = this.items.reduce((s, i) => s + i.quantity * (i.cost || 0), 0);
  this.total = Math.max(0, this.subtotal - (this.discount || 0) + (this.shipping || 0));
  const paid = this.amountPaid || 0;
  this.paymentStatus = paid <= 0 ? 'unpaid' : paid + 0.001 >= this.total ? 'paid' : 'partial';
};

/* ---------------- Money in: Payments ---------------- */
// Admin-managed list of who can receive money (e.g. "Rahul", "Company bank", "Cash box")
const ReceiverSchema = new Schema(
  { name: { type: String, required: true, trim: true, unique: true }, note: String, active: { type: Boolean, default: true } },
  opts
);

const PaymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNo: String,
    customerName: String,
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, default: Date.now },
    method: { type: String, enum: ['cash', 'upi', 'bank', 'card', 'cheque', 'other'], default: 'upi' },
    reference: String, // UTR / transaction id
    receivedBy: [{ type: Schema.Types.ObjectId, ref: 'Receiver' }], // checkboxes
    confirmed: { type: Boolean, default: false }, // "money actually received" checkbox
    notes: String,
  },
  opts
);

/* ---------------- Money out: Expenses ---------------- */
const ExpenseCategorySchema = new Schema(
  { name: { type: String, required: true, trim: true, unique: true }, color: { type: String, default: '#64748b' } },
  opts
);

const ExpenseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory' },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, default: Date.now },
    paidTo: String,
    method: { type: String, enum: ['cash', 'upi', 'bank', 'card', 'cheque', 'other'], default: 'upi' },
    notes: String,
  },
  opts
);

/* ---------------- Settings ---------------- */
const SettingsSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    businessName: { type: String, default: 'Quick Zest' },
    currency: { type: String, default: 'INR' },
    openingBalance: { type: Number, default: 0 },
    orderPrefix: { type: String, default: 'QX' },
  },
  opts
);

const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });

module.exports = {
  Admin: model('Admin', AdminSchema),
  Product: model('Product', ProductSchema),
  StockMovement: model('StockMovement', StockMovementSchema),
  Order: model('Order', OrderSchema),
  Receiver: model('Receiver', ReceiverSchema),
  Payment: model('Payment', PaymentSchema),
  ExpenseCategory: model('ExpenseCategory', ExpenseCategorySchema),
  Expense: model('Expense', ExpenseSchema),
  Settings: model('Settings', SettingsSchema),
  Counter: model('Counter', CounterSchema),
};
