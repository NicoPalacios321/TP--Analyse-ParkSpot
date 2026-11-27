// =============================================================
// facture.js — US : recevoir une facture par courriel
// -------------------------------------------------------------
// Fonction principale : envoyerFacture(reservation)
// Elle est appelée après un paiement réussi (US 3, reservation.js).
//
// Dépend de js/commun.js (afficherNotification)
// et de js/donnees.js (lireDonnees, sauvegarderDonnees) :
//   <script src="js/commun.js"></script>
//   <script src="js/donnees.js"></script>
//   <script src="js/facture.js"></script>
//
// Le fichier est séparé en deux parties :
//   1. LOGIQUE  : fonctions pures, sans document ni localStorage.
//                 Elles peuvent être testées avec Node (voir l'export à la fin).
//   2. AFFICHAGE : formulaire et envoyerFacture (la notification vient de commun.js),
//                 qui lisent/sauvegardent les données et appellent la logique.
// =============================================================


// =============================================================
// 1. LOGIQUE (testable avec Node)
// =============================================================

/**
 * Vérifie le format d'un courriel : nom@domaine.
 * Règles : du texte, un seul @, puis un domaine qui contient un point
 * (avec du texte avant et après le point). Aucun espace permis.
 * Exemples : "a@b.c" -> true ; "nicolas.gmail.com", "nicolas@", "@gmail.com" -> false
 * @param {string} courriel
 * @returns {boolean}
 */
function courrielValide(courriel) {
    // Vide, null ou contenant un espace : invalide
    if (!courriel || courriel.indexOf(" ") !== -1) {
        return false;
    }

    // On coupe au @ : il doit y avoir exactement 2 morceaux (donc un seul @)
    const morceaux = courriel.split("@");
    if (morceaux.length !== 2) {
        return false;
    }

    const nom = morceaux[0];
    const domaine = morceaux[1];

    // Il faut du texte avant le @
    if (nom === "") {
        return false;
    }

    // Le domaine doit contenir un point, mais pas au début ni à la fin
    const positionPoint = domaine.indexOf(".");
    if (positionPoint <= 0 || domaine.endsWith(".")) {
        return false;
    }

    return true;
}

/**
 * Masque un numéro de carte : on ne garde que les 4 derniers chiffres.
 * Exemple : "4242424242424242" -> "**** 4242"
 * @param {string} numeroCarte
 * @returns {string}
 */
function masquerCarte(numeroCarte) {
    return "**** " + String(numeroCarte).slice(-4);
}

// Noms des mois en français (index 0 = janvier)
const MOIS_FRANCAIS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
];

/**
 * Formate une date "AAAA-MM-JJTHH:MM" en français.
 * Exemple : "2026-12-03T12:00" -> "3 décembre 2026, 12 h 00"
 * On découpe le texte nous-mêmes : le résultat est le même dans tous les navigateurs.
 * @param {string} date
 * @returns {string}
 */
function formaterDateFacture(date) {
    const parties = date.split("T");         // ["2026-12-03", "12:00"]
    const jma = parties[0].split("-");       // ["2026", "12", "03"]
    const heure = (parties[1] || "00:00").split(":"); // ["12", "00"]

    const annee = jma[0];
    const mois = MOIS_FRANCAIS[Number(jma[1]) - 1];
    const jour = Number(jma[2]);             // Number enlève le 0 devant : "03" -> 3

    const heures = Number(heure[0]);         // "09" -> 9 (on écrit "9 h 05" en français)

    return jour + " " + mois + " " + annee + ", " + heures + " h " + heure[1];
}

/**
 * Formate un montant avec 2 décimales et une virgule.
 * Exemple : 12 -> "12,00 $" ; 7.5 -> "7,50 $"
 * @param {number} montant
 * @returns {string}
 */
function formaterMontant(montant) {
    return montant.toFixed(2).replace(".", ",") + " $";
}

/**
 * Calcule un nouvel id de facture unique : f1, f2, f3...
 * @param {Array} courriels - la liste donnees.courriels
 * @returns {string}
 */
