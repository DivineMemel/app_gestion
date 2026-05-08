'use client';
import { useState } from 'react';
import {
  Calendar as CalendarIcon,
  HelpCircle,
  Image as ImageIcon,
  MessageCircle,
  Check,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Category, MessageRow } from '@/lib/types';

const PRIORITY: Record<
  number,
  { label: string; bar: string; chip: string; ring?: string; glow?: string }
> = {
  1: {
    label: 'Urgent',
    bar: 'bg-gradient-to-b from-red-500 to-orange-500',
    chip: 'text-white shadow-[0_4px_14px_-2px_rgba(239,68,68,0.5)]',
    ring: 'ring-1 ring-red-500/40',
    glow: 'before:bg-gradient-to-br before:from-red-500/[0.08] before:to-orange-500/[0.04]',
  },
  2: {
    label: 'Haute',
    bar: 'bg-gradient-to-b from-orange-500 to-amber-500',
    chip: 'text-white shadow-[0_4px_14px_-2px_rgba(249,115,22,0.4)]',
  },
  3: {
    label: 'Moyenne',
    bar: 'bg-gradient-to-b from-amber-400 to-yellow-400',
    chip: 'text-white',
  },
  4: {
    label: 'Basse',
    bar: 'bg-slate-300 dark:bg-slate-600',
    chip: 'surface-2 text-muted',
  },
  5: {
    label: 'Faible',
    bar: 'bg-slate-200 dark:bg-slate-700',
    chip: 'surface-2 text-muted',
  },
};

const PRIORITY_GRAD: Record<number, string> = {
  1: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
  2: 'linear-gradient(135deg, #f97316 0%, #f59e0b 100%)',
  3: 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)',
  4: '',
  5: '',
};

const INTENT: Record<string, { label: string; Icon: typeof CalendarIcon }> = {
  rdv: { label: 'RDV', Icon: CalendarIcon },
  demande_info: { label: 'Question', Icon: HelpCircle },
  envoi_image: { label: 'Image', Icon: ImageIcon },
  autre: { label: '', Icon: MessageCircle },
};

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #ec4899)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #10b981, #14b8a6)',
  'linear-gradient(135deg, #f43f5e, #f97316)',
  'linear-gradient(135deg, #8b5cf6, #a855f7)',
  'linear-gradient(135deg, #f59e0b, #ec4899)',
  'linear-gradient(135deg, #0ea5e9, #6366f1)',
];

function avatarGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function initials(name?: string | null, phone?: string) {
  if (name) {
    return name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
  if (phone) return phone.slice(-2);
  return '?';
}

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
  // JID format: '225XXXXXXXX@s.whatsapp.net' (vrai numéro) ou 'XXXX@lid' (LID pseudonyme).
  // wa.me ne marche QUE avec un vrai numéro — on désactive le bouton pour les LID.
  const isRealPhone = message.from_phone.endsWith('@s.whatsapp.net');
  const phone = message.from_phone.split('@')[0];
  const date = new Date(message.received_at);
  const hh = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dd = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  async function setStatusValue(next: MessageRow['status']) {
    setStatus(next);
    await supabase.from('messages').update({ status: next }).eq('id', message.id);
  }

  const prio = PRIORITY[message.priority] || PRIORITY[3];
  const intent = message.intent ? INTENT[message.intent] : null;
  const isNew = status === 'nouveau';
  const isUrgent = message.priority <= 2 && isNew;
  const grad = avatarGradient(phone);

  return (
    <article
      className={`card-3d relative overflow-hidden animate-in ${
        !isNew ? 'opacity-65' : ''
      } ${isUrgent ? 'ring-1 ring-red-500/30' : ''}`}
    >
      {/* Soft urgent glow */}
      {isUrgent && (
        <div
          className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, #ef4444, transparent 70%)' }}
        />
      )}
      {/* Priority bar */}
      <div className={`absolute left-0 top-0 h-full w-[3px] ${prio.bar}`} />

      <div className="relative px-4 py-3.5 pl-5">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="grid h-10 w-10 place-items-center rounded-2xl text-[12px] font-semibold text-white"
              style={{
                background: grad,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 14px -4px rgba(15,23,42,0.25)',
              }}
            >
              {initials(clientName, phone)}
            </div>
            {isNew && (
              <span
                className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[rgb(var(--surface))]"
                style={{
                  background:
                    'linear-gradient(135deg, rgb(var(--primary)), #ec4899)',
                }}
              />
            )}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold tracking-tight">
                {clientName || (isRealPhone ? `+${phone}` : 'Contact WhatsApp')}
              </div>
              <span className="ml-auto shrink-0 text-[11px] text-muted tabular-nums">
                {dd} · {hh}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={`chip ${prio.chip}`}
                style={
                  PRIORITY_GRAD[message.priority]
                    ? { background: PRIORITY_GRAD[message.priority] }
                    : undefined
                }
              >
                {prio.label}
              </span>
              {category && (
                <span
                  className="chip text-white"
                  style={{
                    background: `linear-gradient(135deg, ${category.color}, ${category.color}cc)`,
                    boxShadow: `0 4px 14px -4px ${category.color}80`,
                  }}
                >
                  {category.label}
                </span>
              )}
              {intent && intent.label && (
                <span className="chip surface-2">
                  <intent.Icon className="h-3 w-3" />
                  {intent.label}
                </span>
              )}
              {message.has_media && (
                <span className="chip surface-2 text-muted">
                  <Paperclip className="h-3 w-3" />
                  {message.media_type}
                </span>
              )}
            </div>

            {message.ai_summary && (
              <p className="mt-2 flex items-start gap-1.5 text-sm leading-snug">
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[rgb(var(--accent))]" />
                <span className="italic">{message.ai_summary}</span>
              </p>
            )}
            {message.body && (
              <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted whitespace-pre-wrap">
                {message.body}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {status !== 'traite' && (
                <button
                  onClick={() => setStatusValue('traite')}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-medium text-white transition-all active:scale-[0.97]"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 14px -4px rgba(16,185,129,0.45)',
                  }}
                >
                  <Check className="h-3 w-3" />
                  Traité
                </button>
              )}
              {isNew && (
                <button
                  onClick={() => setStatusValue('lu')}
                  className="btn-ghost px-2.5 py-1 text-[11.5px]"
                >
                  Lu
                </button>
              )}
              {isRealPhone ? (
                <a
                  href={`https://wa.me/${phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-medium text-white transition-all active:scale-[0.97]"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 14px -4px rgba(34,197,94,0.45)',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                  </svg>
                  Répondre
                </a>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-medium text-muted surface-2 cursor-not-allowed"
                  title="Numéro masqué par WhatsApp (LID) — réponds depuis WhatsApp directement"
                >
                  Numéro masqué
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
