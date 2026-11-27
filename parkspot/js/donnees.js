// =============================================================
// donnees.js — Module de données commun de ParkSpot
// -------------------------------------------------------------
// Ce fichier gère TOUTES les données de l'application.
// Les données viennent d'un fichier JSON (data/normal.json,
// data/limites.json ou data/erreurs.json) et sont ensuite
// conservées dans le localStorage du navigateur.
//
// Utilisation dans une page HTML (script classique) :
//   <script src="js/donnees.js"></script>
//   <script>
//     donneesPretes.then(function () {
//       const donnees = lireDonnees();
//       ...
//     });
//   </script>
// =============================================================

// Clé unique utilisée dans le localStorage pour les données
const CLE_DONNEES = "parkspot_donnees";

// Jeu chargé par défaut si rien n'est encore sauvegardé
const JEU_PAR_DEFAUT = "normal";

/**
 * Charge le jeu de données data/<nom>.json avec fetch
 * et remplace les données sauvegardées dans le localStorage.
 * fetch est asynchrone : la fonction retourne une Promise
 * qui donne l'objet de données une fois chargé.
 * @param {string} nom - "normal", "limites" ou "erreurs"
 * @returns {Promise<Object>}
 */
function chargerJeu(nom) {
    return fetch("data/" + nom + ".json")
        .then(function (reponse) {
            // fetch ne lance pas d'erreur pour un 404 : on vérifie nous-mêmes
            if (!reponse.ok) {
                throw new Error("Impossible de charger data/" + nom + ".json (" + reponse.status + ")");
            }
            // Convertit le texte JSON en objet JavaScript
            return reponse.json();
        })
        .then(function (donnees) {
            // Remplace les anciennes données par les nouvelles
            sauvegarderDonnees(donnees);
            return donnees;
        });
}

/**
 * Retourne l'objet de données sauvegardé dans le localStorage.
 * @returns {Object|null} les données, ou null si rien n'est sauvegardé
 */
function lireDonnees() {
    const texte = localStorage.getItem(CLE_DONNEES);
    if (texte === null) {
        return null;
    }
    // Le localStorage ne contient que du texte : on le reconvertit en objet
    return JSON.parse(texte);
}

/**
 * Sauvegarde l'objet de données dans le localStorage.
 * @param {Object} donnees - l'objet complet à sauvegarder
 */
function sauvegarderDonnees(donnees) {
    // Le localStorage ne stocke que du texte : on convertit l'objet en JSON
    localStorage.setItem(CLE_DONNEES, JSON.stringify(donnees));
}

/**
 * Recharge le jeu actuel (celui indiqué par le champ nomJeu)
 * à partir de son fichier JSON d'origine.
 * Toutes les modifications faites depuis sont donc effacées.
 * @returns {Promise<Object>}
 */
function reinitialiser() {
    const donnees = lireDonnees();
    // S'il n'y a pas de données, on revient au jeu par défaut
    const nom = donnees !== null ? donnees.nomJeu : JEU_PAR_DEFAUT;
    return chargerJeu(nom);
}

// -------------------------------------------------------------
// Au chargement de la page : si aucune donnée n'est sauvegardée,
// on charge automatiquement le jeu "normal".
// donneesPretes est une Promise que les pages peuvent attendre
// avec .then(...) avant d'utiliser lireDonnees().
// -------------------------------------------------------------
const donneesPretes = (lireDonnees() === null)
    ? chargerJeu(JEU_PAR_DEFAUT)
    : Promise.resolve(lireDonnees());
