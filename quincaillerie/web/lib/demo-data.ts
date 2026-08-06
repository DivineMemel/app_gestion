// Jeu de données de démonstration — NADAL SERVICES.
//
// Sert tant qu'aucun projet Supabase n'est configuré : l'app tourne alors
// entièrement en local, pour qu'on puisse encaisser, chiffrer un devis ou
// réceptionner une livraison sans rien brancher.
//
// Les prix sont des ordres de grandeur d'Abidjan, à ajuster. Les unités
// illustrent le vrai sujet du métier : on vend au sac ET à la palette, à la
// pièce ET au carton, au m² pour la pose.

type Row = Record<string, unknown>;

const J = 86_400_000;
/** Date relative à maintenant, en ISO — le jeu reste cohérent dans le temps. */
const ilY = (jours: number) => new Date(Date.now() - jours * J).toISOString();
const jour = (jours: number) => ilY(jours).slice(0, 10);

export const RAYONS = [
  { slug: 'staff-faux-plafond', name: 'Staff & faux plafond', position: 1 },
  { slug: 'decoration', name: 'Décoration intérieure', position: 2 },
  { slug: 'materiaux-decoratifs', name: 'Matériaux décoratifs', position: 3 },
  { slug: 'plomberie', name: 'Plomberie', position: 4 },
  { slug: 'sanitaire', name: 'Sanitaire', position: 5 },
  { slug: 'fosse-septique', name: 'Fosse septique & biodigesteur', position: 6 },
  { slug: 'electricite', name: 'Électricité & luminaires', position: 7 },
  { slug: 'peinture', name: 'Peinture & finition', position: 8 },
  { slug: 'ciment-agregats', name: 'Ciment & agrégats', position: 9 },
  { slug: 'outillage', name: 'Outillage & consommables', position: 10 },
  { slug: 'prestations', name: 'Prestations & main-d’œuvre', position: 11 },
];

type SeedProduit = {
  id: string;
  sku: string;
  name: string;
  rayon: string;
  unite: string;
  stock: number;
  seuil?: number;
  achat: number;
  desc?: string;
  /** [libellé, facteur, prix]. Le premier est l'unité par défaut. */
  ventes: [string, number, number][];
  publie?: boolean;
};

