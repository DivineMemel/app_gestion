'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Save,
  MessageCircle,
  Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Appointment, Category, Client, MessageRow } from '@/lib/types';

function initials(name?: string | null, phone?: string) {
  if (name) {
    return name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  if (phone) return phone.slice(-2);
  return '?';
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [categories, setCategories] = useState<Map<string, Category>>(new Map());
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: msgs }, { data: app }, { data: cats }] =
        await Promise.all([
          supabase.from('clients').select('*').eq('id', id).maybeSingle(),
          supabase
            .from('messages')
            .select('*')
            .eq('client_id', id)
            .order('received_at', { ascending: false })
            .limit(50),
          supabase
            .from('appointments')
            .select('*')
            .eq('client_id', id)
            .order('scheduled_at', { ascending: false }),
          supabase.from('categories').select('*'),
        ]);
      const cl = c as Client | null;
      setClient(cl);
      setName(cl?.name || '');
      setNotes(cl?.notes || '');
      setMessages((msgs as MessageRow[]) || []);
      setAppointments((app as Appointment[]) || []);
      setCategories(new Map(((cats as Category[]) || []).map((x) => [x.id, x])));
    })();
  }, [id]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .update({
        name: name.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', id);
    setSaving(false);
    if (!error) {
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    }
  }

  if (!client) {
    return (
      <div className="surface h-32 animate-pulse rounded-xl" />
    );
  }

  const phone = client.phone.replace('@s.whatsapp.net', '');

  return (
    <div className="space-y-5">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-[rgb(var(--fg))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Tous les clients
      </Link>

      <div className="surface relative overflow-hidden rounded-2xl p-5">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-500/10 blur-2xl" />
        <div className="relative flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-base font-semibold text-white">
            {initials(client.name, phone)}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`+${phone}`}
              className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted"
            />
            <div className="mt-1 flex items-center gap-3 text-xs text-muted">
              <span className="font-mono">+{phone}</span>
              <a
                href={`https://wa.me/${phone}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-[rgb(var(--fg))]"
              >
                Envoyer un message
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="mt-3 flex gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" />
                {messages.length} message{messages.length > 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {appointments.length} RDV
              </span>
            </div>
          </div>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes sur ce client (préférences, adresse, infos utiles…)"
          rows={3}
          className="input mt-4 resize-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {savedTick && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              Enregistré ✓
            </span>
          )}
          <button onClick={save} disabled={saving} className="btn-primary text-xs">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {appointments.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Rendez-vous</h2>
          <ul className="space-y-2">
            {appointments.map((a) => {
              const t = new Date(a.scheduled_at);
              const cat = a.category_id ? categories.get(a.category_id) : null;
              return (
                <li key={a.id} className="surface rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: cat?.color || '#6366f1' }}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{a.title}</div>
                      <div className="text-xs text-muted">
                        {t.toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: '2-digit',
                          month: 'long',
                        })}
                        {' · '}
                        {t.toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      {a.address && (
                        <div className="mt-1 text-xs text-muted">📍 {a.address}</div>
                      )}
                    </div>
                    <span
                      className={`chip ${
                        a.status === 'confirme'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
                          : a.status === 'fait'
                          ? 'surface-2 text-muted'
                          : a.status === 'annule'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200'
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">
          Historique des messages
        </h2>
        {messages.length === 0 ? (
          <div className="surface rounded-xl p-6 text-center text-xs text-muted">
            Aucun message reçu.
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => {
              const t = new Date(m.received_at);
              const cat = m.category_id ? categories.get(m.category_id) : null;
              return (
                <li key={m.id} className="surface rounded-xl p-3">
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span>
                      {t.toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                      })}{' '}
                      ·{' '}
                      {t.toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {cat && (
                      <span
                        className="chip text-white"
                        style={{ backgroundColor: cat.color }}
                      >
                        {cat.label}
                      </span>
                    )}
                  </div>
                  {m.ai_summary && (
                    <div className="mt-1 text-xs italic text-muted">
                      {m.ai_summary}
                    </div>
                  )}
                  {m.body && (
                    <div className="mt-1 whitespace-pre-wrap text-sm">{m.body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
