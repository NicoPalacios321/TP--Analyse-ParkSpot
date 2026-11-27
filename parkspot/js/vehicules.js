(() => {
  "use strict";

  const notification = document.querySelector("#notification");
  const liste = document.querySelector("#liste-vehicules");

  function afficherNotification(message) {
    if (typeof window.afficherNotification === "function") {
      window.afficherNotification(message);
      return;
    }

    if (window.ParkSpotCommun?.afficherNotification) {
      window.ParkSpotCommun.afficherNotification(message);
      return;
    }

    if (notification) {
      notification.textContent = message;
      notification.className = "notification";
      notification.hidden = false;
    }
  }

  function lireUtilisateurConnecte() {
    if (typeof window.utilisateurConnecte === "function") {
      return window.utilisateurConnecte();
    }

    if (window.ParkSpotSession?.utilisateurConnecte) {
      return window.ParkSpotSession.utilisateurConnecte();
    }

    const id = localStorage.getItem("parkspot_session");
    if (!id) return null;

    const donnees = lireDonneesLocales();
    return donnees?.utilisateurs?.find((utilisateur) => utilisateur.id === id) || null;
  }

  function lireDonneesLocales() {
    if (typeof window.lireDonnees === "function") {
      return window.lireDonnees();
    }

    if (window.ParkSpotDonnees?.lireDonnees) {
      return window.ParkSpotDonnees.lireDonnees();
    }

    const valeur = localStorage.getItem("parkspot_donnees");
    if (!valeur) return null;

    try {
      return JSON.parse(valeur);
    } catch (_) {
      return null;
    }
  }

  async function chargerDonneesLocales() {
    let donnees = lireDonneesLocales();

    if (donnees) return donnees;

    if (typeof window.chargerJeu === "function") {
      return window.chargerJeu("normal");
    }

    if (window.ParkSpotDonnees?.chargerJeu) {
      return window.ParkSpotDonnees.chargerJeu("normal");
    }

    return null;
  }

  function stationnementActif(vehicule, dateDuJour) {
    if (!vehicule.stationne || !vehicule.finStationnement) return false;

    const fin = new Date(vehicule.finStationnement);
    const maintenant = new Date(dateDuJour);

    if (Number.isNaN(fin.getTime()) || Number.isNaN(maintenant.getTime())) return false;

    // À la date et à l'heure de fin, le stationnement est terminé.
    if (fin <= maintenant) return false;

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
      afficherNotification("La carte n'a pas pu être chargée.");
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
    let utilisateur = lireUtilisateurConnecte();

    if (typeof window.exigerConnexion === "function") {
      utilisateur = window.exigerConnexion("locataire");
    } else if (window.ParkSpotSession?.exigerConnexion) {
      utilisateur = window.ParkSpotSession.exigerConnexion("locataire");
    }

    if (!utilisateur) {
      afficherNotification("Vous devez être connecté comme locataire pour consulter vos véhicules.");
      return;
    }

    try {
      const donnees = await chargerDonneesLocales();
      if (!donnees) throw new Error("Impossible de charger les données locales.");

      // Accès limité aux véhicules du locataire connecté.
      const vehicules = (donnees.vehicules || []).filter((vehicule) =>
        vehicule.idLocataire === utilisateur.id &&
        stationnementActif(vehicule, donnees.dateDuJour)
      );

      if (vehicules.length === 0) {
        afficherNotification("Il n'y a pas de véhicules à afficher pour l'instant.");
        afficherListe([]);
        afficherCarte([]);
        return;
      }

      afficherNotification(`${vehicules.length} véhicule(s) stationné(s) trouvé(s).`);
      afficherListe(vehicules);
      afficherCarte(vehicules);
    } catch (erreur) {
      afficherNotification("Une erreur est survenue lors du chargement des véhicules.");
      console.error(erreur);
    }
  }

  document.addEventListener("DOMContentLoaded", initialiser);
})();
