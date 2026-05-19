/**
 * T SERVICE & CO — DEMO DATA ENGINE v2.0
 * Société fictive : TRANSIT EXPRESS SARL — Lyon
 * 20 chauffeurs · 15 clients · 22 véhicules · ~120 tournées
 * Mode LECTURE SEULE — toutes les actions sont bloquées
 * Stockage 100% localStorage — AUCUN appel Supabase
 */

(function() {
'use strict';

function dDate(n){var d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dMonth(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function isDemo(){try{var r=localStorage.getItem('ot_session')||sessionStorage.getItem('ot_session');return r&&JSON.parse(r).id==='demo';}catch(e){return false;}}

var ENTREPRISE={id:'demo-e1',company_id:'demo',nom:'TRANSIT EXPRESS SARL',siret:'84312765400018',tel:'04 72 31 55 80',email:'contact@transit-express.fr',site:'www.transit-express.fr',adresse:'12 Rue des Flandres',code_postal:'69009',ville:'Lyon',pays:'France',iban:'FR76 3000 4000 0300 0000 0123 456',bic:'BNPAFRPP',tva:20,coefficient_salarie:1.15,charges_fixes_mensuelles:850,mentions:'Membre FNTV. RC Pro Allianz. Assurance Flotte Groupama.'};

var CHAUFFEURS=[
  {id:'demo-c1', company_id:'demo',nom:'Mohammed Benali',   type:'salarié',      tel:'06 12 34 56 78',permis:'C+CE',statut:'actif',vehicule:'AB-123-CD'},
  {id:'demo-c2', company_id:'demo',nom:'Jean-Pierre Morin', type:'salarié',      tel:'06 23 45 67 89',permis:'C+CE',statut:'actif',vehicule:'EF-456-GH'},
  {id:'demo-c3', company_id:'demo',nom:'Karim Ouattara',    type:'sous-traitant',tel:'06 34 56 78 90',permis:'C',   statut:'actif',vehicule:'IJ-789-KL'},
  {id:'demo-c4', company_id:'demo',nom:'Lucie Fontaine',    type:'salarié',      tel:'06 45 67 89 01',permis:'C+CE',statut:'actif',vehicule:'MN-012-OP'},
  {id:'demo-c5', company_id:'demo',nom:'Sébastien Roy',     type:'salarié',      tel:'06 56 78 90 12',permis:'C+CE',statut:'actif',vehicule:'QR-345-ST'},
  {id:'demo-c6', company_id:'demo',nom:'Amadou Diallo',     type:'salarié',      tel:'06 67 89 01 23',permis:'C+CE',statut:'actif',vehicule:'CD-234-EF'},
  {id:'demo-c7', company_id:'demo',nom:'Patrick Lefèvre',   type:'salarié',      tel:'06 78 90 12 34',permis:'C',   statut:'actif',vehicule:'GH-567-IJ'},
  {id:'demo-c8', company_id:'demo',nom:'Nathalie Girard',   type:'salarié',      tel:'06 89 01 23 45',permis:'C+CE',statut:'actif',vehicule:'KL-890-MN'},
  {id:'demo-c9', company_id:'demo',nom:'Youssef El Amrani', type:'sous-traitant',tel:'06 90 12 34 56',permis:'C+CE',statut:'actif',vehicule:'OP-123-QR'},
  {id:'demo-c10',company_id:'demo',nom:'Thierry Blanc',     type:'salarié',      tel:'06 11 22 33 44',permis:'C',   statut:'actif',vehicule:'ST-456-UV'},
  {id:'demo-c11',company_id:'demo',nom:'Fatou Camara',      type:'salarié',      tel:'06 22 33 44 55',permis:'C+CE',statut:'actif',vehicule:'WX-789-YZ'},
  {id:'demo-c12',company_id:'demo',nom:'Bruno Martinez',    type:'salarié',      tel:'06 33 44 55 66',permis:'C+CE',statut:'actif',vehicule:'AB-456-CD'},
  {id:'demo-c13',company_id:'demo',nom:'Stéphane Roux',     type:'sous-traitant',tel:'06 44 55 66 77',permis:'C',   statut:'actif',vehicule:'EF-789-GH'},
  {id:'demo-c14',company_id:'demo',nom:'Omar Sy',           type:'salarié',      tel:'06 55 66 77 88',permis:'C+CE',statut:'actif',vehicule:'IJ-012-KL'},
  {id:'demo-c15',company_id:'demo',nom:'Christophe Duval',  type:'salarié',      tel:'06 66 77 88 99',permis:'C+CE',statut:'actif',vehicule:'MN-345-OP'},
  {id:'demo-c16',company_id:'demo',nom:'David Nguyen',      type:'salarié',      tel:'06 77 88 99 00',permis:'C',   statut:'actif',vehicule:'QR-678-ST'},
  {id:'demo-c17',company_id:'demo',nom:'Sophie Lambert',    type:'sous-traitant',tel:'06 88 99 00 11',permis:'C+CE',statut:'actif',vehicule:'UV-901-WX'},
  {id:'demo-c18',company_id:'demo',nom:'Ibrahim Traoré',    type:'salarié',      tel:'06 99 00 11 22',permis:'C+CE',statut:'actif',vehicule:'YZ-234-AB'},
  {id:'demo-c19',company_id:'demo',nom:'Laurent Perrin',    type:'salarié',      tel:'06 10 21 32 43',permis:'C',   statut:'actif',vehicule:'CD-567-EF'},
  {id:'demo-c20',company_id:'demo',nom:'Antoine Mercier',   type:'sous-traitant',tel:'06 20 31 42 53',permis:'C+CE',statut:'actif',vehicule:'GH-890-IJ'}
];

var CLIENTS=[
  {id:'demo-cl1', company_id:'demo',nom:'CARREFOUR Vénissieux',  adresse:'80 Av. Joliot-Curie',   code_postal:'69200',ville:'Vénissieux',  type_paiement:'fixe', tarif:225,tarif_dim:295,tarif_ferie:340, salaire_ch_sem:50,salaire_ch_dim:65,salaire_ch_ferie:75,  salaire_st_sem:62,salaire_st_dim:80,salaire_st_ferie:92,  contact:'M. Dupont',   tel:'04 72 51 20 00',email:'logistique@carrefour-venissieux.fr',lat:45.698,lng:4.887},
  {id:'demo-cl2', company_id:'demo',nom:'LECLERC Bron',          adresse:'25 Rue du Dauphiné',    code_postal:'69500',ville:'Bron',         type_paiement:'fixe', tarif:198,tarif_dim:258,tarif_ferie:295, salaire_ch_sem:44,salaire_ch_dim:57,salaire_ch_ferie:66,  salaire_st_sem:55,salaire_st_dim:71,salaire_st_ferie:82,  contact:'Mme Martin',  tel:'04 72 14 30 00',email:'direction@leclerc-bron.fr',lat:45.728,lng:4.916},
  {id:'demo-cl3', company_id:'demo',nom:'METRO CASH Lyon',       adresse:'5 Rue du Repos',        code_postal:'69007',ville:'Lyon',         type_paiement:'fixe', tarif:275,tarif_dim:360,tarif_ferie:405, salaire_ch_sem:60,salaire_ch_dim:78,salaire_ch_ferie:90,  salaire_st_sem:75,salaire_st_dim:98,salaire_st_ferie:112, contact:'M. Bernard',  tel:'04 72 71 50 00',email:'appro@metro-lyon.fr',lat:45.733,lng:4.839},
  {id:'demo-cl4', company_id:'demo',nom:'LIDL Décines',          adresse:'15 Av. des Nations',    code_postal:'69150',ville:'Décines',      type_paiement:'fixe', tarif:192,tarif_dim:250,tarif_ferie:285, salaire_ch_sem:42,salaire_ch_dim:55,salaire_ch_ferie:63,  salaire_st_sem:52,salaire_st_dim:68,salaire_st_ferie:78,  contact:'M. Schmidt',  tel:'04 78 49 10 00',email:'livraisons@lidl-decines.fr',lat:45.769,lng:4.963},
  {id:'demo-cl5', company_id:'demo',nom:'ALDI Villeurbanne',     adresse:'42 Cours Émile Zola',   code_postal:'69100',ville:'Villeurbanne', type_paiement:'fixe', tarif:185,tarif_dim:240,tarif_ferie:275, salaire_ch_sem:41,salaire_ch_dim:53,salaire_ch_ferie:61,  salaire_st_sem:50,salaire_st_dim:66,salaire_st_ferie:75,  contact:'Mme Klein',   tel:'04 78 68 40 00',email:'stock@aldi-villeurbanne.fr',lat:45.771,lng:4.881},
  {id:'demo-cl6', company_id:'demo',nom:'BIOCOOP Lyon 3',        adresse:'18 Rue Moncey',         code_postal:'69003',ville:'Lyon',         type_paiement:'fixe', tarif:168,tarif_dim:218,tarif_ferie:248, salaire_ch_sem:37,salaire_ch_dim:48,salaire_ch_ferie:55,  salaire_st_sem:46,salaire_st_dim:60,salaire_st_ferie:68,  contact:'M. Petit',    tel:'04 72 60 80 00',email:'commandes@biocoop-lyon3.fr',lat:45.749,lng:4.856},
  {id:'demo-cl7', company_id:'demo',nom:'INTERMARCHÉ Oullins',   adresse:'32 Grande Rue',         code_postal:'69600',ville:'Oullins',      type_paiement:'fixe', tarif:210,tarif_dim:275,tarif_ferie:310, salaire_ch_sem:46,salaire_ch_dim:60,salaire_ch_ferie:69,  salaire_st_sem:58,salaire_st_dim:75,salaire_st_ferie:86,  contact:'M. Faure',    tel:'04 78 51 30 00',email:'logistique@intermarche-oullins.fr',lat:45.714,lng:4.810},
  {id:'demo-cl8', company_id:'demo',nom:'SYSTÈME U Caluire',     adresse:'10 Chemin de Crépieux', code_postal:'69300',ville:'Caluire',      type_paiement:'fixe', tarif:195,tarif_dim:255,tarif_ferie:290, salaire_ch_sem:43,salaire_ch_dim:56,salaire_ch_ferie:64,  salaire_st_sem:53,salaire_st_dim:69,salaire_st_ferie:80,  contact:'Mme Dubois',  tel:'04 78 23 15 00',email:'reception@systemu-caluire.fr',lat:45.795,lng:4.858},
  {id:'demo-cl9', company_id:'demo',nom:'LEROY MERLIN Bron',     adresse:'100 Av. Franklin Roosevelt',code_postal:'69500',ville:'Bron',     type_paiement:'fixe', tarif:310,tarif_dim:405,tarif_ferie:455, salaire_ch_sem:68,salaire_ch_dim:88,salaire_ch_ferie:100, salaire_st_sem:85,salaire_st_dim:110,salaire_st_ferie:125, contact:'M. Gauthier', tel:'04 72 37 85 00',email:'transport@leroymerlin-bron.fr',lat:45.726,lng:4.908},
  {id:'demo-cl10',company_id:'demo',nom:'IKEA LOGISTIQUE',       adresse:'2 Bd Irène Joliot-Curie',code_postal:'69800',ville:'Saint-Priest',type_paiement:'fixe', tarif:345,tarif_dim:450,tarif_ferie:505, salaire_ch_sem:76,salaire_ch_dim:99,salaire_ch_ferie:114, salaire_st_sem:92,salaire_st_dim:120,salaire_st_ferie:138, contact:'Mme Svensson',tel:'04 72 79 20 00',email:'logistics@ikea-saintpriest.fr',lat:45.692,lng:4.940,commissionnaire_id:'demo-com4',commissionnaire_nom:'GEODIS'},
  {id:'demo-cl11',company_id:'demo',nom:'COLIS PRIVÉ',           ville:'Île-de-France',            type_paiement:'point', tarif_point_am:6.50,tarif_point_pm:7.20, salaire_ch_sem:52,salaire_ch_dim:68,salaire_ch_ferie:78, salaire_st_sem:65,salaire_st_dim:85,salaire_st_ferie:97, commissionnaire_id:'demo-com1',commissionnaire_nom:'COGEPART',      contact:'M. Renaud',   tel:'01 48 63 52 52',email:'contact@cogepart.fr'},
  {id:'demo-cl12',company_id:'demo',nom:'CHRONOPOST Lyon',       ville:'Lyon',                     type_paiement:'point', tarif_point_am:5.80,tarif_point_pm:6.60, salaire_ch_sem:48,salaire_ch_dim:62,salaire_ch_ferie:72, salaire_st_sem:60,salaire_st_dim:78,salaire_st_ferie:90, commissionnaire_id:'demo-com3',commissionnaire_nom:'XPO LOGISTICS', contact:'M. Vidal',    tel:'04 72 22 33 44',email:'dispatch@chronopost-lyon.fr'},
  {id:'demo-cl13',company_id:'demo',nom:'DARTY LOGISTIQUE',      ville:'Seine-Saint-Denis',        type_paiement:'fixe',  tarif:295,tarif_dim:385,tarif_ferie:435,  salaire_ch_sem:65,salaire_ch_dim:85,salaire_ch_ferie:97,  salaire_st_sem:80,salaire_st_dim:104,salaire_st_ferie:120, commissionnaire_id:'demo-com2',commissionnaire_nom:'ID LOGISTICS',  contact:'Mme Laporte', tel:'01 60 13 65 00',email:'transport@idlogistics.fr'},
  {id:'demo-cl14',company_id:'demo',nom:'FNAC Logistique',       adresse:'ZI Mi-Plaine',           code_postal:'69800',ville:'Saint-Priest',type_paiement:'fixe', tarif:265,tarif_dim:345,tarif_ferie:390, salaire_ch_sem:58,salaire_ch_dim:75,salaire_ch_ferie:86,  salaire_st_sem:72,salaire_st_dim:94,salaire_st_ferie:108, commissionnaire_id:'demo-com2',commissionnaire_nom:'ID LOGISTICS',  contact:'M. Renard',   tel:'04 72 79 50 00',email:'supply@fnac-logistique.fr',lat:45.695,lng:4.935},
  {id:'demo-cl15',company_id:'demo',nom:'AMAZON LOGISTICS',      adresse:'Parc Activités Chesnes', code_postal:'38070',ville:'Saint-Quentin-Fallavier',type_paiement:'fixe', tarif:330,tarif_dim:430,tarif_ferie:485, salaire_ch_sem:73,salaire_ch_dim:95,salaire_ch_ferie:108, salaire_st_sem:88,salaire_st_dim:115,salaire_st_ferie:132, commissionnaire_id:'demo-com4',commissionnaire_nom:'GEODIS',        contact:'M. Johnson',  tel:'04 74 94 30 00',email:'ops@amazon-lyon.fr',lat:45.626,lng:5.102},
  {id:'demo-cl16',company_id:'demo',nom:'DELIFRESH',             ville:'Île-de-France',           type_paiement:'zone', salaire_ch_sem:55,salaire_ch_dim:72,salaire_ch_ferie:82, salaire_st_sem:68,salaire_st_dim:88,salaire_st_ferie:101, contact:'Mme Lefèvre', tel:'01 53 25 80 00',email:'ops@delifresh.fr'}
];

// ── Démo : zones et mapping villes/CP (utilisés par OT_ZONE en mode demo) ──
var DEMO_ZONES = [
  {id:'demo-z1', company_id:'demo', zone:'1', tarif:1.50},
  {id:'demo-z2', company_id:'demo', zone:'2', tarif:1.20},
  {id:'demo-z3', company_id:'demo', zone:'3', tarif:0.95}
];
var DEMO_ZONE_CITIES = [
  {id:'demo-zc1', company_id:'demo', ville:'LYON',           cp_prefix:'69', zone:'1'},
  {id:'demo-zc2', company_id:'demo', ville:'VILLEURBANNE',   cp_prefix:null, zone:'1'},
  {id:'demo-zc3', company_id:'demo', ville:'BRON',           cp_prefix:null, zone:'2'},
  {id:'demo-zc4', company_id:'demo', ville:'VENISSIEUX',     cp_prefix:null, zone:'2'},
  {id:'demo-zc5', company_id:'demo', ville:'SAINT PRIEST',   cp_prefix:null, zone:'3'},
  {id:'demo-zc6', company_id:'demo', ville:'OULLINS',        cp_prefix:null, zone:'3'}
];

var COMMISSIONNAIRES=[
  {id:'demo-com1',company_id:'demo',nom:'COGEPART',       siret:'38222585600014',contact:'M. Renaud',  tel:'01 48 63 52 52',email:'contact@cogepart.fr',        adresse:'5 Rue de la Haye',    cp:'95700',ville:'Roissy-en-France'},
  {id:'demo-com2',company_id:'demo',nom:'ID LOGISTICS',   siret:'45223613400021',contact:'Mme Laporte',tel:'01 60 13 65 00',email:'transport@idlogistics.fr',   adresse:'2 Allée de Longchamp',cp:'67300',ville:'Schiltigheim'},
  {id:'demo-com3',company_id:'demo',nom:'XPO LOGISTICS',  siret:'43459183900036',contact:'M. Vidal',   tel:'04 72 22 33 44',email:'operations@xpo-lyon.fr',     adresse:'18 Rue des Mercières',cp:'69140',ville:'Rillieux-la-Pape'},
  {id:'demo-com4',company_id:'demo',nom:'GEODIS',         siret:'30396425800052',contact:'Mme Arnaud', tel:'04 72 60 55 00',email:'lyon@geodis.com',             adresse:'45 Av. Jean Jaurès',  cp:'69007',ville:'Lyon'}
];

var VEHICULES=[
  {id:'demo-v1', company_id:'demo',immatriculation:'AB-123-CD',marque:'Renault',  modele:'Master III 3.5T',    annee:2021,km:87420,  ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2026-11-15',chauffeur_nom:'Mohammed Benali',   assurance_mensuel:180},
  {id:'demo-v2', company_id:'demo',immatriculation:'EF-456-GH',marque:'Mercedes', modele:'Sprinter 516 5T',    annee:2020,km:124800, ptac:5000, type:'porteur',   statut:'actif',   prochain_ct:'2027-02-20',chauffeur_nom:'Jean-Pierre Morin', assurance_mensuel:225},
  {id:'demo-v3', company_id:'demo',immatriculation:'IJ-789-KL',marque:'Ford',     modele:'Transit 2T 3T',      annee:2022,km:43100,  ptac:3000, type:'fourgon',   statut:'actif',   prochain_ct:'2027-09-05',chauffeur_nom:'Karim Ouattara',    assurance_mensuel:165},
  {id:'demo-v4', company_id:'demo',immatriculation:'MN-012-OP',marque:'Peugeot',  modele:'Boxer L3H2 3.3T',    annee:2021,km:68900,  ptac:3300, type:'fourgon',   statut:'actif',   prochain_ct:'2026-08-30',chauffeur_nom:'Lucie Fontaine',    assurance_mensuel:172},
  {id:'demo-v5', company_id:'demo',immatriculation:'QR-345-ST',marque:'Iveco',    modele:'Daily 70C18 7T',     annee:2019,km:198500, ptac:7000, type:'porteur',   statut:'actif',   prochain_ct:'2026-12-01',chauffeur_nom:'Sébastien Roy',     assurance_mensuel:255},
  {id:'demo-v6', company_id:'demo',immatriculation:'CD-234-EF',marque:'Renault',  modele:'Master III 3.5T',    annee:2022,km:62300,  ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2027-03-18',chauffeur_nom:'Amadou Diallo',     assurance_mensuel:178},
  {id:'demo-v7', company_id:'demo',immatriculation:'GH-567-IJ',marque:'Mercedes', modele:'Sprinter 314 3.5T',  annee:2021,km:91200,  ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2026-07-22',chauffeur_nom:'Patrick Lefèvre',   assurance_mensuel:195},
  {id:'demo-v8', company_id:'demo',immatriculation:'KL-890-MN',marque:'Iveco',    modele:'Daily 35S14 3.5T',   annee:2023,km:34600,  ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2027-11-10',chauffeur_nom:'Nathalie Girard',   assurance_mensuel:168},
  {id:'demo-v9', company_id:'demo',immatriculation:'OP-123-QR',marque:'Ford',     modele:'Transit Custom 3T',  annee:2022,km:55800,  ptac:3000, type:'fourgon',   statut:'actif',   prochain_ct:'2027-05-14',chauffeur_nom:'Youssef El Amrani', assurance_mensuel:160},
  {id:'demo-v10',company_id:'demo',immatriculation:'ST-456-UV',marque:'Peugeot',  modele:'Boxer L4H2 4T',      annee:2020,km:112400, ptac:4000, type:'fourgon',   statut:'actif',   prochain_ct:'2026-10-05',chauffeur_nom:'Thierry Blanc',     assurance_mensuel:185},
  {id:'demo-v11',company_id:'demo',immatriculation:'WX-789-YZ',marque:'Renault',  modele:'Master III 3.5T',    annee:2023,km:28900,  ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2028-01-20',chauffeur_nom:'Fatou Camara',      assurance_mensuel:175},
  {id:'demo-v12',company_id:'demo',immatriculation:'AB-456-CD',marque:'Mercedes', modele:'Sprinter 516 5T',    annee:2021,km:105600, ptac:5000, type:'porteur',   statut:'actif',   prochain_ct:'2026-09-12',chauffeur_nom:'Bruno Martinez',    assurance_mensuel:228},
  {id:'demo-v13',company_id:'demo',immatriculation:'EF-789-GH',marque:'Fiat',     modele:'Ducato L3H2 3.5T',   annee:2022,km:47200,  ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2027-06-30',chauffeur_nom:'Stéphane Roux',     assurance_mensuel:162},
  {id:'demo-v14',company_id:'demo',immatriculation:'IJ-012-KL',marque:'Iveco',    modele:'Daily 50C18 5T',     annee:2020,km:138700, ptac:5000, type:'porteur',   statut:'actif',   prochain_ct:'2026-06-15',chauffeur_nom:'Omar Sy',           assurance_mensuel:235},
  {id:'demo-v15',company_id:'demo',immatriculation:'MN-345-OP',marque:'MAN',      modele:'TGE 3.180 5T',       annee:2021,km:96400,  ptac:5000, type:'porteur',   statut:'actif',   prochain_ct:'2026-08-08',chauffeur_nom:'Christophe Duval',  assurance_mensuel:242},
  {id:'demo-v16',company_id:'demo',immatriculation:'QR-678-ST',marque:'Renault',  modele:'Kangoo Express 1.5T',annee:2023,km:18200,  ptac:1500, type:'utilitaire',statut:'actif',   prochain_ct:'2028-04-12',chauffeur_nom:'David Nguyen',      assurance_mensuel:92},
  {id:'demo-v17',company_id:'demo',immatriculation:'UV-901-WX',marque:'Ford',     modele:'Transit 2T 3.5T',    annee:2021,km:78500,  ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2026-12-22',chauffeur_nom:'Sophie Lambert',    assurance_mensuel:170},
  {id:'demo-v18',company_id:'demo',immatriculation:'YZ-234-AB',marque:'Mercedes', modele:'Sprinter 519 5T',    annee:2022,km:72100,  ptac:5000, type:'porteur',   statut:'actif',   prochain_ct:'2027-04-05',chauffeur_nom:'Ibrahim Traoré',    assurance_mensuel:230},
  {id:'demo-v19',company_id:'demo',immatriculation:'CD-567-EF',marque:'Peugeot',  modele:'Expert L3 2.5T',     annee:2023,km:22400,  ptac:2500, type:'utilitaire',statut:'actif',   prochain_ct:'2028-02-18',chauffeur_nom:'Laurent Perrin',    assurance_mensuel:105},
  {id:'demo-v20',company_id:'demo',immatriculation:'GH-890-IJ',marque:'Iveco',    modele:'Daily 35C16 3.5T',   annee:2020,km:142800, ptac:3500, type:'fourgon',   statut:'revision',prochain_ct:'2026-05-01',chauffeur_nom:'Antoine Mercier',   assurance_mensuel:175},
  {id:'demo-v21',company_id:'demo',immatriculation:'KL-123-MN',marque:'Renault',  modele:'Master III 3.5T',    annee:2024,km:8400,   ptac:3500, type:'fourgon',   statut:'actif',   prochain_ct:'2028-06-10',chauffeur_nom:null,                 assurance_mensuel:182},
  {id:'demo-v22',company_id:'demo',immatriculation:'OP-456-QR',marque:'Fiat',     modele:'Ducato L2H2 3.3T',   annee:2024,km:5200,   ptac:3300, type:'fourgon',   statut:'actif',   prochain_ct:'2028-08-25',chauffeur_nom:null,                 assurance_mensuel:158}
];

var GAZOLE=[
  {id:'demo-g1', date:dDate(-1), chauffeur:'Mohammed Benali',   vehicule:'AB-123-CD',litres:62.5,montant:87.50, station:'Total Lyon 9'},
  {id:'demo-g2', date:dDate(-1), chauffeur:'Amadou Diallo',     vehicule:'CD-234-EF',litres:58.0,montant:81.20, station:'Total Lyon 9'},
  {id:'demo-g3', date:dDate(-2), chauffeur:'Jean-Pierre Morin', vehicule:'EF-456-GH',litres:85.0,montant:119.00,station:'BP Vénissieux'},
  {id:'demo-g4', date:dDate(-2), chauffeur:'Bruno Martinez',    vehicule:'AB-456-CD',litres:82.0,montant:114.80,station:'BP Vénissieux'},
  {id:'demo-g5', date:dDate(-3), chauffeur:'Lucie Fontaine',    vehicule:'MN-012-OP',litres:55.0,montant:77.00, station:'Total Lyon 9'},
  {id:'demo-g6', date:dDate(-3), chauffeur:'Patrick Lefèvre',   vehicule:'GH-567-IJ',litres:60.5,montant:84.70, station:'Avia Villeurbanne'},
  {id:'demo-g7', date:dDate(-4), chauffeur:'Karim Ouattara',    vehicule:'IJ-789-KL',litres:48.0,montant:67.20, station:'Intermarché Bron'},
  {id:'demo-g8', date:dDate(-4), chauffeur:'Nathalie Girard',   vehicule:'KL-890-MN',litres:52.5,montant:73.50, station:'Esso Décines'},
  {id:'demo-g9', date:dDate(-5), chauffeur:'Mohammed Benali',   vehicule:'AB-123-CD',litres:60.0,montant:84.00, station:'Total Lyon 9'},
  {id:'demo-g10',date:dDate(-5), chauffeur:'Thierry Blanc',     vehicule:'ST-456-UV',litres:65.0,montant:91.00, station:'Shell Écully'},
  {id:'demo-g11',date:dDate(-6), chauffeur:'Sébastien Roy',     vehicule:'QR-345-ST',litres:95.0,montant:133.00,station:'Shell A7 Sud'},
  {id:'demo-g12',date:dDate(-6), chauffeur:'Omar Sy',           vehicule:'IJ-012-KL',litres:88.0,montant:123.20,station:'Total Gerland'},
  {id:'demo-g13',date:dDate(-7), chauffeur:'Jean-Pierre Morin', vehicule:'EF-456-GH',litres:80.0,montant:112.00,station:'BP Vénissieux'},
  {id:'demo-g14',date:dDate(-7), chauffeur:'Fatou Camara',      vehicule:'WX-789-YZ',litres:56.0,montant:78.40, station:'Total Lyon 9'},
  {id:'demo-g15',date:dDate(-7), chauffeur:'Ibrahim Traoré',    vehicule:'YZ-234-AB',litres:78.0,montant:109.20,station:'Avia Vaulx-en-Velin'},
  {id:'demo-g16',date:dDate(-8), chauffeur:'Lucie Fontaine',    vehicule:'MN-012-OP',litres:52.0,montant:72.80, station:'Total Lyon 9'},
  {id:'demo-g17',date:dDate(-8), chauffeur:'Christophe Duval',  vehicule:'MN-345-OP',litres:90.0,montant:126.00,station:'Shell A7 Sud'},
  {id:'demo-g18',date:dDate(-9), chauffeur:'Karim Ouattara',    vehicule:'IJ-789-KL',litres:50.0,montant:70.00, station:'Esso Décines'},
  {id:'demo-g19',date:dDate(-9), chauffeur:'David Nguyen',      vehicule:'QR-678-ST',litres:32.0,montant:44.80, station:'Intermarché Oullins'},
  {id:'demo-g20',date:dDate(-10),chauffeur:'Mohammed Benali',   vehicule:'AB-123-CD',litres:63.0,montant:88.20, station:'Total Lyon 9'},
  {id:'demo-g21',date:dDate(-10),chauffeur:'Amadou Diallo',     vehicule:'CD-234-EF',litres:60.0,montant:84.00, station:'Avia Villeurbanne'},
  {id:'demo-g22',date:dDate(-11),chauffeur:'Sébastien Roy',     vehicule:'QR-345-ST',litres:90.0,montant:126.00,station:'Shell A7 Sud'},
  {id:'demo-g23',date:dDate(-11),chauffeur:'Stéphane Roux',     vehicule:'EF-789-GH',litres:54.0,montant:75.60, station:'Total Part-Dieu'},
  {id:'demo-g24',date:dDate(-12),chauffeur:'Jean-Pierre Morin', vehicule:'EF-456-GH',litres:82.0,montant:114.80,station:'BP Vénissieux'},
  {id:'demo-g25',date:dDate(-12),chauffeur:'Youssef El Amrani', vehicule:'OP-123-QR',litres:48.0,montant:67.20, station:'Total Caluire'},
  {id:'demo-g26',date:dDate(-13),chauffeur:'Patrick Lefèvre',   vehicule:'GH-567-IJ',litres:58.0,montant:81.20, station:'Avia Villeurbanne'},
  {id:'demo-g27',date:dDate(-13),chauffeur:'Laurent Perrin',    vehicule:'CD-567-EF',litres:38.0,montant:53.20, station:'Intermarché Oullins'},
  {id:'demo-g28',date:dDate(-14),chauffeur:'Nathalie Girard',   vehicule:'KL-890-MN',litres:55.0,montant:77.00, station:'Esso Décines'},
  {id:'demo-g29',date:dDate(-14),chauffeur:'Sophie Lambert',    vehicule:'UV-901-WX',litres:57.0,montant:79.80, station:'Total Lyon 9'},
  {id:'demo-g30',date:dDate(-15),chauffeur:'Thierry Blanc',     vehicule:'ST-456-UV',litres:62.0,montant:86.80, station:'Shell Écully'},
  {id:'demo-g31',date:dDate(-16),chauffeur:'Bruno Martinez',    vehicule:'AB-456-CD',litres:84.0,montant:117.60,station:'BP Vénissieux'},
  {id:'demo-g32',date:dDate(-16),chauffeur:'Omar Sy',           vehicule:'IJ-012-KL',litres:86.0,montant:120.40,station:'Total Gerland'},
  {id:'demo-g33',date:dDate(-17),chauffeur:'Mohammed Benali',   vehicule:'AB-123-CD',litres:61.0,montant:85.40, station:'Total Lyon 9'},
  {id:'demo-g34',date:dDate(-17),chauffeur:'Fatou Camara',      vehicule:'WX-789-YZ',litres:54.0,montant:75.60, station:'Total Lyon 9'},
  {id:'demo-g35',date:dDate(-18),chauffeur:'Amadou Diallo',     vehicule:'CD-234-EF',litres:59.0,montant:82.60, station:'Avia Villeurbanne'},
  {id:'demo-g36',date:dDate(-18),chauffeur:'Christophe Duval',  vehicule:'MN-345-OP',litres:92.0,montant:128.80,station:'Shell A7 Sud'},
  {id:'demo-g37',date:dDate(-19),chauffeur:'Ibrahim Traoré',    vehicule:'YZ-234-AB',litres:76.0,montant:106.40,station:'Avia Vaulx-en-Velin'},
  {id:'demo-g38',date:dDate(-20),chauffeur:'Sébastien Roy',     vehicule:'QR-345-ST',litres:88.0,montant:123.20,station:'Shell A7 Sud'},
  {id:'demo-g39',date:dDate(-20),chauffeur:'Jean-Pierre Morin', vehicule:'EF-456-GH',litres:79.0,montant:110.60,station:'BP Vénissieux'},
  {id:'demo-g40',date:dDate(-21),chauffeur:'Lucie Fontaine',    vehicule:'MN-012-OP',litres:53.0,montant:74.20, station:'Total Lyon 9'},
  {id:'demo-g41',date:dDate(-22),chauffeur:'Karim Ouattara',    vehicule:'IJ-789-KL',litres:49.0,montant:68.60, station:'Intermarché Bron'},
  {id:'demo-g42',date:dDate(-23),chauffeur:'Patrick Lefèvre',   vehicule:'GH-567-IJ',litres:61.0,montant:85.40, station:'Avia Villeurbanne'},
  {id:'demo-g43',date:dDate(-24),chauffeur:'Nathalie Girard',   vehicule:'KL-890-MN',litres:50.0,montant:70.00, station:'Esso Décines'},
  {id:'demo-g44',date:dDate(-25),chauffeur:'Antoine Mercier',   vehicule:'GH-890-IJ',litres:56.0,montant:78.40, station:'Total Caluire'},
  {id:'demo-g45',date:dDate(-27),chauffeur:'David Nguyen',      vehicule:'QR-678-ST',litres:30.0,montant:42.00, station:'Intermarché Oullins'}
];

var RH={
  contrats:[
    {id:'demo-rh1', company_id:'demo',chauffeur_nom:'Mohammed Benali',   type:'CDI',date_debut:'2022-03-01',date_fin:null,         salaire:2200,heures:35,statut:'actif'},
    {id:'demo-rh2', company_id:'demo',chauffeur_nom:'Jean-Pierre Morin', type:'CDI',date_debut:'2021-09-15',date_fin:null,         salaire:2380,heures:35,statut:'actif'},
    {id:'demo-rh3', company_id:'demo',chauffeur_nom:'Lucie Fontaine',    type:'CDI',date_debut:'2023-01-02',date_fin:null,         salaire:2120,heures:35,statut:'actif'},
    {id:'demo-rh4', company_id:'demo',chauffeur_nom:'Sébastien Roy',     type:'CDI',date_debut:'2022-06-20',date_fin:null,         salaire:2300,heures:35,statut:'actif'},
    {id:'demo-rh5', company_id:'demo',chauffeur_nom:'Amadou Diallo',     type:'CDI',date_debut:'2023-04-10',date_fin:null,         salaire:2150,heures:35,statut:'actif'},
    {id:'demo-rh6', company_id:'demo',chauffeur_nom:'Patrick Lefèvre',   type:'CDI',date_debut:'2021-11-01',date_fin:null,         salaire:2250,heures:35,statut:'actif'},
    {id:'demo-rh7', company_id:'demo',chauffeur_nom:'Nathalie Girard',   type:'CDI',date_debut:'2023-06-15',date_fin:null,         salaire:2080,heures:35,statut:'actif'},
    {id:'demo-rh8', company_id:'demo',chauffeur_nom:'Thierry Blanc',     type:'CDI',date_debut:'2022-09-01',date_fin:null,         salaire:2180,heures:35,statut:'actif'},
    {id:'demo-rh9', company_id:'demo',chauffeur_nom:'Fatou Camara',      type:'CDI',date_debut:'2023-09-01',date_fin:null,         salaire:2050,heures:35,statut:'actif'},
    {id:'demo-rh10',company_id:'demo',chauffeur_nom:'Bruno Martinez',    type:'CDI',date_debut:'2022-01-15',date_fin:null,         salaire:2320,heures:35,statut:'actif'},
    {id:'demo-rh11',company_id:'demo',chauffeur_nom:'Omar Sy',           type:'CDI',date_debut:'2023-02-01',date_fin:null,         salaire:2200,heures:35,statut:'actif'},
    {id:'demo-rh12',company_id:'demo',chauffeur_nom:'Christophe Duval',  type:'CDI',date_debut:'2021-06-01',date_fin:null,         salaire:2450,heures:35,statut:'actif'},
    {id:'demo-rh13',company_id:'demo',chauffeur_nom:'David Nguyen',      type:'CDD',date_debut:'2025-01-01',date_fin:'2026-12-31',salaire:1980,heures:35,statut:'actif'},
    {id:'demo-rh14',company_id:'demo',chauffeur_nom:'Ibrahim Traoré',    type:'CDI',date_debut:'2023-11-01',date_fin:null,         salaire:2100,heures:35,statut:'actif'},
    {id:'demo-rh15',company_id:'demo',chauffeur_nom:'Laurent Perrin',    type:'CDD',date_debut:'2025-06-01',date_fin:'2027-05-31',salaire:2020,heures:35,statut:'actif'}
  ],
  demandes:[
    {id:'demo-d1',company_id:'demo',chauffeur_nom:'Mohammed Benali',   type:'CP',      date_debut:dDate(5),  date_fin:dDate(12), statut:'en_attente',motif:'Vacances été'},
    {id:'demo-d2',company_id:'demo',chauffeur_nom:'Lucie Fontaine',    type:'RTT',     date_debut:dDate(2),  date_fin:dDate(2),  statut:'approuve',  motif:'RTT'},
    {id:'demo-d3',company_id:'demo',chauffeur_nom:'Sébastien Roy',     type:'CP',      date_debut:dDate(-5), date_fin:dDate(-3), statut:'approuve',  motif:'Congé posé'},
    {id:'demo-d4',company_id:'demo',chauffeur_nom:'Jean-Pierre Morin', type:'Maladie', date_debut:dDate(-8), date_fin:dDate(-6), statut:'approuve',  motif:'Arrêt maladie'},
    {id:'demo-d5',company_id:'demo',chauffeur_nom:'Amadou Diallo',     type:'CP',      date_debut:dDate(8),  date_fin:dDate(15), statut:'en_attente',motif:'Vacances familiales'},
    {id:'demo-d6',company_id:'demo',chauffeur_nom:'Nathalie Girard',   type:'CP',      date_debut:dDate(3),  date_fin:dDate(7),  statut:'approuve',  motif:'Congé annuel'},
    {id:'demo-d7',company_id:'demo',chauffeur_nom:'Omar Sy',           type:'RTT',     date_debut:dDate(1),  date_fin:dDate(1),  statut:'en_attente',motif:'RTT récupération'},
    {id:'demo-d8',company_id:'demo',chauffeur_nom:'Ibrahim Traoré',    type:'Maladie', date_debut:dDate(-2), date_fin:dDate(-1), statut:'approuve',  motif:'Grippe'}
  ],
  fiches:[
    {id:'demo-f1', company_id:'demo',chauffeur_nom:'Mohammed Benali',   mois:dMonth(),salaire_brut:2200,salaire_net:1716,cotisations:484, heures_sup:4, prime:80},
    {id:'demo-f2', company_id:'demo',chauffeur_nom:'Jean-Pierre Morin', mois:dMonth(),salaire_brut:2380,salaire_net:1856,cotisations:524, heures_sup:6, prime:120},
    {id:'demo-f3', company_id:'demo',chauffeur_nom:'Lucie Fontaine',    mois:dMonth(),salaire_brut:2120,salaire_net:1654,cotisations:466, heures_sup:2, prime:40},
    {id:'demo-f4', company_id:'demo',chauffeur_nom:'Sébastien Roy',     mois:dMonth(),salaire_brut:2300,salaire_net:1794,cotisations:506, heures_sup:8, prime:160},
    {id:'demo-f5', company_id:'demo',chauffeur_nom:'Amadou Diallo',     mois:dMonth(),salaire_brut:2150,salaire_net:1677,cotisations:473, heures_sup:3, prime:60},
    {id:'demo-f6', company_id:'demo',chauffeur_nom:'Patrick Lefèvre',   mois:dMonth(),salaire_brut:2250,salaire_net:1755,cotisations:495, heures_sup:5, prime:100},
    {id:'demo-f7', company_id:'demo',chauffeur_nom:'Nathalie Girard',   mois:dMonth(),salaire_brut:2080,salaire_net:1622,cotisations:458, heures_sup:0, prime:0},
    {id:'demo-f8', company_id:'demo',chauffeur_nom:'Thierry Blanc',     mois:dMonth(),salaire_brut:2180,salaire_net:1700,cotisations:480, heures_sup:4, prime:80},
    {id:'demo-f9', company_id:'demo',chauffeur_nom:'Fatou Camara',      mois:dMonth(),salaire_brut:2050,salaire_net:1599,cotisations:451, heures_sup:2, prime:40},
    {id:'demo-f10',company_id:'demo',chauffeur_nom:'Bruno Martinez',    mois:dMonth(),salaire_brut:2320,salaire_net:1810,cotisations:510, heures_sup:7, prime:140},
    {id:'demo-f11',company_id:'demo',chauffeur_nom:'Omar Sy',           mois:dMonth(),salaire_brut:2200,salaire_net:1716,cotisations:484, heures_sup:4, prime:80},
    {id:'demo-f12',company_id:'demo',chauffeur_nom:'Christophe Duval',  mois:dMonth(),salaire_brut:2450,salaire_net:1911,cotisations:539, heures_sup:10,prime:200},
    {id:'demo-f13',company_id:'demo',chauffeur_nom:'David Nguyen',      mois:dMonth(),salaire_brut:1980,salaire_net:1544,cotisations:436, heures_sup:0, prime:0},
    {id:'demo-f14',company_id:'demo',chauffeur_nom:'Ibrahim Traoré',    mois:dMonth(),salaire_brut:2100,salaire_net:1638,cotisations:462, heures_sup:3, prime:60},
    {id:'demo-f15',company_id:'demo',chauffeur_nom:'Laurent Perrin',    mois:dMonth(),salaire_brut:2020,salaire_net:1576,cotisations:444, heures_sup:1, prime:20}
  ],
  absences:[
    {id:'demo-a1',company_id:'demo',chauffeur_nom:'Mohammed Benali',   type:'CP',      date_debut:dDate(-30),date_fin:dDate(-25)},
    {id:'demo-a2',company_id:'demo',chauffeur_nom:'Sébastien Roy',     type:'CP',      date_debut:dDate(-5), date_fin:dDate(-3)},
    {id:'demo-a3',company_id:'demo',chauffeur_nom:'Jean-Pierre Morin', type:'Maladie', date_debut:dDate(-8), date_fin:dDate(-6)},
    {id:'demo-a4',company_id:'demo',chauffeur_nom:'Fatou Camara',      type:'CP',      date_debut:dDate(-18),date_fin:dDate(-15)},
    {id:'demo-a5',company_id:'demo',chauffeur_nom:'Patrick Lefèvre',   type:'RTT',     date_debut:dDate(-12),date_fin:dDate(-12)},
    {id:'demo-a6',company_id:'demo',chauffeur_nom:'Ibrahim Traoré',    type:'Maladie', date_debut:dDate(-2), date_fin:dDate(-1)}
  ]
};

function buildTournees(){
  var today=new Date(),tournees=[],id=1;
  // Clients fixes (distribution alimentaire / bricolage)
  var clientsFixes=['CARREFOUR Vénissieux','LECLERC Bron','METRO CASH Lyon','LIDL Décines','ALDI Villeurbanne','BIOCOOP Lyon 3','INTERMARCHÉ Oullins','SYSTÈME U Caluire','LEROY MERLIN Bron','IKEA LOGISTIQUE','AMAZON LOGISTICS','FNAC Logistique'];
  // Chauffeurs et véhicules associés (index correspondant)
  var ch=['Mohammed Benali','Jean-Pierre Morin','Karim Ouattara','Lucie Fontaine','Sébastien Roy','Amadou Diallo','Patrick Lefèvre','Nathalie Girard','Youssef El Amrani','Thierry Blanc','Fatou Camara','Bruno Martinez','Stéphane Roux','Omar Sy','Christophe Duval','David Nguyen','Sophie Lambert','Ibrahim Traoré','Laurent Perrin','Antoine Mercier'];
  var veh=['AB-123-CD','EF-456-GH','IJ-789-KL','MN-012-OP','QR-345-ST','CD-234-EF','GH-567-IJ','KL-890-MN','OP-123-QR','ST-456-UV','WX-789-YZ','AB-456-CD','EF-789-GH','IJ-012-KL','MN-345-OP','QR-678-ST','UV-901-WX','YZ-234-AB','CD-567-EF','GH-890-IJ'];
  var hAM=['05:30','06:00','06:30','07:00','07:30','08:00'],hPM=['13:00','13:30','14:00','14:30'];

  // Affecter des clients réguliers à des chauffeurs (simuler des contrats stables)
  var assignments=[
    {ch:0,cl:'CARREFOUR Vénissieux',days:[1,2,3,4,5],slot:'AM'},
    {ch:1,cl:'METRO CASH Lyon',days:[1,2,3,4,5],slot:'AM'},
    {ch:3,cl:'LECLERC Bron',days:[1,3,5],slot:'AM'},
    {ch:3,cl:'BIOCOOP Lyon 3',days:[2,4],slot:'AM'},
    {ch:5,cl:'LIDL Décines',days:[1,2,3,4,5],slot:'AM'},
    {ch:6,cl:'ALDI Villeurbanne',days:[1,2,3,4],slot:'AM'},
    {ch:7,cl:'INTERMARCHÉ Oullins',days:[1,3,5],slot:'AM'},
    {ch:7,cl:'SYSTÈME U Caluire',days:[2,4],slot:'AM'},
    {ch:10,cl:'CARREFOUR Vénissieux',days:[1,2,3,4,5],slot:'PM'},
    {ch:9,cl:'LEROY MERLIN Bron',days:[1,3,5],slot:'AM'},
    {ch:11,cl:'IKEA LOGISTIQUE',days:[2,4,6],slot:'AM'},
    {ch:13,cl:'AMAZON LOGISTICS',days:[1,2,3,4,5],slot:'AM'},
    {ch:14,cl:'FNAC Logistique',days:[2,4],slot:'AM'},
    {ch:14,cl:'LEROY MERLIN Bron',days:[6],slot:'AM'},
    {ch:15,cl:'BIOCOOP Lyon 3',days:[1,3,5],slot:'PM'},
    {ch:17,cl:'SYSTÈME U Caluire',days:[1,3,5],slot:'PM'},
    {ch:18,cl:'LIDL Décines',days:[2,4,6],slot:'PM'},
    {ch:19,cl:'ALDI Villeurbanne',days:[1,3,5],slot:'PM'}
  ];

  for(var d=29;d>=0;d--){
    var date=new Date(today);date.setDate(today.getDate()-d);
    if(date.getDay()===0)continue; // pas le dimanche
    var ds=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
    var dow=date.getDay(); // 1=lun ... 6=sam

    // Tournées régulières selon assignments
    for(var a=0;a<assignments.length;a++){
      var asg=assignments[a];
      if(asg.days.indexOf(dow)===-1)continue;
      tournees.push({
        id:'demo-t'+id++,company_id:'demo',date:ds,
        chauffeur_nom:ch[asg.ch],client_nom:asg.cl,
        slot:asg.slot,
        heure:asg.slot==='AM'?hAM[asg.ch%hAM.length]:hPM[asg.ch%hPM.length],
        vehicule:veh[asg.ch],commentaire:'',
        created_at:date.toISOString()
      });
    }

    // COLIS PRIVÉ : 1 tournée/jour avec points (commissionnaire COGEPART)
    var slotCP=d%2===0?'AM':'PM';
    var ptsCP=28+(d%14);
    tournees.push({id:'demo-t'+id++,company_id:'demo',date:ds,chauffeur_nom:'Karim Ouattara',client_nom:'COLIS PRIVÉ',slot:slotCP,heure:slotCP==='AM'?'07:00':'13:30',vehicule:'IJ-789-KL',nb_points_reel:ptsCP,commentaire:'',created_at:date.toISOString()});

    // CHRONOPOST Lyon : lun-ven avec points (commissionnaire XPO)
    if(dow>=1&&dow<=5){
      var slotCH=d%3===0?'PM':'AM';
      var ptsCH=30+(d%12);
      tournees.push({id:'demo-t'+id++,company_id:'demo',date:ds,chauffeur_nom:'Stéphane Roux',client_nom:'CHRONOPOST Lyon',slot:slotCH,heure:slotCH==='AM'?'06:30':'13:00',vehicule:'EF-789-GH',nb_points_reel:ptsCH,commentaire:'',created_at:date.toISOString()});
    }

    // DARTY LOGISTIQUE : 3x/semaine (commissionnaire ID LOGISTICS)
    if(dow===2||dow===4||dow===6){
      tournees.push({id:'demo-t'+id++,company_id:'demo',date:ds,chauffeur_nom:'Sophie Lambert',client_nom:'DARTY LOGISTIQUE',slot:'AM',heure:'06:30',vehicule:'UV-901-WX',commentaire:'',created_at:date.toISOString()});
    }

    // AMAZON LOGISTICS PM : 2x/semaine (commissionnaire GEODIS)
    if(dow===1||dow===3){
      tournees.push({id:'demo-t'+id++,company_id:'demo',date:ds,chauffeur_nom:'Laurent Perrin',client_nom:'AMAZON LOGISTICS',slot:'PM',heure:'14:00',vehicule:'CD-567-EF',commentaire:'',created_at:date.toISOString()});
    }
  }
  return tournees;
}

// ── INJECTION ──
function injectDemoData(){
  var t=buildTournees();
  localStorage.setItem('ot_demo_entreprise',JSON.stringify(ENTREPRISE));
  localStorage.setItem('ot_demo_chauffeurs',JSON.stringify(CHAUFFEURS));
  localStorage.setItem('ot_demo_clients',JSON.stringify(CLIENTS));
  localStorage.setItem('ot_demo_vehicules',JSON.stringify(VEHICULES));
  localStorage.setItem('ot_demo_tournees',JSON.stringify(t));
  localStorage.setItem('ot_demo_contrats',JSON.stringify(RH.contrats));
  localStorage.setItem('ot_demo_demandes',JSON.stringify(RH.demandes));
  localStorage.setItem('ot_demo_fiches',JSON.stringify(RH.fiches));
  localStorage.setItem('ot_demo_absences',JSON.stringify(RH.absences));
  localStorage.setItem('ot_gazole_demo',JSON.stringify(GAZOLE));
  localStorage.setItem('ot_penalites',JSON.stringify([{id:'retard',label:'Retard',icon:'⏰',montant:20},{id:'absence_nj',label:'Absence non justifiée',icon:'🚫',montant:50},{id:'absence',label:'Absence justifiée',icon:'📋',montant:0}]));
}
function getDK(k){try{return JSON.parse(localStorage.getItem('ot_demo_'+k)||'[]');}catch(e){return[];}}

// ── INTERCEPTEUR FETCH ──
function installFetchInterceptor(){
  if(window.__demoFetchInstalled)return;
  window.__demoFetchInstalled=true;
  var _real=window.fetch.bind(window);
  window.fetch=function(url,opts){
    var us=String(url||'');
    if(!us.includes('supabase.co/rest/v1')&&!us.includes('supabase.co/auth'))return _real(url,opts);
    if(us.includes('/auth/v1/'))return Promise.resolve(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}}));
    var method=((opts&&opts.method)||'GET').toUpperCase();
    var tm=us.match(/\/rest\/v1\/([a-zA-Z_]+)/);
    if(!tm)return _real(url,opts);
    var table=tm[1];
    if(method==='GET'){
      var data=[];
      switch(table){
        case 'entreprise': data=[getDK('entreprise')].filter(function(x){return x&&x.id;}); if(!data[0])data=[ENTREPRISE]; break;
        case 'chauffeurs': data=getDK('chauffeurs'); if(!data.length)data=CHAUFFEURS; if(us.includes('statut=eq.actif'))data=data.filter(function(c){return c.statut==='actif';}); break;
        case 'clients':    data=getDK('clients');    if(!data.length)data=CLIENTS;    break;
        case 'vehicules':  data=getDK('vehicules');  if(!data.length)data=VEHICULES;  break;
        case 'tournees':
          data=getDK('tournees'); if(!data.length)data=buildTournees();
          var mEq=us.match(/date=eq\.(\d{4}-\d{2}-\d{2})/); if(mEq)data=data.filter(function(t){return t.date===mEq[1];});
          var mGte=us.match(/date=gte\.(\d{4}-\d{2}-\d{2})/); if(mGte)data=data.filter(function(t){return t.date>=mGte[1];});
          var mLte=us.match(/date=lte\.(\d{4}-\d{2}-\d{2})/); if(mLte)data=data.filter(function(t){return t.date<=mLte[1];});
          var mCh=us.match(/chauffeur_nom=eq\.([^&]+)/); if(mCh)data=data.filter(function(t){return t.chauffeur_nom===decodeURIComponent(mCh[1]);});
          if(us.includes('order=created_at.desc')||us.includes('order=date.desc'))data=data.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
          var mLim=us.match(/limit=(\d+)/); if(mLim)data=data.slice(0,parseInt(mLim[1]));
          break;
        case 'commissionnaires': data=COMMISSIONNAIRES; break;
        case 'tournee_points': data=[]; break;
        case 'contrats':       data=getDK('contrats'); if(!data.length)data=RH.contrats; break;
        case 'absences':       data=getDK('absences'); if(!data.length)data=RH.absences; break;
        case 'conges_demandes': case 'rh_demandes': case 'demandes_conges':
          data=getDK('demandes'); if(!data.length)data=RH.demandes;
          if(us.includes('statut=eq.en_attente'))data=data.filter(function(d){return d.statut==='en_attente';}); break;
        case 'fiches_paie': data=getDK('fiches'); if(!data.length)data=RH.fiches; break;
        case 'gazole_pleins': case 'gazole':
          try{data=JSON.parse(localStorage.getItem('ot_gazole_demo')||'[]');}catch(e){data=[];}
          if(!data.length)data=GAZOLE;
          var gGte=us.match(/date=gte\.(\d{4}-\d{2}-\d{2})/); if(gGte)data=data.filter(function(g){return g.date>=gGte[1];});
          var gLte=us.match(/date=lte\.(\d{4}-\d{2}-\d{2})/); if(gLte)data=data.filter(function(g){return g.date<=gLte[1];});
          break;
        default: data=[];
      }
      return Promise.resolve(new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','Content-Range':'0-'+Math.max(data.length-1,0)+'/'+data.length}}));
    }
    // Écriture → succès fictif, RIEN n'est envoyé à Supabase
    var fb=[];
    if(method==='POST'){try{var p=JSON.parse((opts&&opts.body)||'{}');fb=[Object.assign({},p,{id:'demo-'+Date.now(),created_at:new Date().toISOString()})];}catch(e){fb=[{id:'demo-'+Date.now()}];}}
    return Promise.resolve(new Response(JSON.stringify(fb),{status:method==='POST'?201:200,headers:{'Content-Type':'application/json'}}));
  };
}

// ── TOAST MODE DÉMO ──
function showDemoToast(){
  var ex=document.getElementById('ot-demo-toast');
  if(ex){ex.style.opacity='1';setTimeout(function(){ex.style.opacity='0';},2500);return;}
  var t=document.createElement('div');
  t.id='ot-demo-toast';
  t.textContent='🔒 Mode démo — actions désactivées';
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(10,22,40,0.96);border:1px solid rgba(245,166,35,0.5);color:#F5A623;padding:12px 24px;border-radius:10px;font-family:Outfit,sans-serif;font-size:13px;font-weight:700;z-index:99999;pointer-events:none;letter-spacing:0.3px;box-shadow:0 4px 24px rgba(0,0,0,0.6);white-space:nowrap;transition:opacity 0.4s;';
  document.body.appendChild(t);
  setTimeout(function(){t.style.opacity='0';},2500);
  setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},3000);
}

// ── BLOCAGE DES ACTIONS ──
var BLOCK_OC=[
  'save','submit','add','create','delete','supprimer','ajouter','enregistrer',
  'sendwa','sendall','openmodal','openaddmodal','opencontratmodal','opencongemodal',
  'savechauffeur','saveclient','saveentreprise','savevehicule','saveplein','addplein',
  'openpen','confirmpenalty','validatetournee','delt(','delt ','delcl','delch','delv',
  'exportfacture','exportpdf','printsalaires',
  'savetournee','clearform','addclientblock','addpointtoblock',
  'resetcookieconsent'
];
var BLOCK_TXT=[
  'ajouter','créer','enregistrer','sauvegarder','supprimer','valider',
  'nouvelle tournée','nouveau contrat','nouveau chauffeur','nouveau client','nouveau véhicule',
  'ajouter un plein','envoyer','générer facture',
  '+ ajouter','+ nouveau','effacer','reset','pénalité'
];

function shouldBlockBtn(el){
  var oc=(el.getAttribute('onclick')||'').toLowerCase().replace(/\s/g,'');
  var txt=(el.textContent||'').toLowerCase().trim();
  var cls=(el.className||'').toLowerCase();
  for(var i=0;i<BLOCK_OC.length;i++){if(oc.includes(BLOCK_OC[i]))return true;}
  for(var j=0;j<BLOCK_TXT.length;j++){if(txt.startsWith(BLOCK_TXT[j])||txt===BLOCK_TXT[j])return true;}
  if((cls.includes('btn-accent')||cls.includes('btn-submit')||cls.includes('btn-save'))&&el.tagName==='BUTTON')return true;
  if(el.type==='submit')return true;
  return false;
}

function blockEl(el){
  if(el.dataset.demoBlocked)return;
  el.dataset.demoBlocked='1';
  el.style.opacity='0.4';
  el.style.cursor='not-allowed';
  el.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();showDemoToast();},true);
}

function blockInputEl(el){
  if(el.dataset.demoBlocked)return;
  var id=(el.id||'').toLowerCase();
  var name=(el.name||'').toLowerCase();
  if(id.includes('filter')||id.includes('search')||name.includes('filter')||name.includes('search'))return;
  if(id==='sel-date'||id==='sel-ch'||id.includes('remember'))return;
  el.dataset.demoBlocked='1';
  el.readOnly=true;
  el.style.cursor='not-allowed';
  el.style.opacity='0.55';
  el.addEventListener('focus',function(){this.blur();showDemoToast();});
  el.addEventListener('click',function(e){e.preventDefault();showDemoToast();});
}

function scanAndBlock(){
  var btns=document.querySelectorAll('button, input[type="submit"], input[type="button"]');
  for(var i=0;i<btns.length;i++){
    var el=btns[i];
    var oc=(el.getAttribute('onclick')||'').toLowerCase();
    if(el.id==='ot-demo-logout'||oc.includes('logout')||oc.includes('showtab')||oc.includes('switchtab')||
       oc.includes('changeweek')||oc.includes('changeday')||oc.includes('gotoday')||
       oc.includes('gotothisweek')||oc.includes('closeforgot')||oc.includes('closedrawer')||
       oc.includes('window.location')||oc.includes('history.back')||
       (el.textContent||'').toLowerCase().includes('actualiser')||
       (el.textContent||'').toLowerCase().includes('retour')||
       (el.textContent||'').toLowerCase().includes('semaine'))continue;
    if(shouldBlockBtn(el))blockEl(el);
  }

  var inputs=document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea');
  for(var k=0;k<inputs.length;k++) blockInputEl(inputs[k]);

  var selects=document.querySelectorAll('select');
  for(var s=0;s<selects.length;s++){
    var sel=selects[s];
    var sid=(sel.id||'').toLowerCase();
    if(sid.includes('filter')||sid.includes('search')||sid.includes('chauffeur-select')||sid.includes('period'))continue;
    if(sel.dataset.demoBlocked)continue;
    sel.dataset.demoBlocked='1';
    sel.style.pointerEvents='none';
    sel.style.opacity='0.55';
  }
}

// ── BANNER ──
function showDemoBanner(){
  var page=window.location.pathname;
  if(page.includes('index.html')||page==='/'||page==='')return;
  if(document.getElementById('ot-demo-banner'))return;
  var b=document.createElement('div');
  b.id='ot-demo-banner';
  b.innerHTML='🎯 MODE DÉMO &nbsp;·&nbsp; <strong>TRANSIT EXPRESS SARL</strong> &nbsp;·&nbsp; 👁️ Navigation libre — exports CSV/Excel activés'
    +'&nbsp;&nbsp;<button id="ot-demo-logout" onclick="(window.OT&&window.OT.logout?window.OT.logout():window.logout&&window.logout())" style="background:rgba(0,0,0,0.25);border:1px solid rgba(0,0,0,0.3);border-radius:6px;padding:3px 9px;cursor:pointer;font-size:11px;font-weight:700;color:#0A1628;font-family:Outfit,sans-serif;">🚪 Quitter</button>';
  b.style.cssText='position:fixed;bottom:16px;right:16px;background:linear-gradient(135deg,#F5A623,#FF6B35);color:#0A1628;padding:10px 18px;border-radius:10px;font-family:Outfit,sans-serif;font-size:12px;font-weight:700;z-index:8500;box-shadow:0 4px 20px rgba(245,166,35,0.45);cursor:default;user-select:none;display:flex;align-items:center;gap:6px;';
  document.body.appendChild(b);
  var demoStyle=document.createElement('style');
  demoStyle.textContent='@media(max-width:768px){#ot-demo-banner{bottom:72px!important;right:12px!important;left:12px!important;text-align:center;border-radius:10px!important;font-size:11px!important;padding:8px 14px!important;flex-wrap:wrap;justify-content:center;}}';
  document.head.appendChild(demoStyle);
}

// ── AUTO-INIT ──
window.injectDemoData=injectDemoData;

if(isDemo()){
  installFetchInterceptor();

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){
      showDemoBanner();
      setTimeout(scanAndBlock,400);
      setTimeout(scanAndBlock,1600);
    });
  } else {
    showDemoBanner();
    setTimeout(scanAndBlock,400);
    setTimeout(scanAndBlock,1600);
  }
}

})();
