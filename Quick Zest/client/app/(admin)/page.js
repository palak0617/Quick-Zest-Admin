'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight, TrendingUp, Clock, Package, AlertTriangle, ShoppingBag } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api } from '@/lib/api';
import { inr, num, fmtDate } from '@/lib/format';
import { PageHeader, Stat, Badge, Loading, Empty } from '@/components/ui';
import { useAdmin } from '@/components/Shell';
import { CHART, MoneyTooltip, compact } from '@/components/charts';

export default function Dashboard() {
  const admin = useAdmin();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/reports/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (error) return <p className="text-red-600">{error}</p>;
  if (!d) return <Loading />;

  const m = d.thisMonth;
  return (
    <>
      <PageHeader
        title={`${greet}, ${admin?.name?.split(' ')[0] || 'Admin'}`}
        subtitle={`Here's how Quick Zest is doing — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={
          <>
            <Link href="/orders?new=1" className="btn-primary">
              <ShoppingBag size={16} /> New order
            </Link>
            <Link href="/inventory" className="btn-secondary">
              <Package size={16} /> Update stock
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current balance" value={inr(d.allTime.balance)} icon={Wallet} tone="brand" hint="Opening + received − spent" />
        <Stat label="Money in · this month" value={inr(m.income)} icon={ArrowDownLeft} tone="green" hint={`${m.paymentsCount} payments`} />
        <Stat label="Money out · this month" value={inr(m.expenses)} icon={ArrowUpRight} tone="red" hint={`${m.expensesCount} expenses`} />
        <Stat
          label="Net profit · this month"
          value={inr(m.netProfit)}
          icon={TrendingUp}
          tone={m.netProfit >= 0 ? 'green' : 'red'}
          hint={`Gross margin on sales ${m.grossMargin}%`}
        />
        <Stat label="Orders · this month" value={num(m.ordersCount)} icon={ShoppingBag} hint={`${inr(m.sales)} in sales`} />
        <Stat label="Still to collect" value={inr(d.allTime.receivable)} icon={Clock} hint="Unpaid order amounts" />
        <Stat label="Units in stock" value={num(d.inventory.units)} icon={Package} hint={`${d.inventory.products} products`} />
        <Stat label="Stock value (at cost)" value={inr(d.inventory.value)} icon={Package} hint={`${d.lowStock.length} low on stock`} tone={d.lowStock.length ? 'red' : 'default'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-stone-900">Money in vs money out</h2>
              <p className="text-xs text-stone-500">Last 6 months · line shows net profit</p>
            </div>
            <Link href="/profit" className="text-xs font-medium text-brand-700 hover:underline">
              Full report →
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.months} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                <Tooltip content={<MoneyTooltip />} cursor={{ fill: '#f5f5f4' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Money in" fill={CHART.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expenses" name="Money out" fill={CHART.expenses} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line dataKey="netProfit" name="Net profit" stroke={CHART.profit} strokeWidth={2} dot={{ r: 3 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-stone-900">
              <AlertTriangle size={16} className="text-red-500" /> Low stock
            </h2>
            <Link href="/inventory?low=1" className="text-xs font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {d.lowStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">Everything is well stocked ✅</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {d.lowStock.slice(0, 6).map((p) => (
                <li key={p._id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-800">{p.name}</p>
                    <p className="text-xs text-stone-500">Reorder at {num(p.reorderLevel)}</p>
                  </div>
                  <span className="num text-sm font-semibold text-red-600">
                    {num(p.quantity)} <span className="text-xs font-normal text-stone-500">{p.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="font-semibold text-stone-900">Recent orders</h2>
            <Link href="/orders" className="text-xs font-medium text-brand-700 hover:underline">
              All orders →
            </Link>
          </div>
          {d.recentOrders.length === 0 ? (
            <Empty icon={ShoppingBag} title="No orders yet" />
          ) : (
            <ul className="mt-2 divide-y divide-stone-100">
              {d.recentOrders.map((o) => (
                <li key={o._id}>
                  <Link href={`/orders?open=${o._id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-800">{o.customerName}</p>
                      <p className="text-xs text-stone-500">
                        {o.orderNo} · {fmtDate(o.date)}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <Badge tone={o.status}>{o.status}</Badge>
                    </div>
                    <Badge tone={o.paymentStatus}>{o.paymentStatus}</Badge>
                    <span className="num w-20 text-right text-sm font-semibold text-stone-900">{inr(o.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-stone-900">Best sellers · this month</h2>
          {d.topProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">No sales this month yet.</p>
          ) : (
            <ul className="space-y-3">
              {d.topProducts.map((p) => {
                const max = d.topProducts[0].quantity || 1;
                return (
                  <li key={p._id}>
                    <div className="flex justify-between text-sm">
                      <span className="truncate font-medium text-stone-700">{p.name}</span>
                      <span className="num text-stone-500">{num(p.quantity)} sold</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-stone-100">
                      <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(p.quantity / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
