// =============================================================
// methodes_paiement_tests.js — Tests automatisés de la US 1
// Outil intégré de Node : aucun npm.
// Lancer depuis le dossier parkspot :
//   node --test tests/us1/methodes_paiement_tests.js
// =============================================================

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
    normaliserNumeroCarte,
    validerNumeroCarte,
    validerExpiration,
    validerSolde,
    validerType,
    methodeExiste,
    validerNouvelleMethode
} = require(path.join(__dirname, "..", "..", "js", "methodes_validation.js"));

function chargerJeu(nom) {
    const fichier = path.join(__dirname, "..", "..", "data", nom + ".json");
    return JSON.parse(fs.readFileSync(fichier, "utf8"));
}

function trouverUtilisateur(donnees, identifiant) {
    return donnees.utilisateurs.find(function (u) {
        return u.identifiant === identifiant;
    });
}

function methodeValide(donnees, idUtilisateur, numero) {
    return {
        type: "credit",
        numeroCarte: numero,
        expiration: "2035-12",
        solde: 100,
        idUtilisateur: idUtilisateur
    };
}

// =============================================================
// Validation du formulaire
// =============================================================

test("1. normal — numéro valide de 16 chiffres accepté", function () {
    assert.strictEqual(validerNumeroCarte("4242424242424242"), true);
});

test("2. limites — longueur minimale 13 chiffres acceptée", function () {
    assert.strictEqual(validerNumeroCarte("1234567890123"), true);
});

test("3. limites — longueur maximale 19 chiffres acceptée", function () {
    assert.strictEqual(validerNumeroCarte("1234567890123456789"), true);
});

test("4. erreurs — numéro trop court ou contenant des lettres refusé", function () {
    assert.strictEqual(validerNumeroCarte("12345"), false);
    assert.strictEqual(validerNumeroCarte("4242-CARTE-4242"), false);
});

test("5. erreurs — espaces et tirets sont normalisés avant validation", function () {
    assert.strictEqual(normaliserNumeroCarte("4242 4242-4242 4242"), "4242424242424242");
});

test("6. validation — seul crédit ou débit est accepté", function () {
    assert.strictEqual(validerType("credit"), true);
    assert.strictEqual(validerType("debit"), true);
    assert.strictEqual(validerType("prepaid"), false);
});

test("7. limites — solde nul accepté et solde négatif refusé", function () {
    assert.strictEqual(validerSolde(0), true);
    assert.strictEqual(validerSolde(-0.01), false);
});

// =============================================================
// Expiration selon la date du jeu
// =============================================================

test("8. limites — le mois courant est accepté", function () {
    assert.strictEqual(validerExpiration("2026-12", "2026-12-03T12:00"), true);
});

test("9. erreurs — une date antérieure au mois courant est refusée", function () {
    assert.strictEqual(validerExpiration("2025-10", "2026-12-03T12:00"), false);
});

test("10. erreurs — format d'expiration invalide refusé", function () {
    assert.strictEqual(validerExpiration("12/2030", "2026-12-03T12:00"), false);
    assert.strictEqual(validerExpiration("2030", "2026-12-03T12:00"), false);
});

// =============================================================
// Doublons, normal, limites et erreurs
// =============================================================

test("11. normal — une nouvelle carte validée est enregistrable", function () {
    const donnees = chargerJeu("normal");
    const marie = trouverUtilisateur(donnees, "marie.t");

    const saisie = methodeValide(donnees, marie.id, "4000000000000002");
    const resultat = validerNouvelleMethode(donnees, donnees.methodesPaiement, saisie);

    assert.strictEqual(resultat.ok, true);
});

test("12. normal — une carte déjà associée à Marie est détectée comme doublon", function () {
    const donnees = chargerJeu("normal");
    const marie = trouverUtilisateur(donnees, "marie.t");

    const saisie = methodeValide(donnees, marie.id, "4242 4242 4242 4242");
    const resultat = validerNouvelleMethode(donnees, donnees.methodesPaiement, saisie);

    assert.strictEqual(resultat.ok, false);
    assert.strictEqual(resultat.erreur, "Cette méthode de paiement est déjà enregistrée.");
});

test("13. erreurs — deux utilisateurs ne peuvent pas partager le même numéro", function () {
    const donnees = chargerJeu("erreurs");
    const marie = trouverUtilisateur(donnees, "marie.t");
    const karim = trouverUtilisateur(donnees, "courriel.invalide");

    assert.notStrictEqual(marie.id, karim.id);
    assert.strictEqual(methodeExiste(donnees.methodesPaiement, "5555555555554444"), true);

    const saisie = methodeValide(donnees, marie.id, "5555555555554444");
    const resultat = validerNouvelleMethode(donnees, donnees.methodesPaiement, saisie);

    assert.strictEqual(resultat.ok, false);
    assert.match(resultat.erreur, /déjà enregistrée/);
});

test("14. erreurs — m1 expirée reste refusée même si son solde est valide", function () {
    const donnees = chargerJeu("erreurs");
    const marie = trouverUtilisateur(donnees, "marie.t");

    const resultat = validerNouvelleMethode(donnees, donnees.methodesPaiement, {
        type: "credit",
        numeroCarte: "4000000000000069",
        expiration: "2025-10",
        solde: 800,
        idUtilisateur: marie.id
    });

    assert.strictEqual(resultat.ok, false);
    assert.strictEqual(resultat.erreur, "La méthode de paiement est expirée.");
});

test("15. erreurs — solde négatif refusé", function () {
    const donnees = chargerJeu("erreurs");
    const karim = trouverUtilisateur(donnees, "courriel.invalide");

    const resultat = validerNouvelleMethode(donnees, donnees.methodesPaiement, {
        type: "debit",
        numeroCarte: "5200828282829999",
        expiration: "2030-01",
        solde: -20,
        idUtilisateur: karim.id
    });

    assert.strictEqual(resultat.ok, false);
    assert.strictEqual(resultat.erreur, "Entrez un solde valide.");
});

test("16. limites — les solde 0, 6.99 et 999999.99 sont conservés comme cas limites", function () {
    const donnees = chargerJeu("limites");
    const soldes = donnees.methodesPaiement.map(function (m) { return m.solde; });

    assert.strictEqual(soldes.includes(0), true);
    assert.strictEqual(soldes.includes(6.99), true);
    assert.strictEqual(soldes.includes(999999.99), true);
});

test("17. erreurs — les cartes des cinq méthodes restent attachées aux bons locataires", function () {
    const donnees = chargerJeu("erreurs");

    assert.strictEqual(donnees.methodesPaiement.find(function (m) { return m.id === "m3"; }).idUtilisateur, "u1");
    assert.strictEqual(donnees.methodesPaiement.find(function (m) { return m.id === "m1"; }).idUtilisateur, "u4");
    assert.strictEqual(donnees.methodesPaiement.find(function (m) { return m.id === "m4"; }).idUtilisateur, "u2");
});

test("18. normal — les méthodes ne sont pas modifiées dans le fichier chargé", function () {
    const donnees = chargerJeu("normal");
    const nombreInitial = donnees.methodesPaiement.length;

    donnees.methodesPaiement.push({
        id: "mTest",
        idUtilisateur: donnees.utilisateurs[0].id,
        type: "debit",
        numeroCarte: "4000000000000093",
        expiration: "2030-01",
        solde: 10
    });

    assert.strictEqual(donnees.methodesPaiement.length, nombreInitial + 1);
    assert.strictEqual(chargerJeu("normal").methodesPaiement.length, nombreInitial);
});
