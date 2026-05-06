'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, MessageRow } from '@/lib/types';

const PRIORITY_LABELS: Record<number, { label: string; cls: string }> = {
  1: { label: 'Urgent', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200' },
  2: { label: 'Haute', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200' },
  3: { label: 'Moyenne', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200' },
  4: { label: 'Basse', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  5: { label: 'Faible', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

const INTENT_LABELS: Record<string, string> = {
  rdv: 'RDV',
  demande_info: 'Question',
  envoi_image: 'Image',
  autre: '—',
};

export function MessageCard({
  message,
  category,
  clientName,
}: {
  message: MessageRow;
  category?: Category;
  clientName?: string | null;
}) {
  const [status, setStatus] = useState(message.status);
  const phone = message.from_phone.replace('@s.whatsapp.net', '');
  const date = new Date(message.received_at);
  const hh = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dd = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  async function setStatusValue(next: MessageRow['status']) {
    setStatus(next);
    await supabase.from('messages').update({ status: next }).eq('id', message.id);
  }

  const prio = PRIORITY_LABELS[message.priority] || PRIORITY_LABELS[3];

  return (
    <article
      className={`rounded-xl border p-3 ${
        status === 'nouveau'
          ? 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
          : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 opacity-70'
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded-full ${prio.cls}`}>{prio.label}</span>
        {category && (
          <span
            className="px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: category.color }}
          >
            {category.label}
          </span>
        )}
        {message.intent && message.intent !== 'autre' && (
          <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800">
            {INTENT_LABELS[message.intent]}
          </span>
        )}
        {message.has_media && <span className="text-slate-500">📎 {message.media_type}</span>}
        <span className="ml-auto text-slate-400">
          {dd} · {hh}
        </span>
      </div>

      <div className="mt-2">
        <div className="font-medium text-sm">{clientName || phone}</div>
        {message.ai_summary && (
          <div className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 italic">
            {message.ai_summary}
          </div>
        )}
        {message.body && (
          <div className="text-sm text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-wrap">
            {message.body}
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-3 text-xs">
        {status !== 'traite' && (
          <button
            onClick={() => setStatusValue('traite')}
            className="px-3 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Traité
          </button>
        )}
        {status === 'nouveau' && (
          <button
            onClick={() => setStatusValue('lu')}
            className="px-3 py-1 rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300"
          >
            Lu
          </button>
        )}
        <a
          href={`https://wa.me/${phone}`}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1 rounded-md bg-green-600 text-white hover:bg-green-700"
        >
          Répondre WhatsApp
        </a>
      </div>
    </article>
  );
}
