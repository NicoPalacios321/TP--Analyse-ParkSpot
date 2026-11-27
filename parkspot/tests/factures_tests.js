// =============================================================
// factures_tests.js — Tests automatisés de la US 2 (facture par courriel)
// -------------------------------------------------------------
// Outil intégré de Node seulement (node:test, node:assert) : aucun npm.
// Lancer depuis le dossier parkspot :
//   node --test tests/factures_tests.js
//
// Chaque test charge une NOUVELLE copie des vrais fichiers data/*.json
// en mémoire : les tests ne modifient jamais les fichiers.
// =============================================================

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
    masquerCarte,
    formaterDateFacture,
    formaterMontant,
    traiterFacture,
    enregistrerCourriel
} = require(path.join(__dirname, "..", "js", "facture.js"));


// -------------------------------------------------------------
// Outils pour les tests
// -------------------------------------------------------------

/**
 * Charge data/<nom>.json et retourne une copie neuve en mémoire.
 * (JSON.parse crée un nouvel objet à chaque appel.)
 */
function chargerJeu(nom) {
    const chemin = path.join(__dirname, "..", "data", nom + ".json");
    return JSON.parse(fs.readFileSync(chemin, "utf8"));
}

/** Trouve un utilisateur par son identifiant (ex. "marie.t"). */
function trouverUtilisateur(donnees, identifiant) {
    const utilisateur = donnees.utilisateurs.find(function (u) {
        return u.identifiant === identifiant;
    });
    assert.ok(utilisateur, "Utilisateur absent du jeu de données : " + identifiant);
    return utilisateur;
}

/**
 * Crée une réservation de test de 2 heures pour un locataire.
 * Par défaut : sa première méthode de paiement et le stationnement s1.
 */
function creerReservation(donnees, idLocataire, options) {
    options = options || {};
    const methode = options.idMethode
        ? donnees.methodesPaiement.find(function (m) { return m.id === options.idMethode; })
        : donnees.methodesPaiement.find(function (m) { return m.idUtilisateur === idLocataire; });
    const idStationnement = options.idStationnement || "s1";
    const stationnement = donnees.stationnements.find(function (s) { return s.id === idStationnement; });
    const nbHeures = 2;

    return {
        id: options.id || "rTest",
        idLocataire: idLocataire,
        idStationnement: idStationnement,
        idMethode: methode ? methode.id : "",
        nbHeures: nbHeures,
        prix: stationnement ? stationnement.prixHoraire * nbHeures : 10,
        date: donnees.dateDuJour
    };
}


// =============================================================
// Jeu normal
// =============================================================

test("1. normal — marie.t : la facture est envoyée à marie.tremblay@gmail.com et ajoutée dans courriels", function () {
    const donnees = chargerJeu("normal");
    const marie = trouverUtilisateur(donnees, "marie.t");

    const resultat = traiterFacture(donnees, creerReservation(donnees, marie.id));

    assert.strictEqual(resultat.statut, "factureEnvoyee");
    assert.strictEqual(resultat.facture.destinataire, "marie.tremblay@gmail.com");
    assert.strictEqual(donnees.courriels.length, 1);
    assert.deepStrictEqual(donnees.courriels[0], resultat.facture);
});

test("2. normal — contenu de la facture : destinataire, date, montant, méthode, carte masquée, adresse, idReservation", function () {
    const donnees = chargerJeu("normal");
    const marie = trouverUtilisateur(donnees, "marie.t");
    // m1 = credit 4242424242424242 ; s1 = 3,50 $/h, 125 rue Saint-Charles Ouest
    const reservation = creerReservation(donnees, marie.id, { id: "r2", idMethode: "m1", idStationnement: "s1" });

    const facture = traiterFacture(donnees, reservation).facture;

    assert.strictEqual(facture.destinataire, "marie.tremblay@gmail.com");
    assert.strictEqual(facture.date, donnees.dateDuJour);
    assert.strictEqual(facture.montant, 7);
    assert.strictEqual(facture.methode, "credit");
    assert.ok(facture.methode === "credit" || facture.methode === "debit");
    assert.strictEqual(facture.carteMasquee, "**** 4242");
    assert.strictEqual(facture.adresseStationnement, "125 rue Saint-Charles Ouest, Longueuil");
    assert.strictEqual(facture.idReservation, "r2");
    assert.ok(facture.id, "la facture doit avoir un id");
    assert.ok(facture.sujet, "la facture doit avoir un sujet");
});

