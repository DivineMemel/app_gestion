export type Sector = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  cover_image_url: string | null;
  active: boolean;
  display_order: number;
};

export type Category = {
  id: string;
  sector_id: string;
  slug: string;
  name: string;
  kind: 'service' | 'product';
  description: string | null;
  display_order: number;
  active: boolean;
};

export type Service = {
  id: string;
  sector_id: string | null;
  category_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  price_xof: number;
  duration_min: number;
  image_url: string | null;
  category: string | null; // legacy free-text, conservé pour compat
  active: boolean;
  display_order: number;
  created_at: string;
};

export type Staff = {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  photo_url: string | null;
  color: string;
  active: boolean;
  display_order: number;
};

export type AcquisitionSource =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'google'
  | 'walk_in'
  | 'referral'
  | 'whatsapp'
  | 'site_web'
  | 'autre';

export type Client = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthday: string | null;
  total_spent_xof: number;
  visits_count: number;
  last_visit_at: string | null;
  first_visit_at: string | null;
  acquisition_source: AcquisitionSource | null;
  referrer_client_id: string | null;
  tags: string[] | null;
  created_at: string;
};

export type ClientEvent = {
  id: string;
  client_id: string;
  type:
    | 'created'
    | 'first_visit'
    | 'visit'
    | 'review'
    | 'follow_up'
    | 'birthday_wish'
    | 'lost';
  source: string | null;
  notes: string | null;
  created_at: string;
};

export type Appointment = {
  id: string;
  client_id: string;
  service_id: string;
  staff_id: string | null;
  scheduled_at: string;
  duration_min: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  source: 'public' | 'admin';
  notes: string | null;
  price_xof: number;
  created_at: string;
};

export type Product = {
  id: string;
  sector_id: string | null;
  category_id: string | null;
  name: string;
  sku: string | null;
  brand: string | null;
  category: string | null; // legacy
  price_xof: number;
  cost_xof: number;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
  active: boolean;
  created_at: string;
};

export type Sale = {
  id: string;
  client_id: string | null;
  staff_id: string | null;
  total_xof: number;
  payment_method: 'cash' | 'mobile_money' | 'card' | 'other';
  paid_at: string;
  notes: string | null;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  service_id: string | null;
  name: string;
  quantity: number;
  unit_price_xof: number;
  subtotal_xof: number;
};

export type ExpenseCategory = {
  id: string;
  slug: string;
  name: string;
  display_order: number;
};

export type Expense = {
  id: string;
  category_id: string | null;
  sector_id: string | null;
  amount_xof: number;
  description: string;
  payment_method: 'cash' | 'mobile_money' | 'card' | 'transfer' | 'other';
  receipt_url: string | null;
  paid_at: string;
  created_at: string;
};

export type MonthlyPnL = {
  month: string;
  revenue_xof: number;
  expenses_xof: number;
  profit_xof: number;
};

export type SalonSettings = {
  id: number;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  primary_color: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  whatsapp: string | null;
  opening_hours: Record<string, { open: string; close: string } | null>;
  updated_at: string;
};