function prochainIdFacture(courriels) {
    let numero = courriels.length + 1;
    // Par sécurité, on avance tant que l'id existe déjà
    while (courriels.some(function (c) { return c.id === "f" + numero; })) {
        numero++;
    }
    return "f" + numero;
}

/**
 * Construit l'objet facture (sans l'ajouter nulle part).
 * Le numéro complet de la carte n'est JAMAIS copié dans la facture.
 * @param {Object} donnees - l'objet de données complet
 * @param {Object} reservation
 * @param {string} destinataire - courriel valide
 * @returns {Object} la facture
 */
function creerFacture(donnees, reservation, destinataire) {
    // On retrouve la méthode de paiement et le stationnement de la réservation
    const methode = donnees.methodesPaiement.find(function (m) {
        return m.id === reservation.idMethode;
    });
    const stationnement = donnees.stationnements.find(function (s) {
        return s.id === reservation.idStationnement;
    });

    return {
        id: prochainIdFacture(donnees.courriels),
        destinataire: destinataire,
        sujet: "Facture ParkSpot — réservation " + reservation.id,
        date: donnees.dateDuJour,
        montant: reservation.prix,
        methode: methode ? methode.type : "",
        carteMasquee: methode ? masquerCarte(methode.numeroCarte) : "",
        adresseStationnement: stationnement ? stationnement.adresse : "",
        idReservation: reservation.id
    };
}

/**
 * Décide quoi faire pour la facture d'une réservation.
 * - Courriel du locataire valide : crée la facture et l'AJOUTE dans donnees.courriels.
 * - Courriel vide ou invalide : ne change rien, indique qu'un courriel est requis.
 * Ne touche ni à document ni à localStorage : c'est l'appelant qui sauvegarde.
 * @param {Object} donnees - l'objet de données (modifié si la facture est créée)
 * @param {Object} reservation - { id, idLocataire, idStationnement, idMethode, nbHeures, prix, date }
 * @returns {Object} { statut: "factureEnvoyee", facture }
 *                ou { statut: "courrielRequis", courrielActuel }
 * @throws {Error} si le locataire n'existe pas
 */
function traiterFacture(donnees, reservation) {
    const locataire = donnees.utilisateurs.find(function (u) {
        return u.id === reservation.idLocataire;
    });

    if (!locataire) {
        throw new Error("Locataire introuvable : " + reservation.idLocataire);
    }

    if (!courrielValide(locataire.courriel)) {
        return { statut: "courrielRequis", courrielActuel: locataire.courriel };
    }

    const facture = creerFacture(donnees, reservation, locataire.courriel);
    donnees.courriels.push(facture);
    return { statut: "factureEnvoyee", facture: facture };
}

/**
 * Enregistre un courriel fourni dans le profil du locataire, s'il est valide.
 * Ne touche ni à document ni à localStorage : c'est l'appelant qui sauvegarde.
 * @param {Object} donnees - l'objet de données (modifié si le courriel est valide)
 * @param {string} idLocataire
 * @param {string} courriel
 * @returns {Object} { ok: true } ou { ok: false, erreur: "message" }
 */
function enregistrerCourriel(donnees, idLocataire, courriel) {
    if (!courrielValide(courriel)) {
        return { ok: false, erreur: "Courriel invalide. Format attendu : nom@domaine (ex. nicolas@test.com)." };
    }

    const locataire = donnees.utilisateurs.find(function (u) {
        return u.id === idLocataire;
    });
    if (!locataire) {
        return { ok: false, erreur: "Locataire introuvable : " + idLocataire };
    }

    locataire.courriel = courriel;
    return { ok: true };
}


// =============================================================
// 2. AFFICHAGE (navigateur seulement)
// =============================================================

/**
 * Affiche un petit formulaire pour demander un courriel valide.
 * À l'envoi, appelle enregistrerCourriel : un courriel invalide est refusé
 * avec un message; un courriel valide est sauvegardé dans le profil.
 * @param {string} idLocataire
 * @param {string} courrielActuel - le courriel invalide actuel (peut être vide)
 * @returns {Promise<string>} le courriel valide saisi (déjà sauvegardé)
 */
