// =============================================================
// methodes_validation.js — règles pures de la US 1
// Utilisable dans le navigateur et par Node pour les tests.
// =============================================================
(function (globalScope) {
    "use strict";

    function normaliserNumeroCarte(numero) {
        return String(numero || "").replace(/[^0-9]/g, "");
    }

    function validerNumeroCarte(numero) {
        const chiffres = normaliserNumeroCarte(numero);
        return /^\d{13,19}$/.test(chiffres);
    }

    function moisDuJour(dateDuJour) {
        const texte = String(dateDuJour || "");
        if (/^\d{4}-\d{2}/.test(texte)) {
            return texte.slice(0, 7);
        }

        const maintenant = new Date();
        return maintenant.getFullYear() + "-" +
            String(maintenant.getMonth() + 1).padStart(2, "0");
    }

    function validerExpiration(expiration, dateDuJour) {
        return /^\d{4}-\d{2}$/.test(String(expiration || ""))
            && String(expiration) >= moisDuJour(dateDuJour);
    }

    function validerType(type) {
        return type === "credit" || type === "debit";
    }

    function validerSolde(solde) {
        const montant = Number(solde);
        return Number.isFinite(montant) && montant >= 0;
    }

    function methodeExiste(methodes, numeroCarte) {
        const numero = normaliserNumeroCarte(numeroCarte);
        return methodes.some(function (methode) {
            return normaliserNumeroCarte(methode.numeroCarte) === numero;
        });
    }

    function validerNouvelleMethode(donnees, methodesExistantes, saisie) {
        const numero = normaliserNumeroCarte(saisie.numeroCarte);

        if (!validerType(saisie.type)) {
            return { ok: false, erreur: "Choisissez un type de paiement." };
        }
        if (!validerNumeroCarte(numero)) {
            return { ok: false, erreur: "Entrez un numéro de carte valide." };
        }
        if (!validerExpiration(saisie.expiration, donnees.dateDuJour)) {
            return { ok: false, erreur: "La méthode de paiement est expirée." };
        }
        if (!validerSolde(saisie.solde)) {
            return { ok: false, erreur: "Entrez un solde valide." };
        }
        if (methodeExiste(methodesExistantes, numero)) {
            return { ok: false, erreur: "Cette méthode de paiement est déjà enregistrée." };
        }

        return { ok: true, numeroCarte: numero };
    }

    const api = {
        normaliserNumeroCarte,
        validerNumeroCarte,
        moisDuJour,
        validerExpiration,
        validerType,
        validerSolde,
        methodeExiste,
        validerNouvelleMethode
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        globalScope.ParkSpotMethodes = api;
    }
}(typeof window !== "undefined" ? window : globalThis));