const PRODUITS: SeedProduit[] = [
  // ---- Staff & faux plafond ----
  { id: 'p01', sku: 'STF-6060', name: 'Plaque de staff 60×60', rayon: 'staff-faux-plafond', unite: 'plaque', stock: 240, seuil: 60, achat: 2400,
    desc: 'Plaque de plâtre décorative pour faux plafond, finition lisse.',
    ventes: [['plaque', 1, 3500], ['carton de 10', 10, 33000]] },
  { id: 'p02', sku: 'STF-CORN2', name: 'Corniche staff 2 m', rayon: 'staff-faux-plafond', unite: 'pièce', stock: 85, seuil: 30, achat: 3000,
    ventes: [['pièce', 1, 4500], ['botte de 6', 6, 25000]] },
  { id: 'p03', sku: 'STF-COLLE', name: 'Colle à staff 25 kg', rayon: 'staff-faux-plafond', unite: 'sac', stock: 18, seuil: 20, achat: 6000,
    ventes: [['sac', 1, 8500]] },
  { id: 'p04', sku: 'STF-RAIL', name: 'Rail métallique 3 m', rayon: 'staff-faux-plafond', unite: 'barre', stock: 120, seuil: 40, achat: 1800,
    ventes: [['barre', 1, 2800], ['botte de 10', 10, 26000]] },

  // ---- Décoration intérieure ----
  { id: 'p05', sku: 'DEC-PAP', name: 'Papier peint rouleau 10 m', rayon: 'decoration', unite: 'rouleau', stock: 64, seuil: 15, achat: 9500,
    desc: 'Rouleau intissé, largeur 53 cm. Nombreux motifs disponibles en boutique.',
    ventes: [['rouleau', 1, 15000], ['lot de 5', 5, 70000]] },
  { id: 'p06', sku: 'DEC-MOUL', name: 'Moulure polystyrène 2 m', rayon: 'decoration', unite: 'pièce', stock: 210, seuil: 50, achat: 1600,
    ventes: [['pièce', 1, 2500], ['paquet de 10', 10, 22000]] },
  { id: 'p07', sku: 'DEC-SPOT', name: 'Spot LED encastrable 7 W', rayon: 'decoration', unite: 'pièce', stock: 340, seuil: 60, achat: 2200,
    ventes: [['pièce', 1, 3500], ['boîte de 20', 20, 62000]] },
  { id: 'p08', sku: 'DEC-RUBAN', name: 'Ruban LED 5 m', rayon: 'decoration', unite: 'rouleau', stock: 42, seuil: 12, achat: 7000,
    ventes: [['rouleau', 1, 11000]] },

  // ---- Matériaux décoratifs ----
  { id: 'p09', sku: 'MAT-3D', name: 'Panneau mural 3D 50×50', rayon: 'materiaux-decoratifs', unite: 'pièce', stock: 156, seuil: 36, achat: 5200,
    desc: 'Panneau décoratif en fibre végétale, peignable.',
    ventes: [['pièce', 1, 8000], ['carton de 12', 12, 88000]] },
  { id: 'p10', sku: 'MAT-LAMB', name: 'Lambris PVC 3 m', rayon: 'materiaux-decoratifs', unite: 'pièce', stock: 98, seuil: 24, achat: 2900,
    ventes: [['pièce', 1, 4500], ['paquet de 8', 8, 34000]] },
  { id: 'p11', sku: 'MAT-PIERRE', name: 'Plaquette de parement pierre', rayon: 'materiaux-decoratifs', unite: 'm²', stock: 74, seuil: 20, achat: 8500,
    ventes: [['m²', 1, 13500]] },

  // ---- Plomberie ----
  { id: 'p12', sku: 'PLB-T110', name: 'Tube PVC Ø110 — 3 m', rayon: 'plomberie', unite: 'barre', stock: 46, seuil: 20, achat: 4200,
    ventes: [['barre', 1, 6500], ['botte de 10', 10, 61000]] },
  { id: 'p13', sku: 'PLB-T63', name: 'Tube PVC Ø63 — 3 m', rayon: 'plomberie', unite: 'barre', stock: 88, seuil: 25, achat: 2200,
    ventes: [['barre', 1, 3500]] },
  { id: 'p14', sku: 'PLB-C110', name: 'Coude PVC Ø110 87°', rayon: 'plomberie', unite: 'pièce', stock: 12, seuil: 30, achat: 750,
    ventes: [['pièce', 1, 1200], ['sachet de 25', 25, 27000]] },
  { id: 'p15', sku: 'PLB-COLLE', name: 'Colle PVC 500 g', rayon: 'plomberie', unite: 'pot', stock: 27, seuil: 10, achat: 2900,
    ventes: [['pot', 1, 4500]] },
  { id: 'p16', sku: 'PLB-MEL', name: 'Robinet mélangeur lavabo', rayon: 'plomberie', unite: 'pièce', stock: 31, seuil: 8, achat: 11000,
    ventes: [['pièce', 1, 18000]] },

  // ---- Sanitaire ----
  { id: 'p17', sku: 'SAN-WC', name: 'WC complet avec réservoir', rayon: 'sanitaire', unite: 'ensemble', stock: 9, seuil: 4, achat: 58000,
    desc: 'Cuvette céramique, réservoir et abattant. Pose possible sur devis.',
    ventes: [['ensemble', 1, 85000]] },
  { id: 'p18', sku: 'SAN-LAV', name: 'Lavabo céramique sur colonne', rayon: 'sanitaire', unite: 'pièce', stock: 14, seuil: 5, achat: 23000,
    ventes: [['pièce', 1, 35000]] },
  { id: 'p19', sku: 'SAN-DOU', name: 'Receveur de douche 80×80', rayon: 'sanitaire', unite: 'pièce', stock: 6, seuil: 4, achat: 36000,
    ventes: [['pièce', 1, 55000]] },

  // ---- Fosse septique & biodigesteur ----
  { id: 'p20', sku: 'FOS-BIO3', name: 'Fosse biodigesteur 3 m³', rayon: 'fosse-septique', unite: 'unité', stock: 3, seuil: 2, achat: 310000,
    desc: 'Cuve biodigesteur préfabriquée, traitement autonome des eaux usées.',
    ventes: [['unité', 1, 450000]] },
  { id: 'p21', sku: 'FOS-REG', name: 'Regard béton 40×40', rayon: 'fosse-septique', unite: 'pièce', stock: 22, seuil: 8, achat: 16000,
    ventes: [['pièce', 1, 25000]] },
  { id: 'p22', sku: 'FOS-DRAIN', name: 'Tuyau de drainage Ø100 — 25 m', rayon: 'fosse-septique', unite: 'rouleau', stock: 7, seuil: 4, achat: 29000,
    ventes: [['rouleau', 1, 45000]] },

  // ---- Électricité ----
  { id: 'p23', sku: 'ELE-C25', name: 'Câble souple 2,5 mm²', rayon: 'electricite', unite: 'mètre', stock: 640, seuil: 200, achat: 320,
    ventes: [['mètre', 1, 500], ['rouleau 100 m', 100, 45000]] },
  { id: 'p24', sku: 'ELE-INT', name: 'Interrupteur simple', rayon: 'electricite', unite: 'pièce', stock: 118, seuil: 40, achat: 1500,
    ventes: [['pièce', 1, 2500], ['boîte de 10', 10, 22000]] },
  { id: 'p25', sku: 'ELE-DJ16', name: 'Disjoncteur 16 A', rayon: 'electricite', unite: 'pièce', stock: 44, seuil: 15, achat: 4200,
    ventes: [['pièce', 1, 6500]] },

  // ---- Peinture ----
  { id: 'p26', sku: 'PEI-M20', name: 'Peinture mate blanche 20 L', rayon: 'peinture', unite: 'seau', stock: 16, seuil: 10, achat: 30000,
    ventes: [['seau', 1, 45000]] },
  { id: 'p27', sku: 'PEI-END', name: 'Enduit de lissage 25 kg', rayon: 'peinture', unite: 'sac', stock: 34, seuil: 15, achat: 7800,
    ventes: [['sac', 1, 12000], ['palette de 40', 40, 450000]] },
  { id: 'p28', sku: 'PEI-ROUL', name: 'Rouleau à peindre + manche', rayon: 'peinture', unite: 'pièce', stock: 52, seuil: 15, achat: 2100,
    ventes: [['pièce', 1, 3500]] },

  // ---- Ciment & agrégats ----
  { id: 'p29', sku: 'CIM-50', name: 'Ciment CIMAF 50 kg', rayon: 'ciment-agregats', unite: 'sac', stock: 145, seuil: 60, achat: 4300,
    desc: 'Ciment Portland CPJ 35, sac de 50 kg.',
    ventes: [['sac', 1, 5500], ['palette de 40', 40, 210000]] },
  { id: 'p30', sku: 'CIM-SAB', name: 'Sable de construction', rayon: 'ciment-agregats', unite: 'm³', stock: 24, seuil: 10, achat: 12000,
    ventes: [['m³', 1, 18000], ['camion 10 m³', 10, 165000]] },
  { id: 'p31', sku: 'CIM-GRAV', name: 'Gravier 15/25', rayon: 'ciment-agregats', unite: 'm³', stock: 8, seuil: 10, achat: 17000,
    ventes: [['m³', 1, 25000], ['camion 10 m³', 10, 230000]] },

  // ---- Outillage ----
  { id: 'p32', sku: 'OUT-TRU', name: 'Truelle langue de chat', rayon: 'outillage', unite: 'pièce', stock: 29, seuil: 10, achat: 2800,
    ventes: [['pièce', 1, 4500]] },
  { id: 'p33', sku: 'OUT-NIV', name: 'Niveau à bulle 60 cm', rayon: 'outillage', unite: 'pièce', stock: 11, seuil: 6, achat: 5500,
    ventes: [['pièce', 1, 8500]] },

  // ---- Prestations (hors vitrine : elles se chiffrent en devis) ----
  { id: 'p34', sku: 'PRE-PLAF', name: 'Pose faux plafond', rayon: 'prestations', unite: 'm²', stock: 0, seuil: 0, achat: 0, publie: false,
    desc: 'Main-d’œuvre pose staff ou PVC, hors fourniture.',
    ventes: [['m²', 1, 8000]] },
  { id: 'p35', sku: 'PRE-FOSSE', name: 'Installation fosse biodigesteur', rayon: 'prestations', unite: 'forfait', stock: 0, seuil: 0, achat: 0, publie: false,
    ventes: [['forfait', 1, 350000]] },
  { id: 'p36', sku: 'PRE-TERR', name: 'Terrassement', rayon: 'prestations', unite: 'm³', stock: 0, seuil: 0, achat: 0, publie: false,
    ventes: [['m³', 1, 15000]] },
  { id: 'p37', sku: 'PRE-MO', name: 'Main-d’œuvre journalier', rayon: 'prestations', unite: 'jour', stock: 0, seuil: 0, achat: 0, publie: false,
    ventes: [['jour', 1, 15000]] },
];

