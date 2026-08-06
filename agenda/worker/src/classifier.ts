import Groq from 'groq-sdk/index.mjs';
import { db } from './db.js';
import { abidjanNowLabel, resolveWhen, type WhenSpec } from './datetime.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export type Classification = {
  category_slug: string;
  intent: 'rdv' | 'demande_info' | 'envoi_image' | 'autre';
  priority: 1 | 2 | 3 | 4 | 5;
  summary: string;
  /** Instant ISO 8601 calculé par `resolveWhen` — jamais par le modèle. */
  scheduled_at: string | null;
  /** Short title for the appointment (auto-generated) */
  rdv_title: string | null;
  /** Address if mentioned */
  address: string | null;
};

/** Utilisé quand Groq est indisponible : le message est gardé, jamais perdu. */
export const FALLBACK: Classification = {
  category_slug: 'autre',
  intent: 'autre',
  priority: 3,
  summary: '',
  scheduled_at: null,
  rdv_title: null,
  address: null,
};

// Les catégories changent rarement : inutile de taper la DB à chaque message.
const CATEGORIES_TTL_MS = 5 * 60_000;
let categoriesCache: { at: number; list: string } | null = null;

async function getCategoriesForPrompt(): Promise<string> {
  if (categoriesCache && Date.now() - categoriesCache.at < CATEGORIES_TTL_MS) {
    return categoriesCache.list;
  }
  const { data } = await db
    .from('categories')
    .select('slug, label, description')
    .eq('active', true);
  const list = (data || [])
    .map((c) => `- "${c.slug}" — ${c.label}: ${c.description || ''}`)
    .join('\n');
  categoriesCache = { at: Date.now(), list };
  return list;
}

export async function classify(text: string, hasMedia: boolean): Promise<Classification> {
  const catList = await getCategoriesForPrompt();
  const now = new Date();

  const system = `Tu es l'assistant virtuel d'un entrepreneur basé à Abidjan, Côte d'Ivoire. Tu analyses les messages WhatsApp entrants pour les trier ET repérer les RDV.

Aujourd'hui : ${abidjanNowLabel(now)}. Fuseau horaire : Africa/Abidjan (UTC+0, pas de DST).

Catégories disponibles :
${catList}

Tu retournes UNIQUEMENT un JSON valide :
{
  "category_slug": "<slug ci-dessus, 'autre' si rien ne matche>",
  "intent": "rdv" | "demande_info" | "envoi_image" | "autre",
  "priority": 1 (urgent/RDV concret) à 5 (faible),
  "summary": "<résumé en 1 phrase courte fr>",
  "when": <objet décrit ci-dessous, ou null si aucune indication de date>,
  "rdv_title": "<titre court du RDV, ex: 'Visite déco salon - Mariam', sinon null>",
  "address": "<adresse mentionnée, sinon null>"
}

⚠️ RÈGLE ABSOLUE sur "when" : tu ne calcules JAMAIS de date toi-même. Tu décris
uniquement, en clair, ce que dit le message. Le calcul est fait par le programme.

"when" a cette forme :
{
  "kind": "relative" | "absolute",
  "day_offset": <entier, SI kind="relative" et que le message dit "aujourd'hui"(0) / "demain"(1) / "après-demain"(2) / "dans N jours"(N)>,
  "weekday": <"lundi"…"dimanche", SI kind="relative" et que le message nomme un jour de la semaine>,
  "date": <"YYYY-MM-DD", SI kind="absolute", c.-à-d. si le message donne une date explicite comme "le 12 mai">,
  "hour": <0-23 si une heure précise est donnée, sinon null>,
  "minute": <0-59, sinon 0>,
  "daypart": <"matin" | "apres_midi" | "soir" si le message donne un moment sans heure précise, sinon null>
}

Exemples :
- "demain à 14h"        → {"kind":"relative","day_offset":1,"hour":14,"minute":0}
- "lundi matin"         → {"kind":"relative","weekday":"lundi","daypart":"matin"}
- "le 12 mai à 9h30"    → {"kind":"absolute","date":"2026-05-12","hour":9,"minute":30}
- "dans 3 jours"        → {"kind":"relative","day_offset":3,"hour":null,"daypart":null}
- "je passerai bientôt" → null

Si le message ne contient AUCUNE indication temporelle → "when": null.

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
  const parsed = JSON.parse(raw) as Partial<Classification> & { when?: WhenSpec | null };

  const priority = Number(parsed.priority);
  const rdvTitle = parsed.rdv_title?.trim() || null;
  // Le modèle décrit, `resolveWhen` tranche : une description trop vague
  // (« dans 3 jours », sans heure) ne produit aucun RDV.
  const scheduledAt = resolveWhen(parsed.when, now);

  return {
    category_slug: parsed.category_slug || 'autre',
    intent: (parsed.intent as Classification['intent']) || 'autre',
    priority: (Number.isFinite(priority)
      ? Math.min(5, Math.max(1, Math.round(priority)))
      : 3) as Classification['priority'],
    summary: parsed.summary || '',
    // Un RDV n'est créé que si on a À LA FOIS un instant fiable et un titre.
    scheduled_at: rdvTitle ? scheduledAt : null,
    rdv_title: rdvTitle,
    address: parsed.address?.trim() || null,
  };
}
