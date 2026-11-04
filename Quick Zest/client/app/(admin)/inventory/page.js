'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Package, ArrowDownToLine, ArrowUpFromLine, Pencil, Trash2, History, ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { inr, num, fmtDate } from '@/lib/format';
import { PageHeader, Stat, Badge, Loading, Empty, Modal, Field, Table, useToast, confirmAction } from '@/components/ui';

const BLANK = { name: '', sku: '', category: 'Premix', unit: 'packets', packSize: '', quantity: 0, reorderLevel: 10, costPrice: 0, sellingPrice: 0 };

export default function InventoryPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [edit, setEdit] = useState(null); // product being added/edited
  const [stock, setStock] = useState(null); // { product, type }
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('low')) setLowOnly(true);
  }, []);

  const load = useCallback(() => {
    api('/inventory', { query: { search, category, lowStock: lowOnly ? 'true' : '' } })
      .then(setData)
      .catch((e) => toast(e.message, 'error'));
  }, [search, category, lowOnly, toast]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const remove = async (p) => {
    if (!confirmAction(`Delete "${p.name}"? Products used in orders are archived instead.`)) return;
    try {
      const r = await api(`/inventory/${p._id}`, { method: 'DELETE' });
      toast(r.message || 'Product deleted');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const s = data?.summary;
  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Every stock change is logged. Orders take stock out automatically."
        actions={
          <button className="btn-primary" onClick={() => setEdit(BLANK)}>
            <Plus size={16} /> Add product
          </button>
        }
      />

      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Products" value={num(s.totalProducts)} />
          <Stat label="Units in stock" value={num(s.totalUnits)} />
          <Stat label="Stock value (cost)" value={inr(s.stockValue)} hint={`${inr(s.retailValue)} at selling price`} />
          <Stat label="Low / out of stock" value={`${s.lowStock} / ${s.outOfStock}`} tone={s.lowStock ? 'red' : 'default'} />
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-2 border-b border-stone-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input pl-9" placeholder="Search name, SKU or category" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input sm:w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-stone-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Low stock only
          </label>
        </div>

        {!data ? (
          <Loading />
        ) : data.products.length === 0 ? (
          <Empty icon={Package} title="No products found" text="Add your premixes and raw materials to start tracking stock." action={<button className="btn-primary" onClick={() => setEdit(BLANK)}><Plus size={16} /> Add product</button>} />
        ) : (
          <Table
            head={
              <>
                <th className="th">Product</th>
                <th className="th text-right">In stock</th>
                <th className="th text-right">Cost</th>
                <th className="th text-right">Price</th>
                <th className="th text-right">Stock value</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </>
            }
          >
            {data.products.map((p) => {
              const low = p.quantity <= p.reorderLevel;
              return (
                <tr key={p._id} className="hover:bg-stone-50/60">
                  <td className="td">
                    <p className="font-medium text-stone-900">{p.name}</p>
                    <p className="text-xs text-stone-500">
                      {[p.sku, p.category, p.packSize].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="td num text-right">
                    <span className={`text-base font-semibold ${low ? 'text-red-600' : 'text-stone-900'}`}>{num(p.quantity)}</span>{' '}
                    <span className="text-xs text-stone-500">{p.unit}</span>
                  </td>
                  <td className="td num text-right">{inr(p.costPrice)}</td>
                  <td className="td num text-right">{inr(p.sellingPrice)}</td>
                  <td className="td num text-right">{inr(p.quantity * p.costPrice)}</td>
                  <td className="td">
                    {p.quantity === 0 ? <Badge tone="low">Out of stock</Badge> : low ? <Badge tone="low">Low · reorder</Badge> : <Badge tone="ok">In stock</Badge>}
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setStock({ product: p, type: 'in' })} title="Add stock">
                        <ArrowDownToLine size={14} /> In
                      </button>
                      <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setStock({ product: p, type: 'out' })} title="Remove stock">
                        <ArrowUpFromLine size={14} /> Out
                      </button>
                      <button className="btn-ghost px-2" onClick={() => setStock({ product: p, type: 'adjust' })} title="Set exact count">
                        <ClipboardCheck size={15} />
                      </button>
                      <button className="btn-ghost px-2" onClick={() => setHistory(p)} title="Stock history">
                        <History size={15} />
                      </button>
                      <button className="btn-ghost px-2" onClick={() => setEdit(p)} title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button className="btn-ghost px-2 text-red-500 hover:bg-red-50" onClick={() => remove(p)} title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      {edit && <ProductModal product={edit} categories={data?.categories || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {stock && <StockModal {...stock} onClose={() => setStock(null)} onSaved={() => { setStock(null); load(); }} />}
      {history && <HistoryModal product={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function ProductModal({ product, categories, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !product._id;
  const [f, setF] = useState({ ...BLANK, ...product });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, costPrice: Number(f.costPrice), sellingPrice: Number(f.sellingPrice), reorderLevel: Number(f.reorderLevel), quantity: Number(f.quantity) };
      if (isNew) await api('/inventory', { method: 'POST', body });
      else await api(`/inventory/${product._id}`, { method: 'PUT', body });
      toast(isNew ? 'Product added' : 'Product updated');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  const margin = Number(f.sellingPrice) - Number(f.costPrice);
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add product' : `Edit ${product.name}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="product-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="product-form" onSubmit={save} className="grid grid-cols-2 gap-3">
        <Field label="Product name *" className="col-span-2">
          <input className="input" required autoFocus value={f.name} onChange={set('name')} placeholder="e.g. Pasta Premix" />
        </Field>
        <Field label="SKU / code">
          <input className="input" value={f.sku} onChange={set('sku')} placeholder="QZ-PAS" />
        </Field>
        <Field label="Category">
          <input className="input" list="cats" value={f.category} onChange={set('category')} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Unit">
          <select className="input" value={f.unit} onChange={set('unit')}>
            {['packets', 'pieces', 'boxes', 'kg', 'g', 'litres', 'cartons'].map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Pack size">
          <input className="input" value={f.packSize} onChange={set('packSize')} placeholder="50 g" />
        </Field>
        {isNew && (
          <Field label="Opening stock">
            <input className="input" type="number" min="0" value={f.quantity} onChange={set('quantity')} />
          </Field>
        )}
        <Field label="Low-stock alert at">
          <input className="input" type="number" min="0" value={f.reorderLevel} onChange={set('reorderLevel')} />
        </Field>
        <Field label="Cost price (₹ per unit)">
          <input className="input" type="number" min="0" step="0.01" value={f.costPrice} onChange={set('costPrice')} />
        </Field>
        <Field label="Selling price (₹ per unit)">
          <input className="input" type="number" min="0" step="0.01" value={f.sellingPrice} onChange={set('sellingPrice')} />
        </Field>
        <p className="col-span-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
          Profit per unit: <span className={`num font-semibold ${margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{inr(margin)}</span>
          {Number(f.sellingPrice) > 0 && ` (${Math.round((margin / Number(f.sellingPrice)) * 100)}% margin)`}
          {!isNew && ' · To change the quantity, use Stock In / Out so it is logged.'}
        </p>
      </form>
    </Modal>
  );
}

function StockModal({ product, type, onClose, onSaved }) {
  const toast = useToast();
  const [qty, setQty] = useState(type === 'adjust' ? product.quantity : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const titles = { in: 'Add stock', out: 'Remove stock', adjust: 'Set exact count' };
  const q = Number(qty) || 0;
  const after = type === 'in' ? product.quantity + q : type === 'out' ? product.quantity - q : q;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/inventory/${product._id}/stock`, { method: 'POST', body: { type, quantity: Number(qty), note } });
      toast(`${product.name}: now ${after} ${product.unit}`);
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`${titles[type]} · ${product.name}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="stock-form" disabled={busy || after < 0 || qty === ''}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="stock-form" onSubmit={save} className="space-y-3">
        <Field label={type === 'adjust' ? `Actual count on shelf (${product.unit})` : `Quantity (${product.unit})`}>
          <input className="input num text-lg" type="number" min="0" required autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={type === 'in' ? 'e.g. Production batch #12' : type === 'out' ? 'e.g. Samples, damaged' : 'e.g. Monthly stock count'}
          />
        </Field>
        <div className="num flex justify-between rounded-lg bg-stone-50 px-3 py-2.5 text-sm">
          <span className="text-stone-500">Now: {num(product.quantity)}</span>
          <span className={`font-semibold ${after < 0 ? 'text-red-600' : 'text-stone-900'}`}>After: {num(after)} {product.unit}</span>
        </div>
      </form>
    </Modal>
  );
}

function HistoryModal({ product, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api(`/inventory/${product._id}`).then((d) => setRows(d.movements));
  }, [product._id]);
  const LABEL = { in: 'Stock in', out: 'Stock out', adjust: 'Count correction', order: 'Order', 'order-cancel': 'Order reversed' };
  return (
    <Modal open size="lg" onClose={onClose} title={`Stock history · ${product.name}`}>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500">No movements yet.</p>
      ) : (
        <div className="-mx-5">
          <Table head={<><th className="th">Date</th><th className="th">Type</th><th className="th text-right">Change</th><th className="th text-right">Balance</th><th className="th">Note</th></>}>
            {rows.map((m) => (
              <tr key={m._id}>
                <td className="td">{fmtDate(m.date)}</td>
                <td className="td">{LABEL[m.type]}</td>
                <td className={`td num text-right font-semibold ${m.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {m.quantity > 0 ? '+' : ''}
                  {num(m.quantity)}
                </td>
                <td className="td num text-right">{num(m.balanceAfter)}</td>
                <td className="td max-w-[220px] truncate text-stone-500">{m.note || '—'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  );
}