const CLIENTS = [
  { id: 'c1', name: 'Kouadio Bâtiment SARL', phone: '0707451288', kind: 'professionnel', credit: 1_500_000,
    address: 'Zone 4, Marcory', notes: 'Chantier résidence Palmeraie. Règle en fin de mois.' },
  { id: 'c2', name: 'Mme Aya Konan', phone: '0505123344', kind: 'particulier', credit: 0, address: 'Bingerville' },
  { id: 'c3', name: 'Chantier Villa Riviera', phone: '0102998877', kind: 'chantier', credit: 800_000,
    address: 'Riviera Golf', notes: 'Interlocuteur : M. Diallo, chef de chantier.' },
  { id: 'c4', name: 'Traoré Ibrahim', phone: '0748110022', kind: 'particulier', credit: 200_000, address: 'Abobo' },
  { id: 'c5', name: 'Entreprise Sanou & Fils', phone: '0555667788', kind: 'professionnel', credit: 1_000_000,
    address: 'Yopougon' },
];

const FOURNISSEURS = [
  { id: 'f1', name: 'CIMAF Côte d’Ivoire', phone: '2721757575', address: 'Zone industrielle, Vridi',
    notes: 'Livraison sous 48 h à partir de 20 palettes.' },
  { id: 'f2', name: 'Établissements Diarra — PVC', phone: '0709887766', address: 'Adjamé, marché Gouro' },
  { id: 'f3', name: 'Deco Import CI', phone: '0102334455', address: 'Koumassi',
    notes: 'Papier peint et panneaux 3D. Arrivage tous les deux mois.' },
  { id: 'f4', name: 'Sanitaire Plus', phone: '0788990011', address: 'Treichville' },
];

