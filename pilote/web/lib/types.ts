export type Category = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  color: string;
  active: boolean;
};

export type Client = {
  id: string;
  phone: string;
  name: string | null;
  notes: string | null;
  created_at: string;
  last_seen_at: string;
  auto_reply_sent: boolean;
};

export type AppSettings = {
  id: number;
  auto_reply_enabled: boolean;
  auto_reply_message: string;
  business_name: string | null;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  client_id: string;
  from_phone: string;
  body: string | null;
  has_media: boolean;
  media_type: string | null;
  category_id: string | null;
  intent: 'rdv' | 'demande_info' | 'envoi_image' | 'autre' | null;
  priority: number;
  ai_summary: string | null;
  status: 'nouveau' | 'lu' | 'traite' | 'ignore';
  received_at: string;
};

export type Appointment = {
  id: string;
  client_id: string;
  category_id: string | null;
  title: string;
  address: string | null;
  scheduled_at: string;
  duration_minutes: number;
  notes: string | null;
  status: 'planifie' | 'confirme' | 'fait' | 'annule';
};

export type WhatsAppStatus = {
  id: number;
  qr_code: string | null;
  connected: boolean;
  phone: string | null;
  disconnect_requested: boolean;
  updated_at: string;
};
