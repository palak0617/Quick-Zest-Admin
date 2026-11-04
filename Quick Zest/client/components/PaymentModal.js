'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { inr, toInputDate, METHODS } from '@/lib/format';
import { Modal, Field, useToast } from './ui';

/**
 * Add or edit a payment received.
 * - payment: existing payment to edit (optional)
 * - order:   pre-select this order (optional)
 */
export default function PaymentModal({ payment, order, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !payment?._id;
  const [receivers, setReceivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [newReceiver, setNewReceiver] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(() => ({
    order: payment?.order || order?._id || '',
    customerName: payment?.customerName || order?.customerName || '',
    amount: payment?.amount ?? (order ? Math.max(0, order.total - (order.amountPaid || 0)) : ''),
    date: toInputDate(payment?.date || new Date()),
    method: payment?.method || 'upi',
    reference: payment?.reference || '',
    receivedBy: (payment?.receivedBy || []).map((r) => r._id || r),
    confirmed: payment ? payment.confirmed : true,
    notes: payment?.notes || '',
  }));

  useEffect(() => {
    api('/payments/receivers').then((d) => setReceivers(d.receivers.filter((r) => r.active !== false)));
    api('/orders', { query: { limit: 200 } }).then((d) => setOrders(d.orders.filter((o) => o.status !== 'cancelled')));
  }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleReceiver = (id) =>
    setF((x) => ({ ...x, receivedBy: x.receivedBy.includes(id) ? x.receivedBy.filter((r) => r !== id) : [...x.receivedBy, id] }));

  const pickOrder = (id) => {
    const o = orders.find((x) => x._id === id);
    setF((x) => ({
      ...x,
      order: id,
      customerName: o ? o.customerName : x.customerName,
      amount: o && isNew ? Math.max(0, o.total - o.amountPaid) : x.amount,
    }));
  };

  const addReceiver = async () => {
    if (!newReceiver.trim()) return;
    try {
      const { receiver } = await api('/payments/receivers', { method: 'POST', body: { name: newReceiver.trim() } });
      setReceivers((r) => [...r, receiver].sort((a, b) => a.name.localeCompare(b.name)));
      setF((x) => ({ ...x, receivedBy: [...x.receivedBy, receiver._id] }));
      setNewReceiver('');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, amount: Number(f.amount), order: f.order || null };
      if (isNew) await api('/payments', { method: 'POST', body });
      else await api(`/payments/${payment._id}`, { method: 'PUT', body });
      toast(isNew ? 'Payment recorded' : 'Payment updated');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  const selected = orders.find((o) => o._id === f.order);

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Record payment received' : 'Edit payment'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="payment-form" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
        </>
      }
    >
      <form id="payment-form" onSubmit={save} className="grid grid-cols-2 gap-3">
        <Field label="For order (optional)" className="col-span-2">
          <select className="input" value={f.order} onChange={(e) => pickOrder(e.target.value)}>
            <option value="">— Not linked to an order —</option>
            {orders.map((o) => (
              <option key={o._id} value={o._id}>
                {o.orderNo} · {o.customerName} · {inr(o.total)}
                {o.paymentStatus !== 'paid' ? ` (due ${inr(o.total - o.amountPaid)})` : ' (paid)'}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-stone-500">
              Order total {inr(selected.total)} · already received {inr(selected.amountPaid)}
            </p>
          )}
        </Field>
        <Field label="Received from" className="col-span-2">
          <input className="input" value={f.customerName} onChange={set('customerName')} placeholder="Customer / payer name" />
        </Field>
        <Field label="Amount (₹) *">
          <input className="input num" type="number" min="0.01" step="0.01" required value={f.amount} onChange={set('amount')} />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={f.date} onChange={set('date')} />
        </Field>
        <Field label="Method">
          <select className="input capitalize" value={f.method} onChange={set('method')}>
            {METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase() === 'UPI' ? 'UPI' : m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Reference / UTR">
          <input className="input" value={f.reference} onChange={set('reference')} placeholder="Txn ID" />
        </Field>

        <div className="col-span-2">
          <span className="label">Who received the payment?</span>
          <div className="flex flex-wrap gap-2">
            {receivers.map((r) => {
              const on = f.receivedBy.includes(r._id);
              return (
                <label
                  key={r._id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={on} onChange={() => toggleReceiver(r._id)} />
                  {r.name}
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              placeholder="Add a new receiver (e.g. Cash box, Rahul)"
              value={newReceiver}
              onChange={(e) => setNewReceiver(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addReceiver())}
            />
            <button type="button" className="btn-secondary" onClick={addReceiver}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        <label className="col-span-2 flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} />
          <span className="text-sm">
            <span className="font-medium text-stone-800">Money received & verified</span>
            <span className="block text-xs text-stone-500">Only verified payments count towards balance, income and profit.</span>
          </span>
        </label>

        <Field label="Notes" className="col-span-2">
          <input className="input" value={f.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