const POSTES = [
  'Loyer', 'Électricité & eau', 'Transport & livraison', 'Salaires', 'Carburant',
  'Entretien & réparation', 'Taxes & patente', 'Fournitures bureau', 'Divers',
];

// ---------------------------------------------------------------------------

function construireProduits() {
  const produits: Row[] = [];
  const unites: Row[] = [];

  for (const p of PRODUITS) {
    produits.push({
      id: p.id,
      sku: p.sku,
      barcode: null,
      name: p.name,
      description: p.desc ?? null,
      category_id: `cat-${p.rayon}`,
      image_url: null,
      base_unit: p.unite,
      stock_qty: p.stock,
      min_stock: p.seuil ?? null,
      cost_price_xof: p.achat,
      active: true,
      published: p.publie !== false,
      low_stock_alerted_at: null,
      created_at: ilY(120),
      updated_at: ilY(3),
    });

    p.ventes.forEach(([label, factor, price], i) => {
      unites.push({
        id: `${p.id}-u${i}`,
        product_id: p.id,
        label,
        factor,
        price_xof: price,
        is_default: i === 0,
        position: i,
      });
    });
  }
  return { produits, unites };
}

/** Quelques ventes passées, pour que le tableau de bord et la compta parlent. */
function construireVentes() {
  const sales: Row[] = [];
  const items: Row[] = [];
  const payments: Row[] = [];
  const movements: Row[] = [];

  const scenarios: {
    id: string;
    num: string;
    client: string | null;
    jours: number;
    regle: 'tout' | 'partiel' | 'rien';
    lignes: [string, string, number, number, number][]; // produit, unité, facteur, qté, prix
  }[] = [
    { id: 'v1', num: 'V-2026-00001', client: 'c1', jours: 26, regle: 'tout',
      lignes: [['p29', 'palette de 40', 40, 2, 210000], ['p27', 'sac', 1, 20, 12000]] },
    { id: 'v2', num: 'V-2026-00002', client: 'c3', jours: 19, regle: 'partiel',
      lignes: [['p20', 'unité', 1, 1, 450000], ['p21', 'pièce', 1, 3, 25000]] },
    { id: 'v3', num: 'V-2026-00003', client: null, jours: 12, regle: 'tout',
      lignes: [['p07', 'boîte de 20', 20, 1, 62000], ['p23', 'rouleau 100 m', 100, 1, 45000]] },
    { id: 'v4', num: 'V-2026-00004', client: 'c4', jours: 8, regle: 'rien',
      lignes: [['p05', 'rouleau', 1, 4, 15000], ['p06', 'paquet de 10', 10, 2, 22000]] },
    { id: 'v5', num: 'V-2026-00005', client: 'c5', jours: 4, regle: 'tout',
      lignes: [['p01', 'carton de 10', 10, 6, 33000], ['p04', 'botte de 10', 10, 4, 26000]] },
    { id: 'v6', num: 'V-2026-00006', client: null, jours: 1, regle: 'tout',
      lignes: [['p29', 'sac', 1, 12, 5500], ['p32', 'pièce', 1, 2, 4500]] },
    { id: 'v7', num: 'V-2026-00007', client: 'c2', jours: 0, regle: 'tout',
      lignes: [['p17', 'ensemble', 1, 1, 85000], ['p16', 'pièce', 1, 2, 18000]] },
  ];

  const coutDe = (pid: string) => PRODUITS.find((p) => p.id === pid)?.achat ?? 0;

  for (const s of scenarios) {
    let sousTotal = 0;
    s.lignes.forEach(([pid, unite, facteur, qte, prix], i) => {
      const ligne = qte * prix;
      sousTotal += ligne;
      const prod = PRODUITS.find((p) => p.id === pid)!;
      items.push({
        id: `${s.id}-i${i}`,
        sale_id: s.id,
        product_id: pid,
        product_name: prod.name,
        unit_label: unite,
        unit_factor: facteur,
        qty: qte,
        unit_price_xof: prix,
        line_total_xof: ligne,
        cost_price_xof: coutDe(pid),
      });
      movements.push({
        id: `${s.id}-m${i}`,
        product_id: pid,
        qty_base: -(qte * facteur),
        kind: 'vente',
        ref_table: 'sales',
        ref_id: s.id,
        note: s.num,
        created_by: null,
        created_at: ilY(s.jours),
      });
    });

    const total = sousTotal;
    const paye = s.regle === 'tout' ? total : s.regle === 'partiel' ? Math.round(total * 0.4) : 0;

    sales.push({
      id: s.id,
      number: s.num,
      customer_id: s.client,
      subtotal_xof: sousTotal,
      discount_xof: 0,
      total_xof: total,
      paid_xof: paye,
      payment_method: s.regle === 'rien' ? 'credit' : 'especes',
      status: paye >= total ? 'payee' : paye > 0 ? 'partielle' : 'credit',
      channel: 'comptoir',
      note: null,
      sold_by: null,
      sold_at: ilY(s.jours),
      created_at: ilY(s.jours),
    });

    if (paye > 0) {
      payments.push({
        id: `${s.id}-p`,
        customer_id: s.client,
        sale_id: s.id,
        amount_xof: paye,
        method: 'especes',
        note: `Encaissement ${s.num}`,
        received_by: null,
        paid_at: ilY(s.jours),
      });
    }
  }

  return { sales, items, payments, movements };
}