test("3. normal — deux paiements de suite : deux factures avec des identifiants différents", function () {
    const donnees = chargerJeu("normal");
    const marie = trouverUtilisateur(donnees, "marie.t");

    const facture1 = traiterFacture(donnees, creerReservation(donnees, marie.id, { id: "r2" })).facture;
    const facture2 = traiterFacture(donnees, creerReservation(donnees, marie.id, { id: "r3" })).facture;

    assert.strictEqual(donnees.courriels.length, 2);
    assert.notStrictEqual(facture1.id, facture2.id);
});


// =============================================================
// Jeu erreurs
// =============================================================

test("4. erreurs — sans.courriel : résultat « courriel requis » et aucune facture créée", function () {
    const donnees = chargerJeu("erreurs");
    const samuel = trouverUtilisateur(donnees, "sans.courriel");

    const resultat = traiterFacture(donnees, creerReservation(donnees, samuel.id, { idStationnement: "s2" }));

    assert.strictEqual(resultat.statut, "courrielRequis");
    assert.strictEqual(resultat.facture, undefined);
    assert.strictEqual(donnees.courriels.length, 0);
});

test("5. erreurs — courriel.invalide (karim.gmail.com) : résultat « courriel requis »", function () {
    const donnees = chargerJeu("erreurs");
    const karim = trouverUtilisateur(donnees, "courriel.invalide");
    assert.strictEqual(karim.courriel, "karim.gmail.com");

    const resultat = traiterFacture(donnees, creerReservation(donnees, karim.id, { idStationnement: "s2" }));

    assert.strictEqual(resultat.statut, "courrielRequis");
    assert.strictEqual(resultat.courrielActuel, "karim.gmail.com");
    assert.strictEqual(donnees.courriels.length, 0);
});

test("6. erreurs — courriels fournis invalides refusés et profil inchangé", function () {
    const invalides = [
        "nicolas.gmail.com",      // pas de @
        "nicolas@",               // pas de domaine
        "@gmail.com",             // pas de nom
        "",                       // chaîne vide
        "nico las@test.com",      // espace au milieu
        " nicolas@test.com ",     // espaces autour
        "nicolas@test@test.com"   // deux @
    ];

    invalides.forEach(function (courriel) {
        const donnees = chargerJeu("erreurs");
        const samuel = trouverUtilisateur(donnees, "sans.courriel");

        const resultat = enregistrerCourriel(donnees, samuel.id, courriel);

        assert.strictEqual(resultat.ok, false, "devrait être refusé : " + JSON.stringify(courriel));
        assert.ok(resultat.erreur, "un message d'erreur est attendu pour " + JSON.stringify(courriel));
        assert.strictEqual(samuel.courriel, "", "le profil ne doit pas changer pour " + JSON.stringify(courriel));
    });
});

test("7. erreurs — courriel fourni valide (nicolas@test.com) : sauvegardé dans le profil et facture envoyée à cette adresse", function () {
    const donnees = chargerJeu("erreurs");
    const samuel = trouverUtilisateur(donnees, "sans.courriel");

    const enregistrement = enregistrerCourriel(donnees, samuel.id, "nicolas@test.com");
    assert.deepStrictEqual(enregistrement, { ok: true });
    assert.strictEqual(samuel.courriel, "nicolas@test.com");

    const resultat = traiterFacture(donnees, creerReservation(donnees, samuel.id, { idStationnement: "s2" }));
    assert.strictEqual(resultat.statut, "factureEnvoyee");
    assert.strictEqual(resultat.facture.destinataire, "nicolas@test.com");
    assert.strictEqual(donnees.courriels.length, 1);
});

test("8. erreurs — après la sauvegarde du courriel, un deuxième paiement n'est plus « courriel requis »", function () {
    const donnees = chargerJeu("erreurs");
    const samuel = trouverUtilisateur(donnees, "sans.courriel");

    // Premier paiement : courriel requis
    const premier = traiterFacture(donnees, creerReservation(donnees, samuel.id, { id: "rA", idStationnement: "s2" }));
    assert.strictEqual(premier.statut, "courrielRequis");

    // Le locataire fournit un courriel valide
    assert.strictEqual(enregistrerCourriel(donnees, samuel.id, "nicolas@test.com").ok, true);

    // Deuxième paiement : la facture part directement
    const deuxieme = traiterFacture(donnees, creerReservation(donnees, samuel.id, { id: "rB", idStationnement: "s2" }));
    assert.strictEqual(deuxieme.statut, "factureEnvoyee");
    assert.strictEqual(deuxieme.facture.destinataire, "nicolas@test.com");
});

