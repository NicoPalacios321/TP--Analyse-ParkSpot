// =============================================================
// commun.js — Éléments communs à toutes les pages de ParkSpot
// -------------------------------------------------------------
// Utilisation dans une page :
//   <script src="js/commun.js"></script>
//   <script>afficherMenu();</script>
// La feuille de style css/commun.css est ajoutée automatiquement.
// =============================================================

// Liens du menu : texte affiché et page visée
const LIENS_MENU = [
    { texte: "Accueil", page: "accueil.html" },
    { texte: "Mes méthodes", page: "methodes.html" },
    { texte: "Mes réservations", page: "reservations.html" },
    { texte: "Mes véhicules", page: "vehicules.html" },
    { texte: "Boîte courriel", page: "courriel.html" }
];

/**
 * Ajoute le menu de navigation tout en haut de la page.
 * Le lien de la page actuelle est mis en évidence.
 */
function afficherMenu() {
    // On ne crée pas le menu deux fois si la fonction est appelée encore
    if (document.querySelector(".menu-principal")) {
        return;
    }

    ajouterStyleCommun();

    // Nom du fichier de la page actuelle, ex. "/courriel.html" -> "courriel.html"
    const pageActuelle = window.location.pathname.split("/").pop();

    const nav = document.createElement("nav");
    nav.className = "menu-principal";
    nav.setAttribute("aria-label", "Menu principal");

    const liste = document.createElement("ul");

    LIENS_MENU.forEach(function (lien) {
        const element = document.createElement("li");
        const a = document.createElement("a");
        a.href = lien.page;
        a.textContent = lien.texte;

        // Mise en évidence de la page actuelle
        if (lien.page === pageActuelle) {
            a.className = "actif";
            a.setAttribute("aria-current", "page"); // utile pour les lecteurs d'écran
        }

        element.appendChild(a);
        liste.appendChild(element);
    });

    nav.appendChild(liste);

    // prepend : place le menu avant tout le reste du <body>
    document.body.prepend(nav);
}

/**
 * Ajoute <link rel="stylesheet" href="css/commun.css"> dans le <head>
 * s'il n'y est pas déjà. Ainsi, une page n'a qu'à inclure js/commun.js.
 */
function ajouterStyleCommun() {
    if (document.querySelector('link[href="css/commun.css"]')) {
        return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/commun.css";
    document.head.appendChild(link);
}

/**
 * Affiche une notification en haut à droite de la page pendant 5 secondes.
 * Utilisable par toutes les pages :
 *   afficherNotification("Facture envoyée à a@b.c", "succes");
 *   afficherNotification("Paiement refusé", "erreur");
 * @param {string} message - le texte à afficher
 * @param {string} type - "succes" (vert, par défaut) ou "erreur" (rouge)
 */
function afficherNotification(message, type) {
    ajouterStyleCommun(); // au cas où afficherMenu() n'a pas été appelé

    // Tout type autre que "erreur" est traité comme un succès
    const estErreur = (type === "erreur");

    const notification = document.createElement("div");
    notification.className = "notification " + (estErreur ? "notification-erreur" : "notification-succes");
    // Lecteurs d'écran : "alert" est annoncé tout de suite, "status" poliment
    notification.setAttribute("role", estErreur ? "alert" : "status");
    notification.textContent = message; // textContent : aucun HTML interprété

    document.body.appendChild(notification);

    // On retire la notification après 5 secondes
    setTimeout(function () {
        notification.remove();
    }, 5000);
}