export function seed(): Record<string, Row[]> {
  const { produits, unites } = construireProduits();
  const { sales, items, payments, movements } = construireVentes();

  return {
    shop_settings: [
      {
        id: 1,
        name: 'NADAL SERVICES',
        tagline: 'Staff · Plomberie · Décoration · Fosse septique',
        phone: '+225 07 04 74 03 18',
        whatsapp: '+225 07 04 74 03 18',
        email: 'nadalservices97@gmail.com',
        address: 'Bingerville, nouvelle gare — Abidjan',
        logo_url: null,
        invoice_footer: 'Merci de votre confiance. NADAL SERVICES — Bingerville.',
        allow_negative_stock: false,
        default_min_stock: 5,
        online_orders_open: true,
        updated_at: ilY(0),
      },
    ],

    team_members: [
      { id: 'm1', name: 'Kouassi Assamoi', email: 'patron@nadalservices.ci',
        role: 'patron', status: 'active', phone: '0707112244', created_at: ilY(200) },
      { id: 'm2', name: 'Awa Sanogo', email: 'awa@nadalservices.ci',
        role: 'gerant', status: 'active', phone: '0709112233', created_at: ilY(90) },
      { id: 'm3', name: 'Yao Kouassi', email: 'yao@nadalservices.ci',
        role: 'vendeur', status: 'active', phone: '0505889977', created_at: ilY(45) },
      { id: 'm4', name: 'Bakary Coulibaly', email: 'bakary@nadalservices.ci',
        role: 'magasinier', status: 'pending', phone: '0102446688', created_at: ilY(2) },
    ],

    categories: RAYONS.map((r) => ({
      id: `cat-${r.slug}`,
      name: r.name,
      slug: r.slug,
      description: null,
      image_url: null,
      position: r.position,
      active: true,
      created_at: ilY(150),
    })),

    products: produits,
    product_units: unites,

    customers: CLIENTS.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: null,
      address: c.address ?? null,
      kind: c.kind,
      credit_limit_xof: c.credit,
      notes: c.notes ?? null,
      created_at: ilY(100),
      updated_at: ilY(10),
    })),

    suppliers: FOURNISSEURS.map((f) => ({
      id: f.id,
      name: f.name,
      phone: f.phone,
      email: null,
      address: f.address ?? null,
      notes: f.notes ?? null,
      active: true,
      created_at: ilY(140),
    })),

    purchase_orders: [
      { id: 'bc1', number: 'BC-2026-0001', supplier_id: 'f1', status: 'recu',
        total_xof: 1_016_000, note: null, ordered_at: ilY(30), received_at: ilY(27),
        created_by: null, created_at: ilY(30) },
      { id: 'bc2', number: 'BC-2026-0002', supplier_id: 'f2', status: 'commande',
        total_xof: 189_000, note: 'Livraison annoncée sous 5 jours.', ordered_at: ilY(3),
        received_at: null, created_by: null, created_at: ilY(3) },
    ],
    purchase_order_items: [
      { id: 'bci1', purchase_order_id: 'bc1', product_id: 'p29', qty_base: 200, qty_received_base: 200, unit_cost_xof: 4300 },
      { id: 'bci2', purchase_order_id: 'bc1', product_id: 'p27', qty_base: 20, qty_received_base: 20, unit_cost_xof: 7800 },
      { id: 'bci3', purchase_order_id: 'bc2', product_id: 'p14', qty_base: 200, qty_received_base: 0, unit_cost_xof: 750 },
      { id: 'bci4', purchase_order_id: 'bc2', product_id: 'p12', qty_base: 10, qty_received_base: 0, unit_cost_xof: 4200 },
    ],

    sales,
    sale_items: items,
    payments,
    stock_movements: movements,

    quotes: [
      { id: 'd1', number: 'D-2026-0001', customer_id: 'c3', customer_name: null,
        customer_phone: null, subtotal_xof: 1_290_000, discount_xof: 40_000,
        total_xof: 1_250_000, status: 'envoye', valid_until: jour(-25),
        note: 'Délai d’exécution : 3 semaines après acompte.',
        converted_sale_id: null, created_by: null, created_at: ilY(5) },
      { id: 'd2', number: 'D-2026-0002', customer_id: null,
        customer_name: 'M. Bamba (villa Cocody)', customer_phone: '0707334455',
        subtotal_xof: 480_000, discount_xof: 0, total_xof: 480_000,
        status: 'accepte', valid_until: jour(-20), note: null,
        converted_sale_id: null, created_by: null, created_at: ilY(9) },
    ],
    quote_items: [
      { id: 'di1', quote_id: 'd1', product_id: 'p20', product_name: 'Fosse biodigesteur 3 m³',
        unit_label: 'unité', unit_factor: 1, qty: 1, unit_price_xof: 450000, line_total_xof: 450000 },
      { id: 'di2', quote_id: 'd1', product_id: 'p35', product_name: 'Installation fosse biodigesteur',
        unit_label: 'forfait', unit_factor: 1, qty: 1, unit_price_xof: 350000, line_total_xof: 350000 },
      { id: 'di3', quote_id: 'd1', product_id: 'p36', product_name: 'Terrassement',
        unit_label: 'm³', unit_factor: 1, qty: 18, unit_price_xof: 15000, line_total_xof: 270000 },
      { id: 'di4', quote_id: 'd1', product_id: 'p21', product_name: 'Regard béton 40×40',
        unit_label: 'pièce', unit_factor: 1, qty: 4, unit_price_xof: 25000, line_total_xof: 100000 },
      { id: 'di5', quote_id: 'd1', product_id: 'p22', product_name: 'Tuyau de drainage Ø100 — 25 m',
        unit_label: 'rouleau', unit_factor: 1, qty: 2, unit_price_xof: 45000, line_total_xof: 90000 },
      { id: 'di6', quote_id: 'd2', product_id: 'p34', product_name: 'Pose faux plafond',
        unit_label: 'm²', unit_factor: 1, qty: 45, unit_price_xof: 8000, line_total_xof: 360000 },
      { id: 'di7', quote_id: 'd2', product_id: 'p01', product_name: 'Plaque de staff 60×60',
        unit_label: 'carton de 10', unit_factor: 10, qty: 3, unit_price_xof: 33000, line_total_xof: 99000 },
      { id: 'di8', quote_id: 'd2', product_id: 'p03', product_name: 'Colle à staff 25 kg',
        unit_label: 'sac', unit_factor: 1, qty: 3, unit_price_xof: 8500, line_total_xof: 25500 },
    ],

    orders: [
      { id: 'o1', number: 'C-2026-0001', customer_id: null, customer_name: 'Fatou Bamba',
        customer_phone: '0709221144', customer_email: null, total_xof: 165_000,
        status: 'nouvelle', note: 'Je passe retirer samedi matin.',
        converted_sale_id: null, created_at: ilY(0), updated_at: ilY(0) },
      { id: 'o2', number: 'C-2026-0002', customer_id: 'c4', customer_name: 'Traoré Ibrahim',
        customer_phone: '0748110022', customer_email: null, total_xof: 55_000,
        status: 'prete', note: null, converted_sale_id: null,
        created_at: ilY(2), updated_at: ilY(1) },
    ],
    order_items: [
      { id: 'oi1', order_id: 'o1', product_id: 'p09', product_name: 'Panneau mural 3D 50×50',
        unit_label: 'carton de 12', unit_factor: 12, qty: 1, unit_price_xof: 88000, line_total_xof: 88000 },
      { id: 'oi2', order_id: 'o1', product_id: 'p26', product_name: 'Peinture mate blanche 20 L',
        unit_label: 'seau', unit_factor: 1, qty: 1, unit_price_xof: 45000, line_total_xof: 45000 },
      { id: 'oi3', order_id: 'o1', product_id: 'p28', product_name: 'Rouleau à peindre + manche',
        unit_label: 'pièce', unit_factor: 1, qty: 2, unit_price_xof: 3500, line_total_xof: 7000 },
      { id: 'oi4', order_id: 'o1', product_id: 'p06', product_name: 'Moulure polystyrène 2 m',
        unit_label: 'pièce', unit_factor: 1, qty: 10, unit_price_xof: 2500, line_total_xof: 25000 },
      { id: 'oi5', order_id: 'o2', product_id: 'p19', product_name: 'Receveur de douche 80×80',
        unit_label: 'pièce', unit_factor: 1, qty: 1, unit_price_xof: 55000, line_total_xof: 55000 },
    ],

    // Un arrivage déjà saisi mais pas encore valorisé : c'est exactement la
    // situation que le module doit rendre visible — la marchandise est au
    // dépôt, le patron doit encore dire ce qu'elle a coûté.
    supply_entries: [
      { id: 'ar1', number: 'AR-2026-0001', supplier_id: 'f3', purchase_order_id: null,
        status: 'saisi', note: 'Arrivage Deco Import, reçu par Bakary.',
        received_at: ilY(1), valued_at: null, created_by: null, valued_by: null,
        created_at: ilY(1) },
      { id: 'ar2', number: 'AR-2026-0002', supplier_id: 'f2', purchase_order_id: null,
        status: 'valorise', note: null, received_at: ilY(14), valued_at: ilY(13),
        created_by: null, valued_by: null, created_at: ilY(14) },
    ],
    supply_entry_items: [
      { id: 'ari1', supply_entry_id: 'ar1', product_id: 'p09', qty_base: 48, unit_cost_xof: null, note: null },
      { id: 'ari2', supply_entry_id: 'ar1', product_id: 'p05', qty_base: 20, unit_cost_xof: null, note: null },
      { id: 'ari3', supply_entry_id: 'ar1', product_id: 'p10', qty_base: 32, unit_cost_xof: null, note: 'Deux paquets abîmés, mis de côté.' },
      { id: 'ari4', supply_entry_id: 'ar2', product_id: 'p12', qty_base: 30, unit_cost_xof: 4200, note: null },
      { id: 'ari5', supply_entry_id: 'ar2', product_id: 'p13', qty_base: 40, unit_cost_xof: 2200, note: null },
    ],

    stock_counts: [],
    stock_count_items: [],

    expense_categories: POSTES.map((n, i) => ({ id: `ec${i}`, name: n, active: true })),
    expenses: [
      { id: 'e1', category_id: 'ec0', label: 'Loyer boutique — août', amount_xof: 250_000,
        method: 'virement', spent_on: jour(4), note: null, created_by: null, created_at: ilY(4) },
      { id: 'e2', category_id: 'ec3', label: 'Salaires équipe', amount_xof: 420_000,
        method: 'especes', spent_on: jour(5), note: null, created_by: null, created_at: ilY(5) },
      { id: 'e3', category_id: 'ec4', label: 'Carburant camionnette', amount_xof: 45_000,
        method: 'especes', spent_on: jour(2), note: 'Livraison Riviera', created_by: null, created_at: ilY(2) },
      { id: 'e4', category_id: 'ec2', label: 'Transport palettes CIMAF', amount_xof: 80_000,
        method: 'mobile_money', spent_on: jour(27), note: null, created_by: null, created_at: ilY(27) },
      { id: 'e5', category_id: 'ec1', label: 'Facture CIE', amount_xof: 62_000,
        method: 'virement', spent_on: jour(9), note: null, created_by: null, created_at: ilY(9) },
      { id: 'e6', category_id: 'ec6', label: 'Patente commerciale', amount_xof: 135_000,
        method: 'virement', spent_on: jour(33), note: null, created_by: null, created_at: ilY(33) },
    ],

    push_subscriptions: [],
  };
}
