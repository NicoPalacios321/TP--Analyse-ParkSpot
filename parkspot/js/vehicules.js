(() => {
  "use strict";

  const notification = document.querySelector("#notification");
  const liste = document.querySelector("#liste-vehicules");
  const carteElement = document.querySelector("#carte");

  function lireJsonSession() {
    const clefs = ["utilisateurConnecte", "locataireConnecte", "utilisateur", "session", "utilisateurCourant", "sessionUtilisateur"];

    for (const clef of clefs) {
      const valeur = sessionStorage.getItem(clef);
      if (!valeur) continue;

      try {
        const objet = JSON.parse(valeur);
        if (objet && objet.id) return objet;
        if (objet && objet.utilisateur && objet.utilisateur.id) return objet.utilisateur;
      } catch (_) {
        // Certaines versions peuvent enregistrer seulement l'identifiant.
        if (valeur) return { id: valeur };
      }
    }

    return null;
  }

  function afficherNotification(message, type = "info") {
    notification.textContent = message;
    notification.className = `notification ${type}`;
  }

  function determineDataset() {
    const parametre = new URLSearchParams(window.location.search).get("jeu")?.toLowerCase();
    const stocke = sessionStorage.getItem("jeuDonnees")?.toLowerCase();
    const candidat = parametre || stocke || "normal";
    return ["normal", "limites", "erreurs"].includes(candidat) ? candidat : "normal";
  }

  function stationnementActif(vehicule, dateDuJour) {
    if (!vehicule.stationne || !vehicule.finStationnement) return false;

    const fin = new Date(vehicule.finStationnement);
    const maintenant = new Date(dateDuJour);

    if (Number.isNaN(fin.getTime()) || Number.isNaN(maintenant.getTime())) return false;
    if (fin < maintenant) return false;

    return Number.isFinite(vehicule.latitude) && Number.isFinite(vehicule.longitude);
  }

  function afficherListe(vehicules) {
    liste.replaceChildren();

    vehicules.forEach((vehicule) => {
      const article = document.createElement("article");
      article.className = "vehicule-carte";

      const titre = document.createElement("h2");
      titre.textContent = `${vehicule.marque} ${vehicule.modele}`;

      const plaque = document.createElement("p");
      plaque.textContent = `Plaque : ${vehicule.plaque}`;

      const fin = document.createElement("p");
      fin.textContent = `Stationné jusqu'au ${new Date(vehicule.finStationnement).toLocaleString("fr-CA")}`;

      article.append(titre, plaque, fin);
      liste.append(article);
    });
  }

  function afficherCarte(vehicules) {
    if (typeof L === "undefined") {
      afficherNotification("La carte n'a pas pu être chargée.", "erreur");
      return;
    }

    const carte = L.map("carte").setView([45.514, -73.56], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19
    }).addTo(carte);

    const marqueurs = vehicules.map((vehicule) =>
      L.marker([vehicule.latitude, vehicule.longitude]).bindPopup(
        `<strong>${vehicule.marque} ${vehicule.modele}</strong><br>Plaque : ${vehicule.plaque}`
      )
    );

    marqueurs.forEach((marqueur) => marqueur.addTo(carte));

    if (marqueurs.length === 1) {
      carte.setView(marqueurs[0].getLatLng(), 16);
    } else if (marqueurs.length > 1) {
      const groupe = L.featureGroup(marqueurs);
      carte.fitBounds(groupe.getBounds(), { padding: [30, 30] });
    }
  }

  async function initialiser() {
    const utilisateur = lireJsonSession();

    if (!utilisateur) {
      afficherNotification("Vous devez être connecté pour consulter vos véhicules.", "erreur");
      return;
    }

    try {
      const reponse = await fetch(`data/${determineDataset()}.json`);
      if (!reponse.ok) throw new Error("Impossible de charger les données.");

      const donnees = await reponse.json();

      const compte = (donnees.utilisateurs || []).find((user) => user.id === utilisateur.id);
      if (!compte || compte.role !== "locataire") {
        afficherNotification("Seuls les locataires peuvent consulter cette page.", "erreur");
        return;
      }

      // Un locataire ne reçoit que ses propres véhicules actifs pendant le stationnement.
      const vehicules = (donnees.vehicules || []).filter((vehicule) =>
        vehicule.idLocataire === utilisateur.id &&
        stationnementActif(vehicule, donnees.dateDuJour)
      );

      if (vehicules.length === 0) {
        afficherNotification("Il n'y a pas de véhicules à afficher pour l'instant.", "info");
        afficherListe([]);
        afficherCarte([]);
        return;
      }

      afficherNotification(`${vehicules.length} véhicule(s) stationné(s) trouvé(s).`, "succes");
      afficherListe(vehicules);
      afficherCarte(vehicules);
    } catch (erreur) {
      afficherNotification("Une erreur est survenue lors du chargement des véhicules.", "erreur");
      console.error(erreur);
    }
  }

  document.addEventListener("DOMContentLoaded", initialiser);
})();
