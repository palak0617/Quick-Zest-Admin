'use client';

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api } from '@/lib/api';
import { inr, num, toInputDate } from '@/lib/format';
import { PageHeader, Stat, Loading, Table } from '@/components/ui';
import { CHART, MoneyTooltip, compact } from '@/components/charts';

function presetRange(key) {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  const r = {
    'this-month': [new Date(y, m, 1), n],
    'last-month': [new Date(y, m - 1, 1), new Date(y, m, 0)],
    'last-3': [new Date(y, m - 2, 1), n],
    // Indian financial year: April–March
    fy: [new Date(m >= 3 ? y : y - 1, 3, 1), n],
    all: [null, null],
  }[key];
  return { from: r[0] ? toInputDate(r[0]) : '', to: r[1] ? toInputDate(r[1]) : '' };
}

const PRESETS = [
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
  ['last-3', 'Last 3 months'],
  ['fy', 'This financial year'],
  ['all', 'All time'],
];

export default function ProfitPage() {
  const [preset, setPreset] = useState('this-month');
  const [range, setRange] = useState(presetRange('this-month'));
  const [d, setD] = useState(null);
  const [months, setMonths] = useState(null);

  useEffect(() => {
    setD(null);
    api('/reports/summary', { query: range }).then(setD);
  }, [range]);
  useEffect(() => {
    api('/reports/monthly', { query: { months: 12 } }).then((r) => setMonths(r.months));
  }, []);

  const choose = (k) => {
    setPreset(k);
    setRange(presetRange(k));
  };

  const totals = useMemo(
    () => months?.reduce((t, m) => ({ income: t.income + m.income, expenses: t.expenses + m.expenses, sales: t.sales + m.sales, gross: t.gross + m.grossProfit, orders: t.orders + m.orders }), { income: 0, expenses: 0, sales: 0, gross: 0, orders: 0 }),
    [months]
  );

  const s = d?.summary;
  return (
    <>
      <PageHeader title="Profit & Reports" subtitle="Calculated automatically from your orders, payments and expenses." />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => choose(k)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${preset === k ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-auto" type="date" value={range.from} onChange={(e) => { setPreset(''); setRange({ ...range, from: e.target.value }); }} />
          <span className="text-stone-400">→</span>
          <input className="input w-auto" type="date" value={range.to} onChange={(e) => { setPreset(''); setRange({ ...range, to: e.target.value }); }} />
        </div>
      </div>

      {!s ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Money received" value={inr(s.income)} tone="green" hint={`${s.paymentsCount} verified payments`} />
            <Stat label="Money spent" value={inr(s.expenses)} tone="red" hint={`${s.expensesCount} expenses`} />
            <Stat label="Net profit (cash)" value={inr(s.netProfit)} tone={s.netProfit >= 0 ? 'green' : 'red'} hint="Received − spent" />
            <Stat label="Current balance" value={inr(s.balance)} tone="brand" hint="All time, incl. opening balance" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="font-semibold text-stone-900">Profit on sales</h2>
              <p className="mb-4 text-xs text-stone-500">Based on orders placed in this period (cancelled orders excluded).</p>
              <dl className="num space-y-2.5 text-sm">
                <Line2 label={`Sales (${num(s.ordersCount)} orders)`} value={inr(s.sales)} />
                <Line2 label="Cost of products sold" value={`− ${inr(s.costOfGoods)}`} />
                <Line2 label="Gross profit" value={inr(s.grossProfit)} strong hint={`${s.grossMargin}% margin`} />
                <Line2 label="Expenses" value={`− ${inr(s.expenses)}`} />
                <div className="border-t border-stone-200 pt-2.5">
                  <Line2 label="Operating profit" value={inr(s.operatingProfit)} strong big tone={s.operatingProfit >= 0 ? 'text-emerald-700' : 'text-red-600'} />
                </div>
              </dl>
              <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
                Still to collect from customers (all time): <span className="font-semibold text-stone-700">{inr(s.receivable)}</span>
              </p>
            </div>

            <div className="card p-5">
              <h2 className="mb-4 font-semibold text-stone-900">Spending by category</h2>
              {d.expensesByCategory.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">No expenses in this period.</p>
              ) : (
                <ul className="space-y-3">
                  {d.expensesByCategory.map((c) => (
                    <li key={c.name}>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-700">{c.name}</span>
                        <span className="num font-medium text-stone-900">{inr(c.amount)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-stone-100">
                        <div className="h-1.5 rounded-full" style={{ width: `${(c.amount / Math.max(...d.expensesByCategory.map((x) => x.amount))) * 100}%`, background: c.color || '#a8a29e' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="px-5 pt-5 font-semibold text-stone-900">Products · sales & profit</h2>
              <div className="mt-3">
                <Table head={<><th className="th">Product</th><th className="th text-right">Sold</th><th className="th text-right">Sales</th><th className="th text-right">Profit</th></>}>
                  {d.topProducts.map((p) => (
                    <tr key={p._id}>
                      <td className="td">{p.name}</td>
                      <td className="td num text-right">{num(p.quantity)}</td>
                      <td className="td num text-right">{inr(p.revenue)}</td>
                      <td className="td num text-right font-medium text-emerald-700">{inr(p.profit)}</td>
                    </tr>
                  ))}
                  {d.topProducts.length === 0 && <tr><td className="td text-stone-500" colSpan={4}>No sales in this period.</td></tr>}
                </Table>
              </div>
            </div>
            <div className="card">
              <h2 className="px-5 pt-5 font-semibold text-stone-900">Top customers</h2>
              <div className="mt-3">
                <Table head={<><th className="th">Customer</th><th className="th text-right">Orders</th><th className="th text-right">Value</th></>}>
                  {d.topCustomers.map((c) => (
                    <tr key={c._id}>
                      <td className="td">{c.name}</td>
                      <td className="td num text-right">{c.orders}</td>
                      <td className="td num text-right font-medium">{inr(c.value)}</td>
                    </tr>
                  ))}
                  {d.topCustomers.length === 0 && <tr><td className="td text-stone-500" colSpan={3}>No orders in this period.</td></tr>}
                </Table>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card mt-6">
        <div className="px-5 pt-5">
          <h2 className="font-semibold text-stone-900">Month by month</h2>
          <p className="text-xs text-stone-500">Last 12 months</p>
        </div>
        {!months ? (
          <Loading />
        ) : (
          <>
            <div className="h-72 px-3 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={months} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: '#f5f5f4' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Money in" fill={CHART.income} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="expenses" name="Money out" fill={CHART.expenses} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Line dataKey="netProfit" name="Net profit" stroke={CHART.profit} strokeWidth={2} dot={{ r: 3 }} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4">
              <Table
                head={
                  <>
                    <th className="th">Month</th>
                    <th className="th text-right">Orders</th>
                    <th className="th text-right">Sales</th>
                    <th className="th text-right">Gross profit</th>
                    <th className="th text-right">Money in</th>
                    <th className="th text-right">Money out</th>
                    <th className="th text-right">Net profit</th>
                  </>
                }
              >
                {[...months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td className="td font-medium">{m.label}</td>
                    <td className="td num text-right">{m.orders}</td>
                    <td className="td num text-right">{inr(m.sales)}</td>
                    <td className="td num text-right">{inr(m.grossProfit)}</td>
                    <td className="td num text-right text-emerald-700">{inr(m.income)}</td>
                    <td className="td num text-right text-red-600">{inr(m.expenses)}</td>
                    <td className={`td num text-right font-semibold ${m.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{inr(m.netProfit)}</td>
                  </tr>
                ))}
                <tr className="bg-stone-50 font-semibold">
                  <td className="td">12-month total</td>
                  <td className="td num text-right">{totals.orders}</td>
                  <td className="td num text-right">{inr(totals.sales)}</td>
                  <td className="td num text-right">{inr(totals.gross)}</td>
                  <td className="td num text-right text-emerald-700">{inr(totals.income)}</td>
                  <td className="td num text-right text-red-600">{inr(totals.expenses)}</td>
                  <td className={`td num text-right ${totals.income - totals.expenses >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{inr(totals.income - totals.expenses)}</td>
                </tr>
              </Table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Line2({ label, value, strong, big, hint, tone = 'text-stone-900' }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={strong ? 'font-medium text-stone-800' : 'text-stone-600'}>
        {label}
        {hint && <span className="ml-2 text-xs text-stone-400">{hint}</span>}
      </dt>
      <dd className={`${strong ? 'font-semibold' : ''} ${big ? 'text-lg' : ''} ${strong ? tone : 'text-stone-700'}`}>{value}</dd>
    </div>
  );
}