function demanderCourriel(idLocataire, courrielActuel) {
    return new Promise(function (resoudre) {
        // Construction du formulaire
        const formulaire = document.createElement("form");
        formulaire.className = "facture-formulaire";
        formulaire.noValidate = true; // on fait notre propre validation
        formulaire.style.cssText =
            "border:2px solid #c69500;background:#fff8e1;padding:12px;margin:12px 0;border-radius:6px;";

        const explication = document.createElement("p");
        explication.textContent = courrielActuel
            ? "Le courriel de votre profil (" + courrielActuel + ") est invalide. Entrez un courriel valide pour recevoir votre facture."
            : "Votre profil n'a pas de courriel. Entrez un courriel pour recevoir votre facture.";

        const etiquette = document.createElement("label");
        etiquette.textContent = "Courriel : ";
        const champ = document.createElement("input");
        champ.type = "email";
        champ.placeholder = "nom@domaine.com";
        etiquette.appendChild(champ);

        const bouton = document.createElement("button");
        bouton.type = "submit";
        bouton.textContent = "Envoyer la facture";

        const erreur = document.createElement("p");
        erreur.style.color = "#b00020";
        erreur.setAttribute("role", "alert");

        formulaire.append(explication, etiquette, " ", bouton, erreur);
        document.body.appendChild(formulaire);
        champ.focus();

        // Validation à l'envoi du formulaire
        formulaire.addEventListener("submit", function (evenement) {
            evenement.preventDefault(); // empêche le rechargement de la page
            const courriel = champ.value.trim();

            // La logique valide et met à jour le profil dans l'objet donnees
            const donnees = lireDonnees();
            const resultat = enregistrerCourriel(donnees, idLocataire, courriel);

            if (!resultat.ok) {
                erreur.textContent = resultat.erreur;
                champ.focus();
                return;
            }

            // Courriel valide : on sauvegarde, on retire le formulaire et on continue
            sauvegarderDonnees(donnees);
            formulaire.remove();
            resoudre(courriel);
        });
    });
}

/**
 * Point d'entrée : envoie la facture d'une réservation payée.
 * 1. Appelle traiterFacture.
 * 2. Si un courriel est requis, affiche le formulaire, puis recommence
 *    (le profil a maintenant un courriel valide).
 * 3. Sinon, sauvegarde la facture et affiche une notification.
 * @param {Object} reservation - { id, idLocataire, idStationnement, idMethode, nbHeures, prix, date }
 * @returns {Promise<Object>} la facture créée
 */
function envoyerFacture(reservation) {
    const donnees = lireDonnees();

    let resultat;
    try {
        resultat = traiterFacture(donnees, reservation);
    } catch (erreur) {
        return Promise.reject(erreur); // ex. locataire introuvable
    }

    if (resultat.statut === "courrielRequis") {
        // On demande un courriel, puis on relance : cette fois il sera valide
        return demanderCourriel(reservation.idLocataire, resultat.courrielActuel).then(function () {
            return envoyerFacture(reservation);
        });
    }

    // statut "factureEnvoyee" : la facture est dans donnees.courriels, on sauvegarde
    sauvegarderDonnees(donnees);
    afficherNotification("Facture envoyée à " + resultat.facture.destinataire, "succes"); // js/commun.js
    return Promise.resolve(resultat.facture);
}


// =============================================================
// Export pour Node seulement.
// Dans le navigateur, "module" n'existe pas : ce bloc est ignoré
// et les fonctions restent globales comme avant.
// =============================================================
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        courrielValide: courrielValide,
        masquerCarte: masquerCarte,
        formaterDateFacture: formaterDateFacture,
        formaterMontant: formaterMontant,
        prochainIdFacture: prochainIdFacture,
        creerFacture: creerFacture,
        traiterFacture: traiterFacture,
        enregistrerCourriel: enregistrerCourriel
    };
}
