'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, Field, Loading, Modal, useToast } from '@/components/ui';
import { SetupQr, BackupCodes, CodeInput } from '@/components/TwoFactor';

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  useEffect(() => {
    api('/settings').then((d) => setS(d.settings));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      const d = await api('/settings', { method: 'PUT', body: s });
      setS(d.settings);
      toast('Settings saved');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast('New passwords do not match', 'error');
    try {
      await api('/auth/change-password', { method: 'POST', body: pw });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!s) return <Loading />;
  return (
    <>
      <PageHeader title="Settings" subtitle="Business details and account security." />
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={save} className="card space-y-4 p-5">
          <h2 className="font-semibold text-stone-900">Business</h2>
          <Field label="Business name">
            <input className="input" value={s.businessName} onChange={(e) => setS({ ...s, businessName: e.target.value })} />
          </Field>
          <Field label="Opening balance (₹)">
            <input className="input num" type="number" step="0.01" value={s.openingBalance} onChange={(e) => setS({ ...s, openingBalance: e.target.value })} />
            <span className="mt-1 block text-xs text-stone-500">Money you had before you started using this dashboard. Balance = opening + received − spent.</span>
          </Field>
          <Field label="Order number prefix">
            <input className="input" value={s.orderPrefix} onChange={(e) => setS({ ...s, orderPrefix: e.target.value.toUpperCase() })} maxLength={6} />
            <span className="mt-1 block text-xs text-stone-500">New orders will look like {s.orderPrefix}-00042.</span>
          </Field>
          <button className="btn-primary">Save</button>
        </form>

        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-stone-900">Security</h2>
          <TwoFactorPanel />
          <form onSubmit={changePw} className="space-y-4">
          <h3 className="pt-2 text-sm font-semibold text-stone-800">Change password</h3>
          <Field label="Current password">
            <input className="input" type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password (min 8 characters)">
            <input className="input" type="password" required minLength={8} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" required minLength={8} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <button className="btn-secondary">Change password</button>
          </form>
        </div>
      </div>
    </>
  );
}

/* ---------- Authenticator app management ---------- */
function TwoFactorPanel() {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [flow, setFlow] = useState(null); // 'change' | 'backup'
  const load = () => api('/auth/2fa').then(setInfo);
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <div className="flex items-start gap-3 text-sm">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-medium text-stone-800">Two-factor sign-in: authenticator app</p>
          <p className="text-stone-500">
            Every sign-in needs the 6-digit code from your phone.
            {info && (
              <span className={info.backupLeft <= 2 ? ' font-medium text-red-600' : ''}> {info.backupLeft} backup codes left.</span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={() => setFlow('change')}>
          <Smartphone size={14} /> Move to a new phone
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => setFlow('backup')}>
          <KeyRound size={14} /> New backup codes
        </button>
      </div>
      {flow && (
        <TwoFactorFlow
          kind={flow}
          onClose={() => {
            setFlow(null);
            load();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function TwoFactorFlow({ kind, onClose, toast }) {
  const [stage, setStage] = useState('confirm'); // confirm → (qr) → codes
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = (e) => {
    e.preventDefault();
    run(async () => {
      if (kind === 'change') {
        const d = await api('/auth/2fa/change/start', { method: 'POST', body: { password, code } });
        setSetup(d.setup);
        setCode('');
        setStage('qr');
      } else {
        const d = await api('/auth/2fa/backup-codes', { method: 'POST', body: { password, code } });
        setCodes(d.backupCodes);
        setStage('codes');
      }
    });
  };

  const confirmNewPhone = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await api('/auth/2fa/change/confirm', { method: 'POST', body: { code } });
      setCodes(d.backupCodes);
      setStage('codes');
      toast('New phone linked');
    });
  };

  const title = kind === 'change' ? 'Move sign-in codes to a new phone' : 'New backup codes';
  return (
    <Modal open size="sm" onClose={onClose} title={title}>
      {stage === 'confirm' && (
        <form onSubmit={confirm} className="space-y-3">
          <p className="text-sm text-stone-600">
            {kind === 'change'
              ? 'Confirm it\'s you with your password and a code from your current phone (or a backup code).'
              : 'Your old backup codes will stop working. Confirm with your password and a code from your phone.'}
          </p>
          <Field label="Password">
            <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Current code (or a backup code)">
            <input className="input num text-center font-semibold tracking-widest" required value={code} onChange={(e) => setCode(e.target.value.slice(0, 11))} placeholder="123456" />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
        </form>
      )}
      {stage === 'qr' && setup && (
        <form onSubmit={confirmNewPhone} className="space-y-3">
          <p className="text-sm font-medium text-stone-800">On your NEW phone:</p>
          <SetupQr setup={setup} />
          <CodeInput value={code} onChange={setCode} autoFocus={false} />
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Link new phone'}</button>
          <p className="text-xs text-stone-500">Your old phone keeps working until this step is done.</p>
        </form>
      )}
      {stage === 'codes' && codes && <BackupCodes codes={codes} onDone={onClose} doneLabel="Done" />}
    </Modal>
  );
}
