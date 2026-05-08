import Groq from 'groq-sdk';
import { db } from './db.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export type Classification = {
  category_slug: string;
  intent: 'rdv' | 'demande_info' | 'envoi_image' | 'autre';
  priority: 1 | 2 | 3 | 4 | 5;
  summary: string;
  /** ISO 8601 datetime if a specific RDV date/time is detected, null otherwise */
  scheduled_at: string | null;
  /** Short title for the appointment (auto-generated) */
  rdv_title: string | null;
  /** Address if mentioned */
  address: string | null;
};

async function getCategoriesForPrompt() {
  const { data } = await db
    .from('categories')
    .select('slug, label, description')
    .eq('active', true);
  return data || [];
}

export async function classify(text: string, hasMedia: boolean): Promise<Classification> {
  const categories = await getCategoriesForPrompt();
  const catList = categories
    .map((c) => `- "${c.slug}" — ${c.label}: ${c.description || ''}`)
    .join('\n');

  const now = new Date();
  const todayStr = now.toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Abidjan',
  });

  const system = `Tu es l'assistant virtuel d'un entrepreneur basé à Abidjan, Côte d'Ivoire. Tu analyses les messages WhatsApp entrants pour les trier ET extraire les RDV automatiquement.

Aujourd'hui : ${todayStr} (${now.toISOString()}). Fuseau horaire : Africa/Abidjan (UTC+0, pas de DST).

Catégories disponibles :
${catList}

Tu retournes UNIQUEMENT un JSON valide :
{
  "category_slug": "<slug ci-dessus, 'autre' si rien ne matche>",
  "intent": "rdv" | "demande_info" | "envoi_image" | "autre",
  "priority": 1 (urgent/RDV concret) à 5 (faible),
  "summary": "<résumé en 1 phrase courte fr>",
  "scheduled_at": "<ISO 8601 datetime si date+heure mentionnés, sinon null>",
  "rdv_title": "<titre court du RDV, ex: 'Visite déco salon - Mariam', sinon null>",
  "address": "<adresse mentionnée, sinon null>"
}

Règles importantes pour scheduled_at :
- Ne renvoie une date QUE si le message contient une indication temporelle CLAIRE (date+heure, ou "demain à 14h", "lundi prochain matin", etc.)
- Si juste "demain matin" sans heure → null (ambigu)
- Convertis en ISO 8601 avec offset +00:00 (Abidjan = UTC+0). Ex : "demain 14h" → "2026-05-09T14:00:00+00:00"
- Si seulement une date sans heure précise mais avec créneau ("matin"=09:00, "après-midi"=14:00, "soir"=18:00), tu peux estimer
- Si aucune date claire → "scheduled_at": null

Règles intent :
- "rdv" si demande de visite/intervention/RDV
- "demande_info" si question/prix/dispo
- "envoi_image" si photo (souvent lieu à décorer)`;

  const user = `Message reçu${hasMedia ? ' (avec image jointe)' : ''} :\n"""\n${text || '(pas de texte)'}\n"""`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw) as Partial<Classification>;

  // Validate scheduled_at — must be a valid future-ish date
  let scheduled_at: string | null = null;
  if (parsed.scheduled_at) {
    const d = new Date(parsed.scheduled_at);
    if (!isNaN(d.getTime()) && d.getTime() > now.getTime() - 24 * 3600 * 1000) {
      scheduled_at = d.toISOString();
    }
  }

  return {
    category_slug: parsed.category_slug || 'autre',
    intent: (parsed.intent as Classification['intent']) || 'autre',
    priority: Math.min(5, Math.max(1, parsed.priority || 3)) as Classification['priority'],
    summary: parsed.summary || '',
    scheduled_at,
    rdv_title: parsed.rdv_title || null,
    address: parsed.address || null,
  };
}
