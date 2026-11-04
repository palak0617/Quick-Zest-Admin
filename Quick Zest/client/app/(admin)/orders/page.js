'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ShoppingBag, Trash2, Pencil, IndianRupee, X } from 'lucide-react';
import { api } from '@/lib/api';
import { inr, num, fmtDate, toInputDate, ORDER_STATUSES } from '@/lib/format';
import { PageHeader, Stat, Badge, Loading, Empty, Modal, Field, Table, useToast, confirmAction } from '@/components/ui';
import PaymentModal from '@/components/PaymentModal';

export default function OrdersPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '', paymentStatus: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); // {} for new, order for edit
  const [view, setView] = useState(null); // order id
  const [payFor, setPayFor] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('new')) setForm({});
    if (qs.get('open')) setView(qs.get('open'));
  }, []);

  const load = useCallback(() => {
    api('/orders', { query: { ...filters, page } })
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  }, [filters, page, toast]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (k) => (e) => {
    setPage(1);
    setFilters({ ...filters, [k]: e.target.value });
  };

  const changeStatus = async (o, status) => {
    try {
      await api(`/orders/${o._id}`, { method: 'PUT', body: { status } });
      toast(`${o.orderNo} marked ${status}${status === 'cancelled' ? ' — stock returned' : ''}`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const s = data?.summary;
  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Who ordered, when, and for how much. Stock is deducted automatically."
        actions={
          <button className="btn-primary" onClick={() => setForm({})}>
            <Plus size={16} /> New order
          </button>
        }
      />

      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Orders (filtered)" value={num(s.count)} hint="Excludes cancelled" />
          <Stat label="Order value" value={inr(s.value)} />
          <Stat label="Received" value={inr(s.paid)} tone="green" />
          <Stat label="Still due" value={inr(s.due)} tone={s.due > 0 ? 'red' : 'default'} />
        </div>
      )}

      <div className="card">
        <div className="grid gap-2 border-b border-stone-100 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9" placeholder="Customer, phone, order no." value={filters.search} onChange={setFilter('search')} />
          </div>
          <select className="input capitalize" value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <select className="input" value={filters.paymentStatus} onChange={setFilter('paymentStatus')}>
            <option value="">Any payment</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partly paid</option>
            <option value="paid">Paid</option>
          </select>
          <input className="input" type="date" value={filters.from} onChange={setFilter('from')} title="From date" />
          <input className="input" type="date" value={filters.to} onChange={setFilter('to')} title="To date" />
        </div>

        {!data ? (
          <Loading />
        ) : data.orders.length === 0 ? (
          <Empty icon={ShoppingBag} title="No orders found" text="Create an order when a customer buys — stock and dues update automatically." />
        ) : (
          <>
            <Table
              head={
                <>
                  <th className="th">Order</th>
                  <th className="th">Customer</th>
                  <th className="th">Date</th>
                  <th className="th">Items</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Payment</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </>
              }
            >
              {data.orders.map((o) => (
                <tr key={o._id} className="cursor-pointer hover:bg-stone-50/60" onClick={() => setView(o._id)}>
                  <td className="td font-medium text-stone-900">{o.orderNo}</td>
                  <td className="td">
                    <p className="font-medium text-stone-800">{o.customerName}</p>
                    {o.customerPhone && <p className="text-xs text-stone-500">{o.customerPhone}</p>}
                  </td>
                  <td className="td">{fmtDate(o.date)}</td>
                  <td className="td max-w-[220px] truncate text-stone-500">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                  <td className="td num text-right font-semibold text-stone-900">{inr(o.total)}</td>
                  <td className="td">
                    <Badge tone={o.paymentStatus}>{o.paymentStatus}</Badge>
                    {o.paymentStatus === 'partial' && <p className="num mt-0.5 text-[11px] text-stone-500">{inr(o.total - o.amountPaid)} due</p>}
                  </td>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs capitalize text-stone-700"
                      value={o.status}
                      onChange={(e) => changeStatus(o, e.target.value)}
                    >
                      {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </td>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    {o.paymentStatus !== 'paid' && o.status !== 'cancelled' && (
                      <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setPayFor(o)}>
                        <IndianRupee size={13} /> Payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {data.pages > 1 && (
              <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 text-sm text-stone-500">
                <span>
                  Page {data.page} of {data.pages} · {data.total} orders
                </span>
                <div className="flex gap-2">
                  <button className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                  <button className="btn-secondary px-3 py-1.5" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {form && <OrderForm order={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {view && (
        <OrderView
          id={view}
          onClose={() => setView(null)}
          onEdit={(o) => { setView(null); setForm(o); }}
          onChanged={load}
        />
      )}
      {payFor && <PaymentModal order={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); load(); }} />}
    </>
  );
}

/* ---------------- Create / edit order ---------------- */
function OrderForm({ order, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !order._id;
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    customerEmail: order.customerEmail || '',
    customerAddress: order.customerAddress || '',
    date: toInputDate(order.date || new Date()),
    status: order.status || 'pending',
    discount: order.discount || 0,
    shipping: order.shipping || 0,
    notes: order.notes || '',
  });
  const [items, setItems] = useState(
    order.items?.map((i) => ({ product: String(i.product), quantity: i.quantity, price: i.price })) || [{ product: '', quantity: 1, price: '' }]
  );

  useEffect(() => {
    api('/inventory').then((d) => setProducts(d.products));
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setItem = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
  const total = Math.max(0, subtotal - (Number(f.discount) || 0) + (Number(f.shipping) || 0));
  const cost = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (byId.get(it.product)?.costPrice || 0), 0);

  const save = async (e) => {
    e.preventDefault();
    const clean = items.filter((i) => i.product);
    if (!clean.length) return toast('Add at least one product', 'error');
    setBusy(true);
    try {
      const body = { ...f, discount: Number(f.discount) || 0, shipping: Number(f.shipping) || 0, items: clean.map((i) => ({ ...i, quantity: Number(i.quantity), price: Number(i.price) })) };
      if (isNew) await api('/orders', { method: 'POST', body });
      else await api(`/orders/${order._id}`, { method: 'PUT', body });
      toast(isNew ? 'Order created — stock updated' : 'Order updated');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={isNew ? 'New order' : `Edit ${order.orderNo}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="order-form" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create order' : 'Save changes'}</button>
        </>
      }
    >
      <form id="order-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Customer name *">
            <input className="input" required autoFocus value={f.customerName} onChange={set('customerName')} />
          </Field>
          <Field label="Phone">
            <input className="input" value={f.customerPhone} onChange={set('customerPhone')} />
          </Field>
          <Field label="Order date">
            <input className="input" type="date" value={f.date} onChange={set('date')} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={f.customerEmail} onChange={set('customerEmail')} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input className="input" value={f.customerAddress} onChange={set('customerAddress')} />
          </Field>
        </div>

        <div>
          <p className="label">Items</p>
          <div className="space-y-2">
            {items.map((it, i) => {
              const p = byId.get(it.product);
              return (
                <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-stone-200 p-2 sm:border-0 sm:p-0">
                  <div className="col-span-12 sm:col-span-6">
                    <select
                      className="input"
                      value={it.product}
                      onChange={(e) => {
                        const np = byId.get(e.target.value);
                        setItem(i, { product: e.target.value, price: np ? np.sellingPrice : '' });
                      }}
                    >
                      <option value="">Choose product…</option>
                      {products.map((pr) => (
                        <option key={pr._id} value={pr._id}>
                          {pr.name} — {pr.quantity} {pr.unit} left
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input className="input num" type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} placeholder="Qty" />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input className="input num" type="number" min="0" step="0.01" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} placeholder="Price" />
                  </div>
                  <div className="num col-span-3 py-2 text-right text-sm font-medium text-stone-800 sm:col-span-1">
                    {inr((Number(it.quantity) || 0) * (Number(it.price) || 0))}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" className="btn-ghost px-2 text-stone-400" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label="Remove item">
                      <X size={16} />
                    </button>
                  </div>
                  {p && Number(it.quantity) > p.quantity + (order.items?.find((x) => String(x.product) === p._id)?.quantity || 0) && (
                    <p className="col-span-12 text-xs text-red-600">Only {p.quantity} {p.unit} in stock</p>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="btn-ghost mt-2 text-brand-700" onClick={() => setItems([...items, { product: '', quantity: 1, price: '' }])}>
            <Plus size={14} /> Add item
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount (₹)">
              <input className="input num" type="number" min="0" value={f.discount} onChange={set('discount')} />
            </Field>
            <Field label="Shipping (₹)">
              <input className="input num" type="number" min="0" value={f.shipping} onChange={set('shipping')} />
            </Field>
            <Field label="Status">
              <select className="input capitalize" value={f.status} onChange={set('status')}>
                {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </Field>
            <Field label="Notes">
              <input className="input" value={f.notes} onChange={set('notes')} />
            </Field>
          </div>
          <div className="num space-y-1.5 rounded-xl bg-stone-50 p-4 text-sm">
            <Row label="Subtotal" value={inr(subtotal)} />
            <Row label="Discount" value={`− ${inr(f.discount)}`} />
            <Row label="Shipping" value={`+ ${inr(f.shipping)}`} />
            <div className="my-2 border-t border-stone-200" />
            <Row label={<span className="font-semibold text-stone-900">Total</span>} value={<span className="text-lg font-semibold text-stone-900">{inr(total)}</span>} />
            <Row label="Product cost" value={inr(cost)} muted />
            <Row label="Profit on this order" value={<span className={total - cost >= 0 ? 'text-emerald-700' : 'text-red-600'}>{inr(total - cost)}</span>} muted />
          </div>
        </div>
      </form>
    </Modal>
  );
}

const Row = ({ label, value, muted }) => (
  <div className={`flex items-center justify-between ${muted ? 'text-xs text-stone-500' : 'text-stone-600'}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

/* ---------------- Order details ---------------- */
function OrderView({ id, onClose, onEdit, onChanged }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [pay, setPay] = useState(false);
  const load = useCallback(() => api(`/orders/${id}`).then(setD).catch((e) => toast(e.message, 'error')), [id, toast]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!confirmAction(`Delete order ${d.order.orderNo}? Stock will be returned.`)) return;
    try {
      await api(`/orders/${id}`, { method: 'DELETE' });
      toast('Order deleted');
      onChanged();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const o = d?.order;
  return (
    <>
      <Modal
        open={!pay}
        size="lg"
        onClose={onClose}
        title={o ? `Order ${o.orderNo}` : 'Order'}
        footer={
          o && (
            <>
              <button className="btn-ghost mr-auto text-red-600 hover:bg-red-50" onClick={remove}>
                <Trash2 size={15} /> Delete
              </button>
              <button className="btn-secondary" onClick={() => onEdit(o)}>
                <Pencil size={15} /> Edit
              </button>
              {o.paymentStatus !== 'paid' && o.status !== 'cancelled' && (
                <button className="btn-primary" onClick={() => setPay(true)}>
                  <IndianRupee size={15} /> Record payment
                </button>
              )}
            </>
          )
        }
      >
        {!o ? (
          <Loading />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-stone-900">{o.customerName}</p>
                <p className="text-sm text-stone-500">{[o.customerPhone, o.customerEmail].filter(Boolean).join(' · ') || 'No contact saved'}</p>
                {o.customerAddress && <p className="text-sm text-stone-500">{o.customerAddress}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm text-stone-500">{fmtDate(o.date)}</p>
                <div className="mt-1 flex gap-1.5">
                  <Badge tone={o.status}>{o.status}</Badge>
                  <Badge tone={o.paymentStatus}>{o.paymentStatus}</Badge>
                </div>
              </div>
            </div>

            <div className="-mx-5">
              <Table head={<><th className="th">Product</th><th className="th text-right">Qty</th><th className="th text-right">Price</th><th className="th text-right">Amount</th></>}>
                {o.items.map((i) => (
                  <tr key={String(i.product)}>
                    <td className="td">{i.name}</td>
                    <td className="td num text-right">{i.quantity}</td>
                    <td className="td num text-right">{inr(i.price)}</td>
                    <td className="td num text-right font-medium">{inr(i.quantity * i.price)}</td>
                  </tr>
                ))}
              </Table>
            </div>

            <div className="num ml-auto max-w-xs space-y-1.5 text-sm">
              <Row label="Subtotal" value={inr(o.subtotal)} />
              {o.discount > 0 && <Row label="Discount" value={`− ${inr(o.discount)}`} />}
              {o.shipping > 0 && <Row label="Shipping" value={`+ ${inr(o.shipping)}`} />}
              <Row label={<b className="text-stone-900">Total</b>} value={<b className="text-stone-900">{inr(o.total)}</b>} />
              <Row label="Received" value={<span className="text-emerald-700">{inr(o.amountPaid)}</span>} />
              <Row label="Due" value={<span className={o.total - o.amountPaid > 0 ? 'font-semibold text-red-600' : ''}>{inr(Math.max(0, o.total - o.amountPaid))}</span>} />
              <Row label="Profit (after product cost)" value={inr(o.total - o.costTotal)} muted />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-stone-900">Payments</p>
              {d.payments.length === 0 ? (
                <p className="text-sm text-stone-500">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                  {d.payments.map((p) => (
                    <li key={p._id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <p className="num font-medium text-stone-800">{inr(p.amount)} <span className="text-xs font-normal uppercase text-stone-500">{p.method}</span></p>
                        <p className="text-xs text-stone-500">
                          {fmtDate(p.date)} · received by {p.receivedBy.map((r) => r.name).join(', ') || '—'}
                        </p>
                      </div>
                      {p.confirmed ? <Badge tone="paid">verified</Badge> : <Badge tone="partial">not verified</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {o.notes && <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">📝 {o.notes}</p>}
          </div>
        )}
      </Modal>
      {pay && o && (
        <PaymentModal
          order={o}
          onClose={() => setPay(false)}
          onSaved={() => {
            setPay(false);
            load();
            onChanged();
          }}
        />
      )}
    </>
  );
}
