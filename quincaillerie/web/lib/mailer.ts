// Envoi d'e-mails transactionnels — serveur uniquement.
//
// POURQUOI PAS DE DÉPENDANCE
//
// Un SMTP (nodemailer) demande un port sortant tenu ouvert, ce que les
// fonctions serverless ne garantissent pas, et 200 ko de dépendances pour
// envoyer trois lignes de texte. Les deux fournisseurs ci-dessous exposent une
// API HTTP : `fetch` suffit, et le jour où l'on change de crémerie, une
// fonction de vingt lignes est tout ce qu'il y a à réécrire.
//
// QUEL FOURNISSEUR CHOISIR — les deux sont gratuits à notre volume (quelques
// mails par mois), la différence est ailleurs :
//
//   · BREVO — 300 mails/jour. Il suffit de valider UNE ADRESSE d'expéditeur
//     (nadalservices97@gmail.com par exemple) et on écrit à qui l'on veut.
//     C'est le choix par défaut tant que NADAL n'a pas de nom de domaine.
//
//   · RESEND — 3 000 mails/mois. Plus propre, mais sans domaine vérifié il
//     n'accepte d'écrire QU'À l'adresse du titulaire du compte. À basculer le
//     jour où nadal-multiservices.ci (ou autre) existe.
//
// Si aucune clé n'est renseignée, `mailerConfigure()` répond faux et l'appelant
// le dit à l'écran — plutôt que de faire croire à un mail parti dans le vide.

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type Resultat = { ok: true } | { ok: false; reason: string };

const FROM_EMAIL = process.env.MAIL_FROM || process.env.VAPID_SUBJECT?.replace(/^mailto:/, '');
const FROM_NAME = process.env.MAIL_FROM_NAME || 'NADAL MULTISERVICES';

export function mailerConfigure(): boolean {
  if (!FROM_EMAIL) return false;
  return Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
}

/** Ce qui manque, dit en français, pour l'afficher tel quel à l'écran. */
export function mailerManque(): string {
  if (!process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) {
    return 'Aucune clé d’envoi d’e-mail (BREVO_API_KEY ou RESEND_API_KEY) sur ce déploiement.';
  }
  return 'Adresse d’expéditeur manquante (MAIL_FROM) sur ce déploiement.';
}

async function viaBrevo(mail: Mail, cle: string): Promise<Resultat> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': cle, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
  });
  if (res.ok) return { ok: true };
  const detail = await res.text().catch(() => '');
  return { ok: false, reason: `Brevo ${res.status} ${detail.slice(0, 300)}` };
}

async function viaResend(mail: Mail, cle: string): Promise<Resultat> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (res.ok) return { ok: true };
  const detail = await res.text().catch(() => '');
  return { ok: false, reason: `Resend ${res.status} ${detail.slice(0, 300)}` };
}

export async function envoyerMail(mail: Mail): Promise<Resultat> {
  if (!mailerConfigure()) return { ok: false, reason: mailerManque() };

  // Brevo d'abord : c'est celui qui écrit à n'importe quelle adresse sans nom
  // de domaine. Resend prend le relais si c'est la seule clé posée.
  try {
    const brevo = process.env.BREVO_API_KEY;
    if (brevo) return await viaBrevo(mail, brevo);
    return await viaResend(mail, process.env.RESEND_API_KEY!);
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message || 'Envoi impossible.' };
  }
}
