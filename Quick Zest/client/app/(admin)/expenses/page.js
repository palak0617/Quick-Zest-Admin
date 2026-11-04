'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, ArrowUpRight, Pencil, Trash2, Tags } from 'lucide-react';
import { api } from '@/lib/api';
import { inr, fmtDate, monthStart, toInputDate, METHODS } from '@/lib/format';
import { PageHeader, Stat, Loading, Empty, Modal, Field, Table, useToast, confirmAction } from '@/components/ui';

const COLORS = ['#d97706', '#0891b2', '#7c3aed', '#475569', '#db2777', '#059669', '#2563eb', '#dc2626', '#65a30d'];

export default function ExpensesPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [filters, setFilters] = useState({ search: '', from: monthStart(), to: '', category: '' });
  const [edit, setEdit] = useState(null);
  const [newCat, setNewCat] = useState('');

  const load = useCallback(() => api('/expenses', { query: filters }).then(setData).catch((e) => toast(e.message, 'error')), [filters, toast]);
  const loadCats = useCallback(() => api('/expenses/categories').then((d) => setCats(d.categories)), []);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    loadCats();
  }, [loadCats]);
  const refresh = () => {
    load();
    loadCats();
  };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  const remove = async (x) => {
    if (!confirmAction(`Delete "${x.title}" (${inr(x.amount)})?`)) return;
    await api(`/expenses/${x._id}`, { method: 'DELETE' });
    toast('Expense deleted');
    refresh();
  };

  const addCat = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      await api('/expenses/categories', { method: 'POST', body: { name: newCat.trim(), color: COLORS[cats.length % COLORS.length] } });
      setNewCat('');
      loadCats();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const renameCat = async (c) => {
    const name = window.prompt('Rename category', c.name);
    if (!name || name === c.name) return;
    await api(`/expenses/categories/${c._id}`, { method: 'PUT', body: { name } }).catch((e) => toast(e.message, 'error'));
    refresh();
  };
  const deleteCat = async (c) => {
    if (!confirmAction(`Delete category "${c.name}"? Its expenses become Uncategorised.`)) return;
    await api(`/expenses/categories/${c._id}`, { method: 'DELETE' });
    refresh();
  };

  const s = data?.summary;
  const breakdown = s ? Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]) : [];
  const colorOf = (name) => cats.find((c) => c.name === name)?.color || '#a8a29e';

  return (
    <>
      <PageHeader
        title="Money Out"
        subtitle="Everything Quick Zest spends — raw materials, packaging, salaries, rent and more."
        actions={
          <button className="btn-primary" onClick={() => setEdit({})}>
            <Plus size={16} /> Add expense
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          {s && (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Spent in period" value={inr(s.total)} tone="red" />
              <Stat label="Entries" value={s.count} hint={breakdown[0] ? `Biggest: ${breakdown[0][0]}` : undefined} />
            </div>
          )}

          {breakdown.length > 0 && (
            <div className="card p-5">
              <p className="mb-3 text-sm font-semibold text-stone-900">Where the money went</p>
              <div className="flex h-3 overflow-hidden rounded-full bg-stone-100">
                {breakdown.map(([name, amt]) => (
                  <div key={name} style={{ width: `${(amt / s.total) * 100}%`, background: colorOf(name) }} title={`${name}: ${inr(amt)}`} />
                ))}
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {breakdown.map(([name, amt]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-stone-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(name) }} />
                      {name}
                    </span>
                    <span className="num font-medium text-stone-800">
                      {inr(amt)} <span className="text-xs text-stone-400">{Math.round((amt / s.total) * 100)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="grid gap-2 border-b border-stone-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input className="input pl-9" placeholder="Search" value={filters.search} onChange={setFilter('search')} />
              </div>
              <select className="input" value={filters.category} onChange={setFilter('category')}>
                <option value="">All categories</option>
                {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <input className="input" type="date" value={filters.from} onChange={setFilter('from')} title="From" />
              <input className="input" type="date" value={filters.to} onChange={setFilter('to')} title="To" />
            </div>
            {!data ? (
              <Loading />
            ) : data.expenses.length === 0 ? (
              <Empty icon={ArrowUpRight} title="No expenses in this period" text="Add spending as it happens so profit stays accurate." />
            ) : (
              <Table head={<><th className="th">Expense</th><th className="th">Category</th><th className="th">Date</th><th className="th text-right">Amount</th><th className="th">Paid via</th><th className="th" /></>}>
                {data.expenses.map((x) => (
                  <tr key={x._id} className="hover:bg-stone-50/60">
                    <td className="td">
                      <p className="font-medium text-stone-800">{x.title}</p>
                      {x.paidTo && <p className="text-xs text-stone-500">to {x.paidTo}</p>}
                    </td>
                    <td className="td">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
                        <span className="h-2 w-2 rounded-full" style={{ background: x.category?.color || '#a8a29e' }} />
                        {x.category?.name || 'Uncategorised'}
                      </span>
                    </td>
                    <td className="td">{fmtDate(x.date)}</td>
                    <td className="td num text-right font-semibold text-red-600">{inr(x.amount)}</td>
                    <td className="td text-xs font-medium uppercase text-stone-500">{x.method}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2" onClick={() => setEdit(x)} title="Edit"><Pencil size={15} /></button>
                        <button className="btn-ghost px-2 text-red-500 hover:bg-red-50" onClick={() => remove(x)} title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>

        <aside className="card h-fit p-5">
          <h2 className="flex items-center gap-2 font-semibold text-stone-900">
            <Tags size={16} className="text-stone-400" /> Spending categories
          </h2>
          <p className="mt-1 text-xs text-stone-500">All-time total per category.</p>
          <ul className="mt-3 divide-y divide-stone-100">
            {cats.map((c) => (
              <li key={c._id} className="flex items-center justify-between py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-800">
                  <input
                    type="color"
                    value={c.color}
                    onChange={(e) => api(`/expenses/categories/${c._id}`, { method: 'PUT', body: { color: e.target.value } }).then(loadCats)}
                    className="h-4 w-4 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                    title="Change colour"
                  />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="num text-sm text-stone-700">{inr(c.total)}</span>
                  <button className="rounded p-1 text-stone-300 hover:text-stone-600" onClick={() => renameCat(c)} title="Rename"><Pencil size={13} /></button>
                  <button className="rounded p-1 text-stone-300 hover:text-red-600" onClick={() => deleteCat(c)} title="Delete"><Trash2 size={13} /></button>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={addCat} className="mt-3 flex gap-2">
            <input className="input" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="btn-secondary px-3" aria-label="Add category"><Plus size={16} /></button>
          </form>
        </aside>
      </div>

      {edit && <ExpenseModal expense={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </>
  );
}

function ExpenseModal({ expense, cats, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !expense._id;
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    title: expense.title || '',
    category: expense.category?._id || expense.category || '',
    amount: expense.amount ?? '',
    date: toInputDate(expense.date || new Date()),
    paidTo: expense.paidTo || '',
    method: expense.method || 'upi',
    notes: expense.notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, amount: Number(f.amount) };
      if (isNew) await api('/expenses', { method: 'POST', body });
      else await api(`/expenses/${expense._id}`, { method: 'PUT', body });
      toast(isNew ? 'Expense added' : 'Expense updated');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add expense' : 'Edit expense'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="expense-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="expense-form" onSubmit={save} className="grid grid-cols-2 gap-3">
        <Field label="What was it for? *" className="col-span-2">
          <input className="input" required autoFocus value={f.title} onChange={set('title')} placeholder="e.g. Spices from wholesaler" />
        </Field>
        <Field label="Amount (₹) *">
          <input className="input num" type="number" min="0.01" step="0.01" required value={f.amount} onChange={set('amount')} />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={f.date} onChange={set('date')} />
        </Field>
        <Field label="Category">
          <select className="input" value={f.category} onChange={set('category')}>
            <option value="">Uncategorised</option>
            {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Paid via">
          <select className="input" value={f.method} onChange={set('method')}>
            {METHODS.map((m) => <option key={m} value={m}>{m === 'upi' ? 'UPI' : m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Paid to" className="col-span-2">
          <input className="input" value={f.paidTo} onChange={set('paidTo')} placeholder="Vendor / person" />
        </Field>
        <Field label="Notes" className="col-span-2">
          <input className="input" value={f.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
