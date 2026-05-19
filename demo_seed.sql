-- ============================================================
-- OPTIMUM TRANS — DÉMO SEED (version allégée)
-- Colle ce script dans Supabase SQL Editor et clique Run
-- ============================================================

DO $$
DECLARE
  cid  UUID;
  ch1  TEXT; ch2 TEXT; ch3 TEXT;
  com_cog UUID := gen_random_uuid();
  com_idl UUID := gen_random_uuid();
  cl_bio  UUID := gen_random_uuid();
  cl_nat  UUID := gen_random_uuid();
  cl_col  UUID := gen_random_uuid();
  cl_dar  UUID := gen_random_uuid();
  d DATE;
  dow INT;
  slot_val TEXT;
  pts INT;
  ch TEXT;
BEGIN

  /* ── 0. Récupère company_id depuis l'entreprise existante ── */
  SELECT company_id INTO cid FROM entreprise LIMIT 1;
  IF cid IS NULL THEN RAISE EXCEPTION 'Aucune entreprise trouvée'; END IF;

  /* ── Récupère 3 chauffeurs existants ── */
  SELECT nom INTO ch1 FROM chauffeurs WHERE company_id=cid AND type='salarié'      ORDER BY nom LIMIT 1;
  SELECT nom INTO ch2 FROM chauffeurs WHERE company_id=cid AND type='salarié'      ORDER BY nom LIMIT 1 OFFSET 1;
  SELECT nom INTO ch3 FROM chauffeurs WHERE company_id=cid AND type='sous-traitant' ORDER BY nom LIMIT 1;
  -- Fallback si pas assez de chauffeurs
  IF ch1 IS NULL THEN ch1 := 'Chauffeur 1'; END IF;
  IF ch2 IS NULL THEN ch2 := ch1; END IF;
  IF ch3 IS NULL THEN ch3 := ch1; END IF;


  /* ══════════════════════════════════════════════════════════
     1. ENTREPRISE — coefficient 1, charges fixes 3 000 €
  ══════════════════════════════════════════════════════════ */
  UPDATE entreprise
  SET coefficient_salarie      = 1,
      charges_fixes_mensuelles = 3000
  WHERE company_id = cid;


  /* ══════════════════════════════════════════════════════════
     2. COMMISSIONNAIRES
  ══════════════════════════════════════════════════════════ */
  INSERT INTO commissionnaires (id, company_id, nom, siret, contact, tel, email, adresse, cp, ville)
  VALUES
    (com_cog, cid, 'COGEPART',      '38222585600014', 'M. Renaud',  '01 48 63 52 52', 'contact@cogepart.fr',      '5 Rue de la Haye',        '95700', 'Roissy-en-France'),
    (com_idl, cid, 'ID LOGISTICS',  '45223613400021', 'Mme Laporte','01 60 13 65 00', 'transport@idlogistics.fr', '2 Allée de Longchamp',    '67300', 'Schiltigheim')
  ON CONFLICT DO NOTHING;


  /* ══════════════════════════════════════════════════════════
     3. CLIENTS
  ══════════════════════════════════════════════════════════ */

  -- ── 3a. Clients PROPRES (fixe, sans commissionnaire) ──
  INSERT INTO clients (id, company_id, nom, ville, type_paiement,
    tarif, tarif_dim, tarif_ferie,
    salaire_ch_sem, salaire_ch_dim, salaire_ch_ferie,
    salaire_st_sem, salaire_st_dim, salaire_st_ferie)
  VALUES
    (cl_bio, cid, 'BIOCOOP ILE-DE-FRANCE', 'Paris 11e', 'fixe',
     110, 150, 165,   80, 105, 120,   95, 125, 140),
    (cl_nat, cid, 'NATURALIA PARIS',        'Paris 3e',  'fixe',
     95,  130, 145,   70,  92, 105,   82, 108, 122)
  ON CONFLICT DO NOTHING;

  -- ── 3b. Client COGEPART — au point AM/PM ──
  INSERT INTO clients (id, company_id, nom, ville, type_paiement,
    tarif_point_am, tarif_point_pm,
    salaire_ch_sem, salaire_ch_dim, salaire_ch_ferie,
    salaire_st_sem, salaire_st_dim, salaire_st_ferie,
    commissionnaire_id, commissionnaire_nom)
  VALUES
    (cl_col, cid, 'COLIS PRIVÉ', 'Île-de-France', 'point',
     3.50, 4.20,   90, 118, 135,   105, 138, 158,
     com_cog, 'COGEPART')
  ON CONFLICT DO NOTHING;

  -- ── 3c. Client ID LOGISTICS — fixe ──
  INSERT INTO clients (id, company_id, nom, ville, type_paiement,
    tarif, tarif_dim, tarif_ferie,
    salaire_ch_sem, salaire_ch_dim, salaire_ch_ferie,
    salaire_st_sem, salaire_st_dim, salaire_st_ferie,
    commissionnaire_id, commissionnaire_nom)
  VALUES
    (cl_dar, cid, 'DARTY LOGISTIQUE', 'Seine-Saint-Denis', 'fixe',
     130, 175, 190,   95, 125, 142,   110, 145, 165,
     com_idl, 'ID LOGISTICS')
  ON CONFLICT DO NOTHING;


  /* ══════════════════════════════════════════════════════════
     4. TOURNÉES Mars 2026 (jours ouvrés lun-sam uniquement)
     On insère ~8 tournées par client pour la démo
  ══════════════════════════════════════════════════════════ */

  FOR d IN
    SELECT gs::DATE
    FROM generate_series('2026-03-02'::DATE, '2026-03-26'::DATE, '1 day') gs
    WHERE EXTRACT(DOW FROM gs) BETWEEN 1 AND 6  -- lun=1 à sam=6
  LOOP
    dow := EXTRACT(DOW FROM d);

    -- ── BIOCOOP : fixe, AM, ch1 tous les jours ouvrés lun-ven ──
    IF dow BETWEEN 1 AND 5 THEN
      INSERT INTO tournees (id, company_id, date, chauffeur_nom, client_nom, slot)
      VALUES (gen_random_uuid(), cid, d, ch1, 'BIOCOOP ILE-DE-FRANCE', 'AM')
      ON CONFLICT DO NOTHING;
    END IF;

    -- ── NATURALIA : fixe, AM, ch2, lun/mer/ven uniquement ──
    IF dow IN (1, 3, 5) THEN
      INSERT INTO tournees (id, company_id, date, chauffeur_nom, client_nom, slot)
      VALUES (gen_random_uuid(), cid, d, ch2, 'NATURALIA PARIS', 'AM')
      ON CONFLICT DO NOTHING;
    END IF;

    -- ── COLIS PRIVÉ : au point, AM + PM alternés, ch3 ──
    IF dow BETWEEN 1 AND 5 THEN
      IF EXTRACT(DAY FROM d)::INT % 2 = 0 THEN
        slot_val := 'AM';
        pts := 28 + (EXTRACT(DAY FROM d)::INT % 15);  -- 28-42 pts
      ELSE
        slot_val := 'PM';
        pts := 22 + (EXTRACT(DAY FROM d)::INT % 12);  -- 22-33 pts
      END IF;
      INSERT INTO tournees (id, company_id, date, chauffeur_nom, client_nom, slot, nb_points_reel)
      VALUES (gen_random_uuid(), cid, d, ch3, 'COLIS PRIVÉ', slot_val, pts)
      ON CONFLICT DO NOTHING;
    END IF;

    -- ── DARTY LOGISTIQUE : fixe, AM, ch1 mar/jeu/sam ──
    IF dow IN (2, 4, 6) THEN
      ch := CASE WHEN EXTRACT(DAY FROM d)::INT % 2 = 0 THEN ch1 ELSE ch2 END;
      INSERT INTO tournees (id, company_id, date, chauffeur_nom, client_nom, slot)
      VALUES (gen_random_uuid(), cid, d, ch, 'DARTY LOGISTIQUE', 'AM')
      ON CONFLICT DO NOTHING;
    END IF;

  END LOOP;

  RAISE NOTICE '✅ Démo insérée — company_id: %, ch1: %, ch2: %, ch3: %', cid, ch1, ch2, ch3;

END $$;
