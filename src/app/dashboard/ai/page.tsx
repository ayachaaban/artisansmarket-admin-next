'use client';

import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Sparkles, Trash2, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Message = { role: 'user' | 'assistant'; content: string };

const AI_ENDPOINT = 'https://artisans-push.artisansmarket.workers.dev/ai';
const AI_AUTH = 'f59d5b3cb8b2c54a2fea349b000ffeede367b8d3f6f7997a21f453f10fe180cf';
const STORAGE_KEY = 'adminAiChat.next';

const SYSTEM_PROMPT = `You are the internal assistant for the admin dashboard of "Artisans Market", a mobile handmade-art marketplace. The user is a platform admin — moderation, dispute resolution, broadcasts, operations. They are NOT an end user.

DATA MODEL
- users (role, status, category, averageRating, payoutCard)
- posts (artistId, mediaType post|reel, status active|sold|removed|reported, price)
- orders (status pending|in_progress|shipping|delivered|cancelled, total, extensions, refundAmount)
- reports (status pending|reviewed), ratings (1-5 stars, comment)
- payouts, wallets, notifications, broadcasts

ORDER LIFECYCLE
pending → in_progress → shipping → delivered. Escrow holds funds; released to artist wallet at shipping.
Cancellation tiers: full_refund | small_penalty | mid_penalty | max_penalty. After "shipping" → no cancellation.
Extensions: max 3 OR +14 cumulative days; beyond that customer can cancel with no penalty.

STYLE
- 2-4 sentences, concise, operational.
- For moderation: lead with **Recommendation:** <action>, then **Why:** <one line>.
- Bullets only for lists. Bold key terms with **markdown**.`;

export default function AiPage() {
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(stored)) setHistory(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const next: Message[] = [...history, { role: 'user', content: text }];
    setHistory(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Push-Auth': AI_AUTH,
        },
        body: JSON.stringify({
          temperature: 0.4,
          max_tokens: 600,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...next],
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const data = await res.json();
      const reply =
        data?.choices?.[0]?.message?.content?.trim() || '(no reply)';
      setHistory([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach AI.');
    } finally {
      setSending(false);
    }
  }

  function clear() {
    if (!confirm('Clear chat history?')) return;
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="flex h-[calc(100vh)] flex-col px-8 py-8">
      <PageHeader title="AI Assistant" subtitle="Ask about orders, policies, moderation.">
        {history.length > 0 && (
          <Button variant="outline" size="sm" onClick={clear}>
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {history.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Sparkles className="h-6 w-6 text-slate-500" />
              </div>
              <p className="text-sm font-medium">How can I help?</p>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Ask about cancellation policy, recommend a moderation action on a report, or
                explain a status transition.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  'Recommend action for the latest pending report',
                  'How does cancellation refund work?',
                  'What is held in escrow right now?',
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            history.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-3',
                  m.role === 'user' && 'flex-row-reverse',
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    m.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'bg-amber-100 text-amber-700',
                  )}
                >
                  {m.role === 'user' ? (
                    <UserIcon className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={cn(
                    'max-w-2xl whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm',
                    m.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-800',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-slate-200 bg-slate-50 px-4 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask something… (Enter to send, Shift+Enter for newline)"
              className="block max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
