-- =======================================================================
-- OPTIMUM TRANS — Migration Interfaçage Sous-Traitants (STT)
-- Sprint 1 : tables stt_relationships + stt_orders + addon_stt
-- Exécuter dans : Supabase → SQL Editor
-- =======================================================================

-- -----------------------------------------------------------------------
-- ETAPE 1 — Addon addon_stt dans sa_companies
-- -----------------------------------------------------------------------

ALTER TABLE sa_companies
  ADD COLUMN IF NOT EXISTS addon_stt BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------
-- ETAPE 2 — Colonne stt_order_id dans tournees (nullable, non-breaking)
-- -----------------------------------------------------------------------

ALTER TABLE tournees
  ADD COLUMN IF NOT EXISTS stt_order_id UUID;

-- -----------------------------------------------------------------------
-- ETAPE 3 — Table stt_relationships
-- Gérée exclusivement par le superadmin (service role).
-- Les deux compagnies peuvent lire leur propre relation.
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stt_relationships (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_company_id     UUID NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  receiver_company_id  UUID NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  -- Correspond à chauffeurs.entreprise_nom chez le donneur
  entreprise_nom_ref   TEXT NOT NULL,
  actif                BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (donor_company_id, receiver_company_id)
);

CREATE INDEX IF NOT EXISTS idx_stt_rel_donor
  ON stt_relationships(donor_company_id);

CREATE INDEX IF NOT EXISTS idx_stt_rel_receiver
  ON stt_relationships(receiver_company_id);

ALTER TABLE stt_relationships ENABLE ROW LEVEL SECURITY;

-- Lecture : les deux compagnies voient leur propre relation
DROP POLICY IF EXISTS "stt_rel_select_donor"   ON stt_relationships;
DROP POLICY IF EXISTS "stt_rel_select_receiver" ON stt_relationships;

CREATE POLICY "stt_rel_select_donor" ON stt_relationships
  FOR SELECT USING (
    donor_company_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM company_users
      WHERE auth_uid = auth.uid()
        AND company_id = stt_relationships.donor_company_id
        AND actif = true
    )
  );

CREATE POLICY "stt_rel_select_receiver" ON stt_relationships
  FOR SELECT USING (
    receiver_company_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM company_users
      WHERE auth_uid = auth.uid()
        AND company_id = stt_relationships.receiver_company_id
        AND actif = true
    )
  );

-- Pas de INSERT/UPDATE/DELETE via RLS — superadmin utilise le service role

-- -----------------------------------------------------------------------
-- ETAPE 4 — Table stt_orders
-- Statuts : pending_config / pending / assigned / modified /
--           cancelled / refused / validated
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stt_orders (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Parties
  donor_company_id        UUID NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  receiver_company_id     UUID NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  donor_tournee_id        UUID REFERENCES tournees(id) ON DELETE SET NULL,
  semaine_debut           DATE NOT NULL,

  -- Données envoyées par le donneur
  date                    DATE NOT NULL,
  slot                    TEXT NOT NULL,
  heure                   TEXT,
  client_nom              TEXT NOT NULL,
  commissionnaire_nom     TEXT NOT NULL,
  chauffeur_nom_propose   TEXT NOT NULL,
  nb_points_estime        INTEGER,
  nb_heures_estime        NUMERIC(6,2),

  -- Données complétées par le receveur
  chauffeur_nom_assigne   TEXT,
  vehicule_assigne        TEXT,
  changement_chauffeur    BOOLEAN NOT NULL DEFAULT false,
  receiver_validated_at   TIMESTAMPTZ,

  -- Statut et notifications
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending_config','pending','assigned',
                              'modified','cancelled','refused','validated'
                            )),
  modification_note       TEXT,
  donor_notification_read BOOLEAN NOT NULL DEFAULT false,

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stt_orders_donor
  ON stt_orders(donor_company_id, semaine_debut);

CREATE INDEX IF NOT EXISTS idx_stt_orders_receiver
  ON stt_orders(receiver_company_id, semaine_debut);

CREATE INDEX IF NOT EXISTS idx_stt_orders_status
  ON stt_orders(status);

ALTER TABLE stt_orders ENABLE ROW LEVEL SECURITY;

