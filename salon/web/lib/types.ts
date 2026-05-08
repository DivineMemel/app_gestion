export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_xof: number; // FCFA
  duration_min: number;
  image_url: string | null;
  category: string | null;
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
  name: string;
  sku: string | null;
  brand: string | null;
  category: string | null;
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
