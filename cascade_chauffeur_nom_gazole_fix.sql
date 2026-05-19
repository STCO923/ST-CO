-- Fix trigger cascade_chauffeur_nom_update : la table gazole_pleins
-- a une colonne `chauffeur` (pas `chauffeur_nom`). L'ancien trigger plantait
-- avec : column "chauffeur_nom" does not exist
-- → bloquait toute modification du nom d'un chauffeur dans paramètres.

CREATE OR REPLACE FUNCTION public.cascade_chauffeur_nom_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  slot_key TEXT;
  shift_rec RECORD;
BEGIN
  IF OLD.nom IS DISTINCT FROM NEW.nom THEN
    UPDATE tournees                 SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE planning                 SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE amendes                  SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE chauffeur_avances        SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE fiches_paie              SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE absences                 SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    -- gazole_pleins utilise la colonne `chauffeur` (pas `chauffeur_nom`)
    UPDATE gazole_pleins            SET chauffeur     = NEW.nom WHERE company_id = NEW.company_id AND chauffeur     = OLD.nom;
    UPDATE contrats                 SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE affectations_vehicule    SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE vehicules                SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE chef_equipe_jour         SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE company_users            SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE driver_locations         SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE driver_positions_history SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE soldes_conges            SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    UPDATE tournee_validations      SET chauffeur_nom = NEW.nom WHERE company_id = NEW.company_id AND chauffeur_nom = OLD.nom;
    -- monmarche_shifts : mise a jour du champ chauffeur dans le JSONB slots
    FOR shift_rec IN SELECT id, slots FROM monmarche_shifts WHERE company_id = NEW.company_id LOOP
      FOR slot_key IN SELECT jsonb_object_keys(shift_rec.slots) LOOP
        IF shift_rec.slots->slot_key->>'chauffeur' = OLD.nom THEN
          UPDATE monmarche_shifts
          SET slots = jsonb_set(slots, ARRAY[slot_key, 'chauffeur'], to_jsonb(NEW.nom))
          WHERE id = shift_rec.id;
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
