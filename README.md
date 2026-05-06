# Gestion Eric — WhatsApp automation

Outil pour trier et prioriser les messages WhatsApp d'Eric (décoration + fosse septique).

## Architecture

```
┌─────────────────────┐
│ Web (Next.js PWA)   │  → Vercel (gratuit)
│ Dashboard mobile    │
└──────────┬──────────┘
           │ realtime
┌──────────▼──────────┐
│ Supabase (Postgres) │  → free tier (500 MB)
│ + Realtime + Auth   │
└──────────▲──────────┘
           │
┌──────────┴──────────┐
│ Worker Baileys      │  → Render free tier
│ (Node.js)           │     - Connexion WhatsApp via QR
│                     │     - Classifie messages via Groq
│                     │     - Insère en DB
└─────────────────────┘
```

## Setup (étape par étape)

### 1. Créer les comptes (tous gratuits)

| Service | URL | Pourquoi |
|---|---|---|
| Supabase | https://supabase.com | Base de données |
| Groq | https://console.groq.com | Classification IA (Llama 3.3) |
| Render | https://render.com | Hébergement worker |
| Vercel | https://vercel.com | Hébergement web |
| GitHub | https://github.com | Push le code (requis pour Render & Vercel) |

### 2. Supabase

1. Créer un projet (région : Frankfurt ou Paris).
2. Aller dans **SQL Editor** → coller `supabase/migrations/001_schema.sql` → Run.
3. Coller ensuite `supabase/migrations/002_push.sql` → Run.
4. Récupérer dans **Project Settings → API** :
   - `Project URL` (NEXT_PUBLIC_SUPABASE_URL)
   - `anon public` key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
   - `service_role` key (SUPABASE_SERVICE_ROLE — secret, worker uniquement)

### 3. Groq

1. Créer un compte → **API Keys** → créer une clé.
2. Garder pour `GROQ_API_KEY`.

### 4. Clés VAPID (alertes RDV)

```bash
cd worker && npx web-push generate-vapid-keys
```

Copier la clé publique dans `worker/.env` (VAPID_PUBLIC_KEY) **et** dans `web/.env.local` (NEXT_PUBLIC_VAPID_PUBLIC_KEY). La clé privée reste côté worker uniquement.

### 5. Worker (local d'abord)

```bash
cd worker
cp .env.example .env
# remplir .env avec les clés Supabase + Groq
npm install
npm run dev
```

Le QR s'affiche dans le terminal **et** est sauvé en DB. Eric scanne avec WhatsApp → connecté.

### 6. Web (local)

```bash
cd web
cp .env.example .env.local
# remplir .env.local avec les clés Supabase (anon)
npm install
npm run dev
```

Ouvrir http://localhost:3000.

### 7. Déploiement

**Web → Vercel** :
- Push sur GitHub
- Vercel → Import repo → root directory : `web`
- Variables d'env : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Worker → Render** :
- New Web Service → connect GitHub repo → root directory : `worker`
- Build: `npm install && npm run build`
- Start: `npm start`
- Variables d'env : toutes celles du `.env`
- ⚠️ Free tier : le service dort après 15 min d'inactivité. Solution : créer un cron sur https://cron-job.org qui ping `/health` toutes les 10 min.

## Sécurité & légal

- **Baileys est non officiel** (utilise le protocole WhatsApp Web par reverse-engineering). Risque de ban du numéro WhatsApp si usage abusif. Pour un usage normal d'un petit business, c'est OK.
- Pour passer en officiel plus tard : WhatsApp Cloud API (Meta) — payant.
- Le numéro doit rester **un téléphone allumé** (Baileys = device lié, comme WhatsApp Web).