test("9. erreurs — réservation vers un stationnement inexistant (s99) : pas de plantage", function () {
    const donnees = chargerJeu("erreurs");
    const marie = trouverUtilisateur(donnees, "marie.t");
    const reservation = creerReservation(donnees, marie.id, { idMethode: "m2", idStationnement: "s99" });

    let resultat;
    assert.doesNotThrow(function () {
        resultat = traiterFacture(donnees, reservation);
    });
    assert.strictEqual(resultat.statut, "factureEnvoyee");
    assert.strictEqual(resultat.facture.adresseStationnement, "");
});

test("10. erreurs — réservation avec un locataire inexistant : pas de plantage, aucune facture", function () {
    const donnees = chargerJeu("erreurs");
    const reservation = creerReservation(donnees, "u99", { idMethode: "m2", idStationnement: "s2" });

    // traiterFacture signale le problème par une erreur claire et prévue
    // (« Locataire introuvable »), pas par un TypeError. envoyerFacture la
    // transforme en Promise rejetée : la page ne plante pas.
    assert.throws(
        function () { traiterFacture(donnees, reservation); },
        { name: "Error", message: /Locataire introuvable/ }
    );
    assert.strictEqual(donnees.courriels.length, 0);
});


// =============================================================
// Jeu limites
// =============================================================

test("11. limites — li : facture envoyée à a@b.c", function () {
    const donnees = chargerJeu("limites");
    const li = trouverUtilisateur(donnees, "li");

    const resultat = traiterFacture(donnees, creerReservation(donnees, li.id));

    assert.strictEqual(resultat.statut, "factureEnvoyee");
    assert.strictEqual(resultat.facture.destinataire, "a@b.c");
});

test("12. limites — maximilien.long : facture envoyée à son courriel très long", function () {
    const donnees = chargerJeu("limites");
    const maximilien = trouverUtilisateur(donnees, "maximilien.long");

    const resultat = traiterFacture(donnees, creerReservation(donnees, maximilien.id));

    assert.strictEqual(resultat.statut, "factureEnvoyee");
    assert.strictEqual(resultat.facture.destinataire, maximilien.courriel);
    assert.ok(resultat.facture.destinataire.length > 100, "le courriel testé doit bien être très long");
});


// =============================================================
// Sécurité et format
// =============================================================

test("13. sécurité — le numéro complet de la carte n'apparaît dans aucun champ de la facture (toutes les cartes des 3 jeux)", function () {
    let nbCartesTestees = 0;

    ["normal", "limites", "erreurs"].forEach(function (nomJeu) {
        const donnees = chargerJeu(nomJeu);

        donnees.methodesPaiement.forEach(function (methode) {
            const reservation = creerReservation(donnees, methode.idUtilisateur, {
                id: "r-" + methode.id,
                idMethode: methode.id
            });

            // Si le propriétaire de la carte n'a pas de courriel valide, on lui en donne un
            let resultat = traiterFacture(donnees, reservation);
            if (resultat.statut === "courrielRequis") {
                enregistrerCourriel(donnees, methode.idUtilisateur, "test@test.com");
                resultat = traiterFacture(donnees, reservation);
            }
            const facture = resultat.facture;
            const message = nomJeu + " / " + methode.id;

            Object.keys(facture).forEach(function (champ) {
                assert.ok(
                    String(facture[champ]).indexOf(methode.numeroCarte) === -1,
                    "numéro complet trouvé dans le champ « " + champ + " » (" + message + ")"
                );
            });
            assert.ok(JSON.stringify(facture).indexOf(methode.numeroCarte) === -1, message);
            assert.strictEqual(facture.carteMasquee, "**** " + methode.numeroCarte.slice(-4), message);
            nbCartesTestees++;
        });
    });

    // 3 cartes (normal) + 4 (limites) + 5 (erreurs)
    assert.strictEqual(nbCartesTestees, 12);
});

test("14. format — masquage : 4242424242424242 donne **** 4242", function () {
    assert.strictEqual(masquerCarte("4242424242424242"), "**** 4242");
});

test("15. format — montants : 7 donne 7,00 $ et 0.5 donne 0,50 $", function () {
    assert.strictEqual(formaterMontant(7), "7,00 $");
    assert.strictEqual(formaterMontant(0.5), "0,50 $");
});

test("16. format — date : 2026-12-03T12:00 donne 3 décembre 2026, 12 h 00", function () {
    assert.strictEqual(formaterDateFacture("2026-12-03T12:00"), "3 décembre 2026, 12 h 00");
});
