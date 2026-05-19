-- Migration: social_posts table
-- Table pour stocker les publications réseaux sociaux (Facebook, etc.)

CREATE TABLE social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  theme text NOT NULL,
  post_text text,
  image_url text,
  published_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending',
  error_message text,
  facebook_post_id text
);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON social_posts
  USING (auth.role() = 'service_role');
