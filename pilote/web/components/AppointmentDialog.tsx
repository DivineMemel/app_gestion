'use client';
import { useEffect, useState } from 'react';
import { X, Trash2, Save, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Appointment, Category, Client } from '@/lib/types';

type Props = {
  appointment: Appointment | null;
  defaultDate?: Date;
  categories: Category[];
  clients: Client[];
  onClose: () => void;
};

function toLocalInput(d: Date) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function AppointmentDialog({
  appointment,
  defaultDate,
  categories,
  clients,
  onClose,
}: Props) {
  const isNew = !appointment;
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState(60);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Appointment['status']>('planifie');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (appointment) {
      setTitle(appointment.title);
      setClientId(appointment.client_id);
      setCategoryId(appointment.category_id || '');
      setScheduledAt(toLocalInput(new Date(appointment.scheduled_at)));
      setDuration(appointment.duration_minutes || 60);
      setAddress(appointment.address || '');
      setNotes(appointment.notes || '');
      setStatus(appointment.status);
    } else if (defaultDate) {
      setScheduledAt(toLocalInput(defaultDate));
    }
  }, [appointment, defaultDate]);

  async function save() {
    setBusy(true);
    const payload = {
      title: title.trim(),
      client_id: clientId || null,
      category_id: categoryId || null,
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_minutes: duration,
      address: address.trim() || null,
      notes: notes.trim() || null,
      status,
    };
    if (isNew) {
      await supabase.from('appointments').insert(payload);
    } else {
      await supabase.from('appointments').update(payload).eq('id', appointment!.id);
    }
    setBusy(false);
    onClose();
  }

  async function remove() {
    if (!appointment) return;
    if (!confirm('Supprimer ce rendez-vous ?')) return;
    setBusy(true);
    await supabase.from('appointments').delete().eq('id', appointment.id);
    setBusy(false);
    onClose();
  }

  const canSave = title.trim() && scheduledAt;
  const phone = clients
    .find((c) => c.id === clientId)
    ?.phone.replace('@s.whatsapp.net', '');

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/30 backdrop-blur-sm sm:place-items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface relative w-full max-w-lg overflow-hidden rounded-t-2xl sm:rounded-2xl animate-in"
      >
        <header className="flex items-center justify-between border-b border-[rgb(var(--border))] px-5 py-3">
          <div className="font-medium">
            {isNew ? 'Nouveau rendez-vous' : 'Modifier le rendez-vous'}
          </div>
          <button onClick={onClose} className="btn-ghost h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-muted">Titre</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Visite déco salon"
              className="input mt-1"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted">Date & heure</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="input mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Durée (min)</label>
              <input
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="input mt-1"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted">Client</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="input mt-1"
              >
                <option value="">— Aucun —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone.replace('@s.whatsapp.net', '')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Catégorie</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input mt-1"
              >
                <option value="">— Aucune —</option>
                {categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted">Adresse</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: 12 rue de la Paix"
              className="input mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input mt-1 resize-none"
            />
          </div>

          {!isNew && (
            <div>
              <label className="text-xs font-medium text-muted">Statut</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(['planifie', 'confirme', 'fait', 'annule'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`chip transition-colors ${
                      status === s
                        ? s === 'confirme'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
                          : s === 'fait'
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          : s === 'annule'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200'
                        : 'surface-2 text-muted'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 px-5 py-3">
          {!isNew ? (
            <button
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {phone && (
              <a
                href={`https://wa.me/${phone}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost text-xs"
              >
                WhatsApp
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              onClick={save}
              disabled={busy || !canSave}
              className="btn-primary"
            >
              <Save className="h-4 w-4" />
              {busy ? '…' : 'Enregistrer'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
