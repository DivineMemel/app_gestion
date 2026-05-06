import Groq from 'groq-sdk';
import { db } from './db.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export type Classification = {
  category_slug: string;
  intent: 'rdv' | 'demande_info' | 'envoi_image' | 'autre';
  priority: 1 | 2 | 3 | 4 | 5;
  summary: string;
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

  const system = `Tu es un assistant qui trie les messages WhatsApp d'un entrepreneur (Eric).
Eric propose plusieurs services. Voici les catégories disponibles :
${catList}

Tu dois retourner UNIQUEMENT un JSON valide avec ces champs :
{
  "category_slug": "<un des slugs ci-dessus, 'autre' si rien ne correspond>",
  "intent": "rdv" | "demande_info" | "envoi_image" | "autre",
  "priority": 1 (urgent, RDV ou intervention demandée) à 5 (faible, juste info),
  "summary": "<résumé en 1 phrase courte en français>"
}

Règles :
- "rdv" = le client demande un RDV / une visite / une intervention
- "demande_info" = le client pose une question, demande prix, dispo
- "envoi_image" = le client a envoyé une photo (souvent du lieu à décorer)
- priority 1-2 si urgent / RDV concret / client prêt
- priority 3 si demande standard
- priority 4-5 si juste curiosité ou message vague`;

  const user = `Message reçu${hasMedia ? ' (avec une image jointe)' : ''} :\n"""\n${text || '(pas de texte)'}\n"""`;

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

  return {
    category_slug: parsed.category_slug || 'autre',
    intent: (parsed.intent as Classification['intent']) || 'autre',
    priority: (Math.min(5, Math.max(1, parsed.priority || 3)) as Classification['priority']),
    summary: parsed.summary || '',
  };
}
