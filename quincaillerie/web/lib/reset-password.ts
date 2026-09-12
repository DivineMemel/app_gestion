import { randomBytes, createHash } from 'node:crypto';

// Jetons de réinitialisation de mot de passe — serveur uniquement (node:crypto).
//
// Le jeton n'est PAS une session signée : une session dit « je suis untel »,
// un jeton de reset dit « le porteur de ce papier peut changer le mot de passe
// d'untel, une fois, avant telle heure ». D'où le stockage en base plutôt
// qu'un HMAC autoporteur — c'est ce qui permet de le révoquer, et de savoir
// s'il a déjà servi.

/** Une heure. Assez pour aller chercher ses mails depuis le chantier, pas
 *  assez pour qu'un lien resté dans une boîte partagée serve trois jours plus
 *  tard. */
export const TTL_MINUTES = 60;

/** 32 octets d'aléa. `base64url` passe dans une URL sans encodage. */
export function creerJeton(): { jeton: string; empreinte: string } {
  const jeton = randomBytes(32).toString('base64url');
  return { jeton, empreinte: empreinteJeton(jeton) };
}

/** C'est cette empreinte qui va en base, jamais le jeton lui-même. */
export function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex');
}

/**
 * Le corps du mail. Texte ET html : certains clients (et les filtres anti-spam)
 * pénalisent un message qui n'a que l'un des deux.
 */
export function mailReinitialisation(nom: string, lien: string) {
  const prenom = nom.split(' ')[0] || 'Bonjour';

  const text = [
    `${prenom},`,
    '',
    'Tu as demandé à changer ton mot de passe sur la gestion NADAL MULTISERVICES.',
    'Ouvre ce lien pour en choisir un nouveau :',
    '',
    lien,
    '',
    `Le lien est valable ${TTL_MINUTES} minutes et ne sert qu'une fois.`,
    "Si ce n'est pas toi qui l'as demandé, ignore ce message : rien n'a changé.",
    '',
    'NADAL MULTISERVICES — Bingerville, Abidjan',
  ].join('\n');

  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
    <tr><td style="background:#1D4E9B;padding:20px 26px">
      <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:.04em">NADAL MULTISERVICES</div>
      <div style="color:#EF9A1A;font-size:13px;font-weight:600;margin-top:2px">Gestion de la boutique</div>
    </td></tr>
    <tr><td style="padding:26px">
      <p style="margin:0 0 14px;font-size:16px">${escapeHtml(prenom)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55">
        Tu as demandé à changer ton mot de passe. Choisis-en un nouveau :
      </p>
      <p style="margin:0 0 20px">
        <a href="${lien}" style="display:inline-block;background:#1D4E9B;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px">
          Choisir un nouveau mot de passe
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.5">
        Le lien est valable <strong>${TTL_MINUTES} minutes</strong> et ne sert qu'une fois.
        Si ce n'est pas toi qui l'as demandé, ignore ce message : rien n'a changé.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;word-break:break-all">
        Le bouton ne s'ouvre pas ? Copie cette adresse : ${lien}
      </p>
    </td></tr>
    <tr><td style="padding:14px 26px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
      NADAL MULTISERVICES — Bingerville, Abidjan
    </td></tr>
  </table>
</body></html>`;

  return {
    subject: 'Réinitialiser ton mot de passe — NADAL MULTISERVICES',
    text,
    html,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