-- Donneur : toutes opérations sur ses propres ordres
DROP POLICY IF EXISTS "stt_orders_donor_all"      ON stt_orders;
DROP POLICY IF EXISTS "stt_orders_receiver_select" ON stt_orders;
DROP POLICY IF EXISTS "stt_orders_receiver_update" ON stt_orders;

CREATE POLICY "stt_orders_donor_all" ON stt_orders
  FOR ALL USING (
    donor_company_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM company_users
      WHERE auth_uid = auth.uid()
        AND company_id = stt_orders.donor_company_id
        AND actif = true
    )
  );

-- Receveur : lecture de ses ordres entrants
CREATE POLICY "stt_orders_receiver_select" ON stt_orders
  FOR SELECT USING (
    receiver_company_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM company_users
      WHERE auth_uid = auth.uid()
        AND company_id = stt_orders.receiver_company_id
        AND actif = true
    )
  );

-- Receveur : mise à jour de ses champs d'assignation uniquement
CREATE POLICY "stt_orders_receiver_update" ON stt_orders
  FOR UPDATE USING (
    receiver_company_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM company_users
      WHERE auth_uid = auth.uid()
        AND company_id = stt_orders.receiver_company_id
        AND actif = true
    )
  );

-- -----------------------------------------------------------------------
-- ETAPE 5 — Trigger : protection des champs par rôle
-- Empêche le receveur de modifier les champs du donneur et vice-versa.
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION stt_orders_field_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_cid UUID;
BEGIN
  -- Résoudre le company_id de l'utilisateur courant
  SELECT company_id INTO v_cid
    FROM company_users
   WHERE auth_uid = auth.uid() AND actif = true
   LIMIT 1;
  IF v_cid IS NULL THEN v_cid := auth.uid(); END IF;

  -- Le receveur ne peut pas modifier les champs propriété du donneur
  IF v_cid = NEW.receiver_company_id AND v_cid != NEW.donor_company_id THEN
    NEW.donor_company_id      := OLD.donor_company_id;
    NEW.receiver_company_id   := OLD.receiver_company_id;
    NEW.donor_tournee_id      := OLD.donor_tournee_id;
    NEW.semaine_debut         := OLD.semaine_debut;
    NEW.date                  := OLD.date;
    NEW.slot                  := OLD.slot;
    NEW.heure                 := OLD.heure;
    NEW.client_nom            := OLD.client_nom;
    NEW.commissionnaire_nom   := OLD.commissionnaire_nom;
    NEW.chauffeur_nom_propose := OLD.chauffeur_nom_propose;
    NEW.nb_points_estime      := OLD.nb_points_estime;
    NEW.nb_heures_estime      := OLD.nb_heures_estime;
  END IF;

  -- Le donneur ne peut pas modifier les champs propriété du receveur
  IF v_cid = NEW.donor_company_id AND v_cid != NEW.receiver_company_id THEN
    NEW.chauffeur_nom_assigne := OLD.chauffeur_nom_assigne;
    NEW.vehicule_assigne      := OLD.vehicule_assigne;
    NEW.receiver_validated_at := OLD.receiver_validated_at;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_stt_orders_field_guard ON stt_orders;

CREATE TRIGGER trg_stt_orders_field_guard
  BEFORE UPDATE ON stt_orders
  FOR EACH ROW EXECUTE FUNCTION stt_orders_field_guard();

-- -----------------------------------------------------------------------
-- ETAPE 6 — FK dans tournees vers stt_orders (après création de la table)
-- -----------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'tournees_stt_order_id_fkey'
       AND table_name = 'tournees'
  ) THEN
    ALTER TABLE tournees
      ADD CONSTRAINT tournees_stt_order_id_fkey
      FOREIGN KEY (stt_order_id)
      REFERENCES stt_orders(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- =======================================================================
-- FIN DU SCRIPT
-- =======================================================================
-- Résumé des changements :
--   • sa_companies.addon_stt         BOOLEAN DEFAULT false
--   • tournees.stt_order_id          UUID nullable → stt_orders(id)
--   • stt_relationships              table + RLS (lecture donor+receiver)
--   • stt_orders                     table + RLS cross-tenant + trigger guard
-- =======================================================================
