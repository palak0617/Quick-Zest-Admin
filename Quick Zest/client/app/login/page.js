'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Smartphone, ArrowLeft, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Logo } from '@/components/Shell';
import { SetupQr, BackupCodes, CodeInput } from '@/components/TwoFactor';

export default function LoginPage() {
  const router = useRouter();
  // password → (setup | code) → backup (first time only)
  const [step, setStep] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [pendingToken, setPendingToken] = useState('');
  const [setup, setSetup] = useState(null);
  const [backupCodes, setBackupCodes] = useState(null);
  const [backupLeft, setBackupLeft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false); // server reachable (free hosting may need to wake up)
  const [waking, setWaking] = useState(false);

  // Already signed in? Go straight to the dashboard. This call also wakes a sleeping server.
  useEffect(() => {
    const onWake = () => setWaking(true);
    window.addEventListener('qx-waking', onWake);
    api('/auth/me')
      .then(() => router.replace('/'))
      .catch((e) => {
        setReady(true);
        if (e.status !== 401) setError(`Can't reach the server right now (${e.message}). Try again in a minute.`);
      });
    return () => window.removeEventListener('qx-waking', onWake);
  }, [router]);

  const back = () => {
    setStep('password');
    setCode('');
    setUseBackup(false);
    setError('');
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      setPendingToken(d.pendingToken);
      setSetup(d.setup || null);
      setBackupLeft(d.backupLeft ?? null);
      setCode('');
      setStep(d.step);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api('/auth/verify', { method: 'POST', body: { pendingToken, code } });
      if (d.backupCodes) {
        setBackupCodes(d.backupCodes);
        setStep('backup');
        setBusy(false);
      } else {
        router.replace('/');
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const codeOk = useBackup ? code.replace(/[^a-z0-9]/gi, '').length === 10 : code.length === 6;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#ffefd4,_#f7f6f3_55%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <div className="card p-6 sm:p-7">
          {step === 'password' && (
            <form onSubmit={submitPassword} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold text-stone-900">Admin sign in</h1>
                <p className="mt-1 text-sm text-stone-500">Next you'll enter the code from the authenticator app on your phone.</p>
              </div>
              <label className="block">
                <span className="label">Email</span>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="input pl-9" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </label>
              <label className="block">
                <span className="label">Password</span>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="input pl-9" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </label>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button className="btn-primary w-full py-2.5" disabled={busy || !ready}>
                {!ready ? (waking ? 'Waking up server…' : 'Connecting…') : busy ? 'Checking…' : 'Continue'}
              </button>
              {!ready && waking && (
                <p className="text-center text-xs text-stone-500">The server sleeps when idle on free hosting — this can take up to a minute.</p>
              )}
            </form>
          )}

          {step === 'setup' && setup && (
            <form onSubmit={submitCode} className="space-y-4">
              <BackLink onClick={back} />
              <Heading icon={Smartphone} title="Link your phone" text="One-time setup. After this, every sign-in asks for the code from your phone." />
              <SetupQr setup={setup} />
              <CodeInput value={code} onChange={setCode} autoFocus={false} />
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button className="btn-primary w-full py-2.5" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'Confirm & sign in'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={submitCode} className="space-y-4">
              <BackLink onClick={back} />
              {useBackup ? (
                <>
                  <Heading icon={KeyRound} title="Use a backup code" text="Enter one of the backup codes you saved when you set up your phone." />
                  <input
                    className="input num py-3 text-center font-mono text-lg font-semibold tracking-widest"
                    autoFocus
                    placeholder="xxxxx-xxxxx"
                    value={code}
                    onChange={(e) => setCode(e.target.value.slice(0, 11))}
                  />
                </>
              ) : (
                <>
                  <Heading icon={Smartphone} title="Enter the code from your phone" text="Open Google / Microsoft Authenticator and type the 6-digit code for Quick Zest Admin." />
                  <CodeInput value={code} onChange={setCode} />
                </>
              )}
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button className="btn-primary w-full py-2.5" disabled={busy || !codeOk}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <p className="text-center text-sm text-stone-500">
                <button
                  type="button"
                  className="font-medium text-brand-700"
                  onClick={() => {
                    setUseBackup(!useBackup);
                    setCode('');
                    setError('');
                  }}
                >
                  {useBackup ? 'Use the app code instead' : "Don't have your phone? Use a backup code"}
                </button>
                {useBackup && backupLeft !== null && <span className="mt-1 block text-xs">{backupLeft} backup codes left</span>}
              </p>
            </form>
          )}

          {step === 'backup' && backupCodes && (
            <div className="space-y-4">
              <Heading icon={KeyRound} title="Phone linked ✓ Save your backup codes" />
              <BackupCodes codes={backupCodes} onDone={() => router.replace('/')} doneLabel="Go to dashboard" />
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-stone-400">Restricted area · Quick Zest staff only</p>
      </div>
    </div>
  );
}

function BackLink({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800">
      <ArrowLeft size={14} /> Back
    </button>
  );
}

function Heading({ icon: Icon, title, text }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-full bg-brand-50 p-2 text-brand-600">
        <Icon size={20} />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">{title}</h1>
        {text && <p className="mt-1 text-sm text-stone-500">{text}</p>}
      </div>
    </div>
  );
}
