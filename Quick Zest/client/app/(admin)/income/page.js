'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, ArrowDownLeft, Pencil, Trash2, Users, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { inr, fmtDate, monthStart, METHODS } from '@/lib/format';
import { PageHeader, Stat, Badge, Loading, Empty, Table, useToast, confirmAction } from '@/components/ui';
import PaymentModal from '@/components/PaymentModal';

export default function IncomePage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [receivers, setReceivers] = useState([]);
  const [filters, setFilters] = useState({ search: '', from: monthStart(), to: '', receiver: '', method: '', confirmed: '' });
  const [edit, setEdit] = useState(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(() => {
    api('/payments', { query: filters }).then(setData).catch((e) => toast(e.message, 'error'));
  }, [filters, toast]);
  const loadReceivers = useCallback(() => api('/payments/receivers').then((d) => setReceivers(d.receivers)), []);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    loadReceivers();
  }, [loadReceivers]);

  const refresh = () => {
    load();
    loadReceivers();
  };
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  const toggleConfirmed = async (p) => {
    try {
      await api(`/payments/${p._id}`, { method: 'PUT', body: { confirmed: !p.confirmed } });
      toast(p.confirmed ? 'Marked as not verified' : 'Marked as received ✓');
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const remove = async (p) => {
    if (!confirmAction(`Delete this payment of ${inr(p.amount)}?`)) return;
    await api(`/payments/${p._id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    toast('Payment deleted');
    refresh();
  };

  const addReceiver = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api('/payments/receivers', { method: 'POST', body: { name: newName.trim() } });
      setNewName('');
      loadReceivers();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const renameReceiver = async (r) => {
    const name = window.prompt('Rename receiver', r.name);
    if (!name || name === r.name) return;
    await api(`/payments/receivers/${r._id}`, { method: 'PUT', body: { name } }).catch((e) => toast(e.message, 'error'));
    refresh();
  };

  const deleteReceiver = async (r) => {
    if (!confirmAction(`Remove "${r.name}"? Past payments stay, but won't show this name.`)) return;
    await api(`/payments/receivers/${r._id}`, { method: 'DELETE' });
    refresh();
  };

  const s = data?.summary;
  return (
    <>
      <PageHeader
        title="Money In"
        subtitle="Payments received from orders — and who received them."
        actions={
          <button className="btn-primary" onClick={() => setEdit({})}>
            <Plus size={16} /> Record payment
          </button>
        }
      />

      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Received & verified" value={inr(s.received)} tone="green" hint="Counts towards balance" />
          <Stat label="Not yet verified" value={inr(s.unconfirmed)} tone={s.unconfirmed ? 'brand' : 'default'} hint="Tick the box once money arrives" />
          <Stat label="Payments" value={s.count} hint="In selected period" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="card min-w-0">
          <div className="grid gap-2 border-b border-stone-100 p-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="relative sm:col-span-3 lg:col-span-2">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className="input pl-9" placeholder="Customer, order, UTR" value={filters.search} onChange={setFilter('search')} />
            </div>
            <input className="input" type="date" value={filters.from} onChange={setFilter('from')} title="From" />
            <input className="input" type="date" value={filters.to} onChange={setFilter('to')} title="To" />
            <select className="input" value={filters.receiver} onChange={setFilter('receiver')}>
              <option value="">Any receiver</option>
              {receivers.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
            <select className="input" value={filters.confirmed} onChange={setFilter('confirmed')}>
              <option value="">All</option>
              <option value="true">Verified</option>
              <option value="false">Not verified</option>
            </select>
          </div>

          {!data ? (
            <Loading />
          ) : data.payments.length === 0 ? (
            <Empty icon={ArrowDownLeft} title="No payments in this period" text="Record a payment when a customer pays, or change the dates above." />
          ) : (
            <Table
              head={
                <>
                  <th className="th">Received</th>
                  <th className="th">From</th>
                  <th className="th">Date</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Method</th>
                  <th className="th">Received by</th>
                  <th className="th" />
                </>
              }
            >
              {data.payments.map((p) => (
                <tr key={p._id} className="hover:bg-stone-50/60">
                  <td className="td">
                    <button
                      onClick={() => toggleConfirmed(p)}
                      className={`grid h-5 w-5 place-items-center rounded border transition ${p.confirmed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300 bg-white hover:border-brand-500'}`}
                      title={p.confirmed ? 'Verified — click to undo' : 'Click when money is received'}
                      aria-label="Toggle received"
                    >
                      {p.confirmed && <Check size={14} strokeWidth={3} />}
                    </button>
                  </td>
                  <td className="td">
                    <p className="font-medium text-stone-800">{p.customerName || '—'}</p>
                    {p.orderNo && <p className="text-xs text-stone-500">{p.orderNo}</p>}
                  </td>
                  <td className="td">{fmtDate(p.date)}</td>
                  <td className={`td num text-right font-semibold ${p.confirmed ? 'text-emerald-700' : 'text-stone-500'}`}>{inr(p.amount)}</td>
                  <td className="td">
                    <span className="text-xs font-medium uppercase text-stone-600">{p.method}</span>
                    {p.reference && <p className="max-w-[120px] truncate text-[11px] text-stone-400">{p.reference}</p>}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {p.receivedBy.length ? p.receivedBy.map((r) => <Badge key={r._id} tone="neutral">{r.name}</Badge>) : <span className="text-xs text-stone-400">Not set</span>}
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost px-2" onClick={() => setEdit(p)} title="Edit"><Pencil size={15} /></button>
                      <button className="btn-ghost px-2 text-red-500 hover:bg-red-50" onClick={() => remove(p)} title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <aside className="card h-fit p-5">
          <h2 className="flex items-center gap-2 font-semibold text-stone-900">
            <Users size={16} className="text-stone-400" /> Who receives money
          </h2>
          <p className="mt-1 text-xs text-stone-500">These appear as checkboxes when recording a payment. Totals are all-time, verified only.</p>
          <ul className="mt-3 divide-y divide-stone-100">
            {receivers.map((r) => (
              <li key={r._id} className="group flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800">{r.name}</p>
                  <p className="text-xs text-stone-500">{r.payments} payments</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="num text-sm font-semibold text-stone-900">{inr(r.totalReceived)}</span>
                  <button className="rounded p-1 text-stone-300 hover:text-stone-600" onClick={() => renameReceiver(r)} title="Rename"><Pencil size={13} /></button>
                  <button className="rounded p-1 text-stone-300 hover:text-red-600" onClick={() => deleteReceiver(r)} title="Remove"><Trash2 size={13} /></button>
                </div>
              </li>
            ))}
          </ul>
          <form onSubmit={addReceiver} className="mt-3 flex gap-2">
            <input className="input" placeholder="e.g. Cash box" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-secondary px-3" aria-label="Add receiver"><Plus size={16} /></button>
          </form>
        </aside>
      </div>

      {edit && <PaymentModal payment={edit._id ? edit : undefined} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </>
  );
}
