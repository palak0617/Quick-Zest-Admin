'use client';

import { useState } from 'react';
import { Copy, Download, Check } from 'lucide-react';

/** QR code + typed key for linking an authenticator app */
export function SetupQr({ setup }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
        <li>
          Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone (free on Play Store / App Store).
        </li>
        <li>In the app tap <b>+</b> → <b>Scan a QR code</b>, and scan this:</li>
      </ol>
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-lg border border-stone-200 bg-white p-2" />
      </div>
      <details className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
        <summary className="cursor-pointer font-medium">Can't scan? Enter this key instead</summary>
        <div className="mt-2 flex items-center gap-2">
          <code className="num flex-1 break-all font-semibold tracking-wider text-stone-800">{setup.secret}</code>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => {
              navigator.clipboard?.writeText(setup.secret.replace(/\s/g, ''));
              setCopied(true);
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <p className="mt-1">Choose "Time based". Account name: Quick Zest Admin.</p>
      </details>
      <p className="text-sm text-stone-600">
        <span className="font-medium">3.</span> Type the 6-digit code the app shows:
      </p>
    </div>
  );
}

/** One-time display of backup codes */
export function BackupCodes({ codes, onDone, doneLabel = 'I have saved these codes' }) {
  const [saved, setSaved] = useState(false);
  const text = `Quick Zest Admin — backup codes (each works once)\n\n${codes.join('\n')}\n`;
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'QuickZest-backup-codes.txt';
    a.click();
    setSaved(true);
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        If you lose your phone, sign in with one of these codes instead. <b>Each works once.</b> Keep them somewhere safe — they won't be shown again.
      </p>
      <div className="num grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-4 text-center font-mono text-sm font-semibold tracking-wider text-stone-800">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={download}>
          <Download size={15} /> Download
        </button>
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={() => {
            navigator.clipboard?.writeText(text);
            setSaved(true);
          }}
        >
          <Copy size={15} /> Copy
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I've saved my backup codes
      </label>
      <button type="button" className="btn-primary w-full py-2.5" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}

/** Big 6-digit input */
export function CodeInput({ value, onChange, autoFocus = true }) {
  return (
    <input
      className="input num py-3 text-center text-2xl font-semibold tracking-[0.6em]"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      autoFocus={autoFocus}
      placeholder="••••••"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  );
}
