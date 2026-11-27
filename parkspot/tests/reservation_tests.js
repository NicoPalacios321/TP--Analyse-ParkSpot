/* Tests intégrés sans dépendance externe : node --test tests/reservation_tests.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const racine = path.resolve(__dirname, "..");
const fichierDonnees = path.join(racine, "js", "donnees.js");
const fichierReservation = path.join(racine, "js", "reservation.js");

class ElementSimule {
  constructor(document, id) {
    this.document = document;
    this.id = id;
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.textContent = "";
    this.className = "";
    this.options = [];
    this.dataset = {};
    this.ecouteurs = {};
    this._innerHTML = "";
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.options = Array.from(html.matchAll(/<option\s+value="([^"]*)"/g), (match) => ({ value: match[1] }));
    if (this.options.length && !this.options.some((option) => option.value === this.value)) {
      this.value = this.options[0].value;
    }
    for (const match of html.matchAll(/id="(heures-[^"]+)"/g)) {
      const select = this.document.getElementById(match[1]);
      select.innerHTML = '<option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>';
    }
  }

  get innerHTML() { return this._innerHTML; }
  addEventListener(type, callback) { this.ecouteurs[type] = callback; }
  scrollIntoView() {}
  focus() {}
  dispatch(type, event = {}) {
    if (this.ecouteurs[type]) this.ecouteurs[type](event);
  }
}

function creerPage({ pageReservations = false, stockage = new Map(), confirmation = true, maintenant = "2026-11-27T12:00:00" } = {}) {
  const elements = new Map();
  const elementsPageReservations = new Set([
    "liste-reservations", "utilisateur-connecte", "compte-reservations",
    "details-reservation", "contenu-details-reservation", "annuler-reservation", "message-annulation",
    "carte-reservations"
  ]);
  const document = {
    getElementById(id) {
      const appartientPageReservations = elementsPageReservations.has(id);
      if (pageReservations !== appartientPageReservations) return null;
      if (!elements.has(id)) elements.set(id, new ElementSimule(document, id));
      return elements.get(id);
    }
  };
  const donneesStockees = new Map(stockage);
  const stockageLocal = {
    getItem(cle) { return donneesStockees.has(cle) ? donneesStockees.get(cle) : null; },
    setItem(cle, valeur) { donneesStockees.set(cle, String(valeur)); },
    removeItem(cle) { donneesStockees.delete(cle); }
  };
  let confirmations = 0;
  const cartes = [];
  const leafletSimule = {
    map(id, options) {
      const carte = {
        id,
        options,
        marqueurs: [],
        setView(centre, zoom) { this.centre = centre; this.zoom = zoom; return this; },
        fitBounds(limites) { this.limites = limites; return this; },
        remove() { this.supprimee = true; }
      };
      cartes.push(carte);
      return carte;
    },
    tileLayer(url, options) {
      return { addTo(carte) { carte.tuiles = { url, options }; return this; } };
    },
    circleMarker(coordonnees, options) {
      return {
        coordonnees,
        options,
        popup: "",
        bindPopup(contenu) { this.popup = contenu; return this; },
        addTo(carte) { carte.marqueurs.push(this); return this; }
      };
    }
  };
  const instantFixe = new Date(maintenant).getTime();
  class DateSimulee extends Date {
    constructor(...argumentsDate) {
      super(...(argumentsDate.length ? argumentsDate : [instantFixe]));
    }
    static now() { return instantFixe; }
  }
  const contexte = {
    document,
    localStorage: stockageLocal,
    location: { search: "" },
    URLSearchParams,
    fetch: async (url) => {
      const chemin = path.join(racine, String(url).replaceAll("/", path.sep));
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(chemin, "utf8")) };
    },
    L: leafletSimule,
    confirm: () => { confirmations += 1; return confirmation; },
    Intl,
    Date: DateSimulee,
    setTimeout,
    setImmediate
  };
  vm.createContext(contexte);
  contexte.window = contexte;

  if (pageReservations) {
    document.getElementById("liste-reservations");
    document.getElementById("utilisateur-connecte");
    document.getElementById("compte-reservations");
    document.getElementById("details-reservation");
    document.getElementById("contenu-details-reservation");
    document.getElementById("annuler-reservation");
    document.getElementById("message-annulation");
    document.getElementById("carte-reservations");
  } else {
    ["jeu-donnees", "locataire", "methode-paiement", "date-reservation", "liste-stationnements", "annonce", "facture", "compte-stationnements", "carte-stationnements"]
      .forEach((id) => document.getElementById(id));
  }

  vm.runInContext(fs.readFileSync(fichierDonnees, "utf8"), contexte, { filename: fichierDonnees });
  vm.runInContext(fs.readFileSync(fichierReservation, "utf8"), contexte, { filename: fichierReservation });

  return {
    document,
    cartes,
    stockage: donneesStockees,
    get confirmations() { return confirmations; },
    async attendreChargement() { await new Promise((resolve) => setTimeout(resolve, 10)); },
    choisirJeu(nom) {
      const select = document.getElementById("jeu-donnees");
      select.value = nom;
      select.dispatch("change");
    },
    choisirLocataire(id) {
      const select = document.getElementById("locataire");
      select.value = id;
      select.dispatch("change");
    },
    reserver(id) {
      document.getElementById("liste-stationnements").dispatch("click", {
        target: { closest: () => ({ dataset: { reserver: id } }) }
      });
    },
    choisirDate(date) {
      document.getElementById("date-reservation").value = date;
    },
    ouvrirDetails(id) {
      document.getElementById("liste-reservations").dispatch("click", {
        target: { closest: (selecteur) => selecteur === "[data-details]" ? { dataset: { details: id } } : null }
      });
    },
    annuler() {
      document.getElementById("annuler-reservation").dispatch("click");
    },
    cliquerReservationCarte(id) {
      document.getElementById("carte-stationnements").dispatch("click", {
        target: { closest: (selecteur) => selecteur === "[data-reserver-carte]" ? { dataset: { reserverCarte: id } } : null }
      });
    }
  };
}

function lireJeuStocke(page) {
  return JSON.parse(page.stockage.get("parkspot-donnees-v1"));
}

function stockageAvecJeu(nomJeu, idUtilisateur) {
  const fichier = path.join(racine, "data", `${nomJeu}.json`);
  const donnees = JSON.parse(fs.readFileSync(fichier, "utf8"));
  return new Map([
    ["parkspot-donnees-v1", JSON.stringify(donnees)],
    ["parkspot-jeu-actif", nomJeu],
    ["parkspot-utilisateur-actif", idUtilisateur]
  ]);
}

test("affiche les locataires, leurs méthodes et tous les stationnements", async () => {
  const page = creerPage();
  await page.attendreChargement();

  assert.equal(page.document.getElementById("locataire").options.length, 2, page.document.getElementById("liste-stationnements").innerHTML);
  assert.equal(page.document.getElementById("methode-paiement").options.length, 2);
  assert.equal((page.document.getElementById("liste-stationnements").innerHTML.match(/data-reserver=/g) || []).length, 4);
});

test("refuse un compte dont le courriel est invalide sans lancer le paiement", async () => {
  const page = creerPage();
  await page.attendreChargement();
  page.choisirJeu("erreurs");
  await page.attendreChargement();
  page.choisirLocataire("u2"); // Karim Benali : courriel invalide dans erreurs.json
  page.reserver("s2");

  assert.match(page.document.getElementById("annonce").textContent, /courriel valide est requis/i);
  assert.equal(page.confirmations, 0);
  assert.equal(page.stockage.has("parkspot-donnees-v1"), false);
});

test("refuse une réservation si la méthode choisie a des fonds insuffisants", async () => {
  const page = creerPage();
  await page.attendreChargement();
  page.choisirJeu("erreurs");
  await page.attendreChargement();
  page.choisirLocataire("u4"); // Marie a une carte de débit avec 5 $.
  page.choisirDate("2026-12-05T12:00");
  page.document.getElementById("methode-paiement").value = "m2";
  page.document.getElementById("heures-s2").value = "2"; // 8 $ au total.
  page.reserver("s2");

  assert.equal(page.document.getElementById("annonce").textContent, "Fonds insuffisant");
  assert.equal(page.confirmations, 0);
  assert.equal(page.stockage.has("parkspot-donnees-v1"), false);
});

test("refuse un stationnement déjà réservé", async () => {
  const page = creerPage();
  await page.attendreChargement();
  page.reserver("s3");

  assert.equal(page.document.getElementById("annonce").textContent, "Stationnement déjà réserver");
  assert.equal(page.confirmations, 0);
  assert.equal(page.stockage.has("parkspot-donnees-v1"), false);
});

test("affiche indépendamment l'historique JSON du locataire sélectionné", async () => {
  const stockage = stockageAvecJeu("normal", "u2"); // Karim possède une réservation de départ dans normal.json.
  const page = creerPage({ pageReservations: true, stockage });
  await page.attendreChargement();

  assert.match(page.document.getElementById("utilisateur-connecte").textContent, /Karim Benali/);
  assert.match(page.document.getElementById("liste-reservations").innerHTML, /1000 boulevard De Maisonneuve/);
  assert.equal(page.document.getElementById("compte-reservations").textContent, "1 réservation");
});

test("toutes les réservations fournies par les jeux JSON ont une date de départ valide", () => {
  for (const nomJeu of ["normal", "erreurs", "limites"]) {
    const donnees = JSON.parse(fs.readFileSync(path.join(racine, "data", `${nomJeu}.json`), "utf8"));
    for (const reservation of donnees.reservations) {
      assert.ok(reservation.dateDebut, `${nomJeu}/${reservation.id} doit avoir une dateDebut`);
      assert.ok(Number.isFinite(new Date(reservation.dateDebut).getTime()), `${nomJeu}/${reservation.id} doit avoir une date valide`);
    }
  }
});

test("récupère la date de départ des réservations stockées avec l'ancien champ date", async () => {
  const donnees = JSON.parse(fs.readFileSync(path.join(racine, "data", "normal.json"), "utf8"));
  delete donnees.reservations[0].dateDebut;
  const stockage = new Map([
    ["parkspot-donnees-v1", JSON.stringify(donnees)],
    ["parkspot-jeu-actif", "normal"],
    ["parkspot-utilisateur-actif", "u2"]
  ]);
  const page = creerPage({ pageReservations: true, stockage });
  await page.attendreChargement();
  page.ouvrirDetails("r1");

  const details = page.document.getElementById("contenu-details-reservation").innerHTML;
  assert.doesNotMatch(details, /Non précisée/);
  assert.match(details, /Date de départ/);
  assert.equal(lireJeuStocke(page).reservations[0].dateDebut, "2026-12-02T09:00");
});

test("permet d'annuler plus de 24 h avant le début et rembourse la méthode", async () => {
  const page = creerPage({ pageReservations: true, stockage: stockageAvecJeu("normal", "u2"), maintenant: "2026-12-03T12:00:00" });
  await page.attendreChargement();
  page.ouvrirDetails("r1");

  const bouton = page.document.getElementById("annuler-reservation");
  assert.equal(bouton.disabled, false);
  page.annuler();

  const donnees = lireJeuStocke(page);
  assert.equal(donnees.reservations.find((r) => r.id === "r1").statut, "Annulée");
  assert.equal(donnees.stationnements.find((s) => s.id === "s3").reserve, false);
  assert.equal(donnees.methodesPaiement.find((m) => m.id === "m3").solde, 312);
  assert.doesNotMatch(page.document.getElementById("liste-reservations").innerHTML, /1000 boulevard De Maisonneuve/);
  assert.match(page.document.getElementById("liste-reservations").innerHTML, /pas de réservation active/);
  assert.equal(page.document.getElementById("details-reservation").hidden, true);
});

test("désactive l'annulation quand il reste moins de 24 h", async () => {
  const page = creerPage({ pageReservations: true, stockage: stockageAvecJeu("erreurs", "u4"), maintenant: "2026-12-03T12:00:00" });
  await page.attendreChargement();
  page.ouvrirDetails("r1");

  const bouton = page.document.getElementById("annuler-reservation");
  assert.equal(bouton.disabled, true);
  assert.match(page.document.getElementById("message-annulation").textContent, /délai de 24 h.*dépassé/);
  page.annuler();

  const donnees = lireJeuStocke(page);
  assert.equal(donnees.reservations.find((r) => r.id === "r1").statut, "Confirmée");
  assert.equal(donnees.stationnements.find((s) => s.id === "s1").reserve, true);
  assert.equal(donnees.methodesPaiement.find((m) => m.id === "m2").solde, 5);
});

test("autorise l'annulation exactement 24 h avant le début", async () => {
  const page = creerPage({ pageReservations: true, stockage: stockageAvecJeu("limites", "u1"), maintenant: "2026-12-03T12:00:00" });
  await page.attendreChargement();
  page.ouvrirDetails("r2");

  assert.equal(page.document.getElementById("annuler-reservation").disabled, false);
  page.annuler();
  assert.equal(lireJeuStocke(page).reservations.find((r) => r.id === "r2").statut, "Annulée");
});

test("confirme le paiement, affiche la facture et intègre la réservation à Mes réservations", async () => {
  const page = creerPage();
  await page.attendreChargement();
  page.choisirDate("2026-12-05T12:00");
  page.reserver("s1");

  const facture = page.document.getElementById("facture");
  assert.equal(facture.hidden, false);
  assert.match(facture.innerHTML, /Marie Tremblay/);
  assert.match(facture.innerHTML, /marie\.tremblay@gmail\.com/);
  assert.match(facture.innerHTML, /Julie Gagnon/);
  const donnees = lireJeuStocke(page);
  assert.equal(donnees.reservations.length, 2);
  const reservationAjoutee = donnees.reservations.find((r) => r.idLocataire === "u1");
  assert.ok(reservationAjoutee.dateDebut);
  assert.match(facture.innerHTML, /Date du stationnement/);

  const historique = creerPage({ pageReservations: true, stockage: page.stockage });
  await historique.attendreChargement();
  const liste = historique.document.getElementById("liste-reservations").innerHTML;
  assert.match(historique.document.getElementById("utilisateur-connecte").textContent, /Marie Tremblay/);
  assert.match(liste, /125 rue Saint-Charles Ouest/);
  assert.match(liste, /Départ/);
  assert.match(liste, /Confirmée/);
  assert.equal(historique.document.getElementById("compte-reservations").textContent, "1 réservation");
  assert.doesNotMatch(liste, /1000 boulevard De Maisonneuve/); // Réservation de Karim, autre locataire.
  historique.ouvrirDetails(reservationAjoutee.id);
  assert.equal(historique.document.getElementById("annuler-reservation").disabled, false);
  assert.doesNotMatch(historique.document.getElementById("contenu-details-reservation").innerHTML, /Non précisée/);
});

test("le bouton d'annulation est rouge et son état désactivé est visible", () => {
  const html = fs.readFileSync(path.join(racine, "reservations.html"), "utf8");
  assert.match(html, /#annuler-reservation\s*\{[^}]*background:\s*#b42318/i);
  assert.match(html, /#annuler-reservation:disabled[\s\S]*background:\s*#b42318/i);
  assert.match(html, /#annuler-reservation:disabled[\s\S]*opacity:\s*\.45/i);
  assert.match(html, /#annuler-reservation:disabled[\s\S]*cursor:\s*not-allowed/i);
});

test("exige une date avant de créer une réservation dans le jeu limites", async () => {
  const page = creerPage();
  await page.attendreChargement();
  page.choisirJeu("limites");
  await page.attendreChargement();
  page.choisirLocataire("u2"); // Compte de test avec assez de fonds pour le stationnement s2.
  page.reserver("s2");

  assert.match(page.document.getElementById("annonce").textContent, /sélectionner une date/i);
  assert.equal(page.stockage.has("parkspot-donnees-v1"), false);
});

test("autorise une réservation aujourd'hui à partir de deux heures et affiche sa date", async () => {
  const html = fs.readFileSync(path.join(racine, "stationnement.html"), "utf8");
  assert.match(html, /id="date-reservation"[^>]*type="datetime-local"[^>]*required/);

  const page = creerPage();
  await page.attendreChargement();
  assert.equal(page.document.getElementById("date-reservation").min, "2026-11-27T14:00");
  page.choisirDate("2026-11-27T14:00");
  page.reserver("s1");

  const donnees = lireJeuStocke(page);
  const reservation = donnees.reservations.find((r) => r.idLocataire === "u1");
  assert.ok(reservation);
  assert.equal(new Date(reservation.dateDebut).getTime(), new Date("2026-11-27T14:00").getTime());
  assert.match(page.document.getElementById("facture").innerHTML, /Date du stationnement/);

  const historique = creerPage({ pageReservations: true, stockage: page.stockage });
  await historique.attendreChargement();
  historique.ouvrirDetails(reservation.id);
  assert.match(historique.document.getElementById("contenu-details-reservation").innerHTML, /Date de départ/);
  assert.doesNotMatch(historique.document.getElementById("contenu-details-reservation").innerHTML, /Non précisée/);
});

test("refuse une date de stationnement située à moins de deux heures", async () => {
  const page = creerPage();
  await page.attendreChargement();
  page.choisirDate("2026-11-27T13:59");
  page.reserver("s1");

  assert.match(page.document.getElementById("annonce").textContent, /au moins deux heures après maintenant/i);
  assert.equal(page.confirmations, 0);
  assert.equal(page.stockage.has("parkspot-donnees-v1"), false);
});

test("les jeux de données ont des adresses montréalaises réelles et des coordonnées cartographiables", () => {
  for (const nomJeu of ["normal", "erreurs", "limites"]) {
    const donnees = JSON.parse(fs.readFileSync(path.join(racine, "data", `${nomJeu}.json`), "utf8"));
    for (const place of donnees.stationnements) {
      assert.ok(Number.isFinite(place.latitude) && Number.isFinite(place.longitude), `${nomJeu}/${place.id} doit avoir des coordonnées`);
      assert.ok(place.latitude >= 45.45 && place.latitude <= 45.65, `${nomJeu}/${place.id} doit être dans la région de Montréal-Longueuil`);
      assert.ok(place.longitude >= -73.75 && place.longitude <= -73.35, `${nomJeu}/${place.id} doit être dans la région de Montréal-Longueuil`);
      if (place.adresse) assert.match(place.adresse, /Montréal|Longueuil/i, `${nomJeu}/${place.id} doit préciser Montréal ou Longueuil`);
      assert.doesNotMatch(place.adresse, /12345|1 rue A/i, `${nomJeu}/${place.id} ne doit pas utiliser une adresse fictive`);
    }
  }
  const erreurs = JSON.parse(fs.readFileSync(path.join(racine, "data", "erreurs.json"), "utf8"));
  assert.equal(erreurs.stationnements.find((place) => place.id === "s3").adresse, "");
  const limites = JSON.parse(fs.readFileSync(path.join(racine, "data", "limites.json"), "utf8"));
  const adresseLongue = limites.stationnements.find((place) => place.id === "s2").adresse;
  assert.ok(adresseLongue.length > 120, "Le cas limite conserve une adresse longue.");
  assert.match(adresseLongue, /1450,? rue Saint-Urbain/i);
});

test("les deux pages contiennent une carte Leaflet avec attribution OpenStreetMap", () => {
  const pageStationnement = fs.readFileSync(path.join(racine, "stationnement.html"), "utf8");
  const pageReservations = fs.readFileSync(path.join(racine, "reservations.html"), "utf8");
  const scriptReservation = fs.readFileSync(fichierReservation, "utf8");
  assert.match(pageStationnement, /id="carte-stationnements"/);
  assert.match(pageReservations, /id="carte-reservations"/);
  for (const html of [pageStationnement, pageReservations]) {
    assert.match(html, /leaflet/i);
  }
  assert.match(scriptReservation, /© <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap contributors<\/a>/);
});

test("la carte de réservation place les stationnements et les réservations sur des points distincts", async () => {
  const page = creerPage();
  await page.attendreChargement();
  let carte = page.cartes.at(-1);
  assert.equal(carte.id, "carte-stationnements");
  assert.equal(carte.marqueurs.length, 5); // Quatre stationnements et une réservation.
  assert.ok(carte.marqueurs.some((marqueur) => marqueur.options.type === "reservation"));
  assert.ok(carte.marqueurs.some((marqueur) => marqueur.options.type === "stationnement"));
  const pointLibre = carte.marqueurs.find((marqueur) => marqueur.options.type === "stationnement" && marqueur.options.stationnementId === "s1");
  const pointReserve = carte.marqueurs.find((marqueur) => marqueur.options.type === "stationnement" && marqueur.options.stationnementId === "s3");
  assert.match(pointLibre.popup, /data-reserver-carte="s1"/);
  assert.doesNotMatch(pointReserve.popup, /data-reserver-carte=/);

  page.choisirJeu("erreurs");
  await page.attendreChargement();
  carte = page.cartes.at(-1);
  assert.ok(carte.marqueurs.some((marqueur) => marqueur.popup.includes("Adresse non renseignée")));

  page.choisirJeu("limites");
  await page.attendreChargement();
  carte = page.cartes.at(-1);
  assert.ok(carte.marqueurs.some((marqueur) => marqueur.popup.includes("1450, rue Saint-Urbain")));
});

test("la carte Mes réservations positionne les réservations du locataire actif", async () => {
  const page = creerPage({ pageReservations: true, stockage: stockageAvecJeu("normal", "u2") });
  await page.attendreChargement();
  const carte = page.cartes.at(-1);
  assert.equal(carte.id, "carte-reservations");
  assert.equal(carte.marqueurs.length, 1);
  assert.equal(carte.marqueurs[0].options.type, "reservation");
  assert.ok(carte.marqueurs[0].popup.includes("1000 boulevard De Maisonneuve Ouest"));
});

test("le bouton Réserver d'un point libre déclenche le parcours de réservation", async () => {
  const page = creerPage();
  await page.attendreChargement();
  page.choisirDate("2026-11-27T14:00");
  page.cliquerReservationCarte("s1");

  assert.match(page.document.getElementById("annonce").textContent, /Paiement confirmé/);
  assert.ok(lireJeuStocke(page).reservations.some((reservation) => reservation.idStationnement === "s1" && reservation.idLocataire === "u1"));
});

test("la carte limite le zoom et ne répète pas les tuiles du monde", async () => {
  const page = creerPage();
  await page.attendreChargement();
  const carte = page.cartes.at(-1);
  assert.equal(carte.options.minZoom, 10);
  assert.equal(carte.options.maxZoom, 18);
  assert.equal(carte.options.maxBoundsViscosity, 1);
  assert.equal(carte.tuiles.options.noWrap, true);
});
