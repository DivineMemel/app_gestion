-- Permet au web de demander une déconnexion WhatsApp
-- Le worker écoute cette colonne en realtime et appelle sock.logout()
alter table whatsapp_status
  add column if not exists disconnect_requested boolean default false;
