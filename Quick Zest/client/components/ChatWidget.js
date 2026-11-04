'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

const SUGGESTIONS = [
  'How many packets of pasta premix are there?',
  'Which items are low on stock?',
  "What's our profit this month?",
  'Who still has to pay?',
  'How much did we spend last month?',
  "What's our current balance?",
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! Ask me anything about stock, orders, payments, spending or profit — I answer from your live data." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    const history = messages.slice(1);
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setBusy(true);
    try {
      const { reply } = await api('/chat', { method: 'POST', body: { message: q, history } });
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry — ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-stone-900 py-3 pl-4 pr-5 text-sm font-medium text-white shadow-xl transition hover:bg-stone-800"
        >
          <MessageCircle size={18} /> Ask Quick Zest
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[560px] sm:w-[380px] sm:rounded-2xl sm:border sm:border-stone-200 sm:shadow-2xl">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900">Quick Zest Assistant</p>
                <p className="text-[11px] text-stone-500">Answers from your live data</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100" aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-stone-100 text-stone-800'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-1 px-2">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-stone-300" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            )}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600 hover:border-brand-300 hover:bg-brand-50">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-stone-100 p-3"
          >
            <input className="input" placeholder="Ask about stock, orders, money…" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
            <button className="btn-primary px-3" disabled={busy || !input.trim()} aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
