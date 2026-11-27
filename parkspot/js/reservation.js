/* Parcours de réservation local : validation, débit simulé et facture. */
(function () {
  const $ = (id) => document.getElementById(id);
  const selectJeu = $("jeu-donnees");
  const selectLocataire = $("locataire");
  const selectMethode = $("methode-paiement");
  const dateReservation = $("date-reservation");
  const annonce = $("annonce");
  const facture = $("facture");
  let donnees;
  let locataireId = "";
  let stationnementSelectionneId = new URLSearchParams(location.search).get("stationnement") || "";
  let formulairePositionne = false;
  const cartes = {};

  function echapper(valeur) {
    return String(valeur).replace(/[&<>"']/g, (caractere) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caractere]);
  }

  function argent(montant) {
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(montant);
  }

  function minimumReservation() {
    const instantMinimum = Date.now() + 2 * 60 * 60 * 1000;
    const date = new Date(instantMinimum);
    date.setSeconds(0, 0);
    if (date.getTime() < instantMinimum) date.setMinutes(date.getMinutes() + 1);
    return date;
  }

  function valeurDateHeureLocale(date) {
    const deuxChiffres = (valeur) => String(valeur).padStart(2, "0");
    return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}T${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}`;
  }

  function normaliserDatesReservations(donneesChargees) {
    let modifiees = false;
    (donneesChargees.reservations || []).forEach((reservation) => {
      const dateDebutValide = reservation.dateDebut && Number.isFinite(new Date(reservation.dateDebut).getTime());
      const ancienneDateValide = reservation.date && Number.isFinite(new Date(reservation.date).getTime());
      if (!dateDebutValide && ancienneDateValide) {
        // Les anciennes sauvegardes utilisaient « date » comme date de la réservation.
        reservation.dateDebut = reservation.date;
        modifiees = true;
      }
    });
    if (modifiees) {
      try { ParkSpotDonnees.enregistrer(donneesChargees); }
      catch (_) { /* Les dates restent complétées en mémoire si le stockage échoue. */ }
    }
  }

  function afficherCarte(idCarte, stationnements, reservations, idErreur) {
    const conteneur = $(idCarte);
    const erreur = $(idErreur);
    if (!conteneur) return;
    if (!window.L) {
      if (erreur) {
        erreur.textContent = "La carte n’a pas pu être chargée. Vérifiez votre connexion Internet.";
        erreur.hidden = false;
      }
      return;
    }
    if (cartes[idCarte]) cartes[idCarte].remove();
    if (erreur) erreur.hidden = true;

    const carte = window.L.map(idCarte, {
      minZoom: 10,
      maxZoom: 18,
      maxBounds: [[45.35, -74.05], [45.75, -73.15]],
      maxBoundsViscosity: 1,
      worldCopyJump: true
    }).setView([45.52, -73.57], 12);
    cartes[idCarte] = carte;
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      noWrap: true,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(carte);

    const points = [];
    function ajouterPoint(place, type, popup) {
      const latitude = Number(place.latitude);
      const longitude = Number(place.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const reservation = type === "reservation";
      window.L.circleMarker([latitude, longitude], {
        type,
        stationnementId: place.id,
        radius: reservation ? 9 : 7,
        color: reservation ? "#b42318" : "#087e78",
        fillColor: reservation ? "#d94841" : "#168aad",
        fillOpacity: reservation ? 0.6 : 0.9,
        weight: 2
      }).bindPopup(popup).addTo(carte);
      points.push([latitude, longitude]);
    }

    if (idCarte === "carte-stationnements") {
      (stationnements || []).forEach((place) => {
        const adresse = place.adresse && place.adresse.trim() ? place.adresse : "Adresse non renseignée";
        const disponibilite = place.reserve ? "Réservé" : "Libre";
        const action = place.reserve ? "" : `<br><a class="button" href="stationnement.html?stationnement=${encodeURIComponent(place.id)}">Réserver</a>`;
        ajouterPoint(place, "stationnement", `<strong>Stationnement ${echapper(place.id)}</strong><br>${echapper(adresse)}<br>${disponibilite} · ${argent(Number(place.prixHoraire))} / heure${action}`);
      });
    }

    (reservations || []).filter((reservation) => reservation.statut !== "Annulée").forEach((reservation) => {
      const place = (stationnements || []).find((stationnement) => stationnement.id === reservation.idStationnement);
      if (!place) return;
      const adresse = place.adresse && place.adresse.trim() ? place.adresse : "Adresse non renseignée";
      ajouterPoint(place, "reservation", `<strong>Réservation ${echapper(reservation.id)}</strong><br>${echapper(adresse)}<br>${echapper(reservation.statut || "Confirmée")} · Départ : ${echapper(new Date(reservation.dateDebut).toLocaleString("fr-CA"))}`);
    });

    if (points.length) carte.fitBounds(points, { padding: [20, 20], maxZoom: 14 });
  }

  if ($("liste-reservations")) {
    afficherMesReservations();
    return;
  }

  async function afficherMesReservations() {
    const listeReservations = $("liste-reservations");
    const utilisateurConnecte = $("utilisateur-connecte");
    const details = $("details-reservation");
    const contenuDetails = $("contenu-details-reservation");
    const boutonAnnuler = $("annuler-reservation");
    const messageAnnulation = $("message-annulation");
    let donneesReservations;
    let utilisateur;
    let reservationSelectionnee = "";

    function dateAffichee(valeur) {
      const date = new Date(valeur);
      return Number.isNaN(date.getTime()) ? "Non précisée" : date.toLocaleString("fr-CA");
    }

    function peutAnnuler(reservation) {
      const debut = new Date(reservation.dateDebut).getTime();
      const maintenant = Date.now();
      const delai = 24 * 60 * 60 * 1000;
      return reservation.statut === "Confirmée"
        && Number.isFinite(debut)
        && Number.isFinite(maintenant)
        && maintenant <= debut - delai;
    }

    function reservationParId(id) {
      return (donneesReservations.reservations || []).find((reservation) => reservation.id === id && reservation.idLocataire === utilisateur.id);
    }

    function afficherDetails(id) {
      const reservation = reservationParId(id);
      if (!reservation) return;
      reservationSelectionnee = reservation.id;
      const place = donneesReservations.stationnements.find((s) => s.id === reservation.idStationnement);
      const methode = donneesReservations.methodesPaiement.find((m) => m.id === reservation.idMethode);
      const dateLimite = reservation.dateDebut ? new Date(new Date(reservation.dateDebut).getTime() - 24 * 60 * 60 * 1000) : null;
      const autorisee = peutAnnuler(reservation);

      contenuDetails.innerHTML = `<div><dt>Statut</dt><dd>${echapper(reservation.statut || "Inconnu")}</dd></div><div><dt>Stationnement</dt><dd>${echapper(place ? place.adresse : "Stationnement introuvable")}</dd></div><div><dt>Date de départ</dt><dd>${echapper(dateAffichee(reservation.dateDebut))}</dd></div><div><dt>Durée</dt><dd>${reservation.nbHeures} heure${reservation.nbHeures === 1 ? "" : "s"}</dd></div><div><dt>Prix</dt><dd>${argent(Number(reservation.prix))}</dd></div><div><dt>Méthode de paiement</dt><dd>${methode ? `${echapper(methode.type)} •••• ${echapper(String(methode.numeroCarte || "").slice(-4))}` : "Non disponible"}</dd></div><div><dt>Référence</dt><dd>${echapper(reservation.id)}</dd></div>`;
      details.hidden = false;
      boutonAnnuler.disabled = !autorisee;
      if (autorisee) {
        messageAnnulation.textContent = `Annulation possible jusqu’au ${dateAffichee(dateLimite)} (24 h avant le début).`;
      } else if (reservation.statut === "Annulée") {
        messageAnnulation.textContent = "Cette réservation a déjà été annulée.";
      } else if (!reservation.dateDebut || !Number.isFinite(new Date(reservation.dateDebut).getTime())) {
        messageAnnulation.textContent = "La date de début est inconnue; l’annulation n’est pas disponible.";
      } else if (reservation.statut !== "Confirmée") {
        messageAnnulation.textContent = "Cette réservation n’est plus active.";
      } else {
        messageAnnulation.textContent = "Le délai de 24 h avant le début est dépassé; l’annulation n’est plus disponible.";
      }
    }

    function afficherListe() {
      const reservations = (donneesReservations.reservations || []).filter((reservation) => reservation.idLocataire === utilisateur.id && reservation.statut !== "Annulée");
      $("compte-reservations").textContent = `${reservations.length} réservation${reservations.length === 1 ? "" : "s"}`;
      if (!reservations.length) {
        listeReservations.innerHTML = '<p class="hint">Vous n’avez pas de réservation active.</p>';
        details.hidden = true;
        afficherCarte("carte-reservations", donneesReservations.stationnements || [], [], "erreur-carte-reservations");
        return;
      }
      listeReservations.innerHTML = reservations.map((reservation) => {
        const place = donneesReservations.stationnements.find((s) => s.id === reservation.idStationnement);
        return `<article class="parking-card"><div class="parking-info"><div class="title-row"><h3>${echapper(place ? place.adresse : "Stationnement introuvable")}</h3><span class="badge ${reservation.statut === "Confirmée" ? "free" : "busy"}">${echapper(reservation.statut || "Inconnu")}</span></div><p>Départ : ${echapper(dateAffichee(reservation.dateDebut))} · ${reservation.nbHeures} heure${reservation.nbHeures === 1 ? "" : "s"} · ${argent(Number(reservation.prix))}</p><button class="button" type="button" data-details="${echapper(reservation.id)}">Voir les détails</button></div></article>`;
      }).join("");
      const reservationsConfirmees = reservations.filter((reservation) => reservation.statut === "Confirmée");
      const placesReservees = (donneesReservations.stationnements || []).filter((place) =>
        reservationsConfirmees.some((reservation) => reservation.idStationnement === place.id)
      );
      afficherCarte("carte-reservations", placesReservees, reservationsConfirmees, "erreur-carte-reservations");
      if (reservationSelectionnee) afficherDetails(reservationSelectionnee);
    }

    function annulerReservationSelectionnee() {
      const reservation = reservationParId(reservationSelectionnee);
      if (!reservation || !peutAnnuler(reservation)) {
        if (reservation) afficherDetails(reservation.id);
        return;
      }
      const place = donneesReservations.stationnements.find((s) => s.id === reservation.idStationnement);
      const methode = donneesReservations.methodesPaiement.find((m) => m.id === reservation.idMethode);
      const ancienStatut = reservation.statut;
      const ancienneDisponibilite = place && place.reserve;
      const ancienSolde = methode && Number(methode.solde);

      reservation.statut = "Annulée";
      if (place) place.reserve = false;
      if (methode) methode.solde = Math.round((Number(methode.solde) + Number(reservation.prix)) * 100) / 100;
      try {
        ParkSpotDonnees.enregistrer(donneesReservations);
      } catch (_) {
        reservation.statut = ancienStatut;
        if (place) place.reserve = ancienneDisponibilite;
        if (methode) methode.solde = ancienSolde;
        messageAnnulation.textContent = "L’annulation n’a pas pu être sauvegardée dans ce navigateur.";
        return;
      }
      reservationSelectionnee = "";
      details.hidden = true;
      afficherListe();
    }

    try {
      const nomJeu = ParkSpotDonnees.jeuActif();
      donneesReservations = await ParkSpotDonnees.charger(nomJeu);
      normaliserDatesReservations(donneesReservations);
      const idUtilisateur = ParkSpotDonnees.utilisateurActif();
      utilisateur = donneesReservations.utilisateurs.find((u) => u.id === idUtilisateur && u.role === "locataire");

      if (!utilisateur) {
        utilisateurConnecte.textContent = "Aucun locataire sélectionné.";
        listeReservations.innerHTML = '<p class="hint">Sélectionnez un locataire sur la page <a href="stationnement.html">Réserver un stationnement</a>.</p>';
        $("compte-reservations").textContent = "0 réservation";
        return;
      }

      utilisateurConnecte.textContent = `Compte connecté : ${utilisateur.nom} (${utilisateur.identifiant})`;
      listeReservations.addEventListener("click", (event) => {
        const bouton = event.target.closest("[data-details]");
        if (bouton) afficherDetails(bouton.dataset.details);
      });
      boutonAnnuler.addEventListener("click", annulerReservationSelectionnee);
      afficherListe();
    } catch (erreur) {
      utilisateurConnecte.textContent = "Impossible de charger les réservations.";
      listeReservations.innerHTML = `<p class="notice error">${echapper(erreur.message)} Ouvrez le projet avec VS Code Live Server.</p>`;
    }
  }

  function afficherAnnonce(message, type) {
    annonce.textContent = message;
    annonce.className = `notice ${type || ""}`;
    annonce.hidden = false;
  }

  function choisirLocataire(id) {
    const existe = donnees.utilisateurs.some((u) => u.id === id && u.role === "locataire");
    locataireId = existe ? id : (donnees.utilisateurs.find((u) => u.role === "locataire") || {}).id || "";
    selectLocataire.value = locataireId;
    ParkSpotDonnees.definirUtilisateurActif(locataireId);
    const methodes = donnees.methodesPaiement.filter((m) => m.idUtilisateur === locataireId);
    selectMethode.innerHTML = methodes.length
      ? methodes.map((m) => {
        const type = m.type === "credit" ? "Crédit" : m.type === "debit" ? "Débit" : m.type;
        const quatreChiffres = String(m.numeroCarte || "").slice(-4);
        return `<option value="${echapper(m.id)}">${echapper(type)} •••• ${echapper(quatreChiffres)} — solde ${argent(Number(m.solde))}</option>`;
      }).join("")
      : '<option value="">Aucune méthode de paiement</option>';
    selectMethode.disabled = !methodes.length;
    afficherStationnements();
  }

  function afficherStationnements() {
    const stationnements = donnees.stationnements || [];
    $("compte-stationnements").textContent = `${stationnements.length} résultat${stationnements.length > 1 ? "s" : ""}`;
    afficherFormulaireReservation();
    afficherCarte("carte-stationnements", stationnements, donnees.reservations || [], "erreur-carte-stationnements");
  }

  function afficherFormulaireReservation() {
    const formulaire = $("formulaire-reservation");
    const resume = $("stationnement-selectionne");
    const bouton = $("confirmer-reservation");
    const place = (donnees.stationnements || []).find((stationnement) => stationnement.id === stationnementSelectionneId);
    formulaire.hidden = !stationnementSelectionneId;
    if (!stationnementSelectionneId) return;
    if (!place) {
      resume.textContent = "Ce stationnement est introuvable dans le jeu de données choisi.";
      bouton.disabled = true;
      return;
    }
    resume.textContent = `${place.adresse || "Adresse non renseignée"} · ${argent(Number(place.prixHoraire))} / heure${place.reserve ? " · Déjà réservé" : ""}`;
    bouton.disabled = place.reserve === true;
    $("date-reservation").min = valeurDateHeureLocale(minimumReservation());
    if (!formulairePositionne) {
      formulairePositionne = true;
      formulaire.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function confirmerReservation(id) {
    const place = donnees.stationnements.find((s) => s.id === id);
    const locataire = donnees.utilisateurs.find((u) => u.id === locataireId);
    if (!locataire || locataire.role !== "locataire") {
      afficherAnnonce("Connectez-vous avec un compte locataire pour réserver.", "error");
      return;
    }
    const courrielValide = typeof locataire.courriel === "string"
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(locataire.courriel.trim());
    if (!courrielValide) {
      afficherAnnonce("Un courriel valide est requis pour réserver un stationnement.", "error");
      return;
    }
    if (!place || place.reserve === true) {
      afficherAnnonce("Stationnement déjà réserver", "error");
      return;
    }
    const dateMinimum = minimumReservation();
    dateReservation.min = valeurDateHeureLocale(dateMinimum);
    if (!dateReservation.value) {
      afficherAnnonce("Veuillez sélectionner une date et une heure pour le stationnement.", "error");
      dateReservation.focus();
      return;
    }
    const dateDebut = new Date(dateReservation.value);
    if (!Number.isFinite(dateDebut.getTime()) || dateDebut < dateMinimum) {
      afficherAnnonce("Le stationnement doit commencer aujourd’hui ou plus tard, au moins deux heures après maintenant.", "error");
      dateReservation.focus();
      return;
    }
    const heures = Number($("heures-reservation").value);
    const prix = Math.round(Number(place.prixHoraire) * heures * 100) / 100;
    const methode = donnees.methodesPaiement.find((m) => m.id === selectMethode.value && m.idUtilisateur === locataireId);
    if (!methode) {
      afficherAnnonce("Aucune méthode de paiement sélectionnée.", "error");
      return;
    }
    if (Number(methode.solde) < prix) {
      afficherAnnonce("Fonds insuffisant", "error");
      return;
    }

    // Confirmation explicite avant le débit simulé.
    const quatreChiffres = String(methode.numeroCarte || "").slice(-4);
    if (!window.confirm(`Confirmer le paiement de ${argent(prix)} pour ${heures} heure${heures > 1 ? "s" : ""} sur la carte se terminant par ${quatreChiffres} ?`)) return;

    // Vérifier à nouveau la disponibilité juste avant de confirmer.
    if (place.reserve === true) {
      afficherAnnonce("Stationnement déjà réserver", "error");
      return;
    }
    methode.solde = Math.round((Number(methode.solde) - prix) * 100) / 100;
    place.reserve = true;
    const reservation = {
      id: `r-${Date.now()}`, idLocataire: locataireId, idStationnement: place.id,
      idMethode: methode.id, nbHeures: heures, prix,
      date: new Date().toISOString(),
      dateDebut: dateDebut.toISOString(),
      statut: "Confirmée"
    };
    donnees.reservations = donnees.reservations || [];
    donnees.reservations.push(reservation);
    try { ParkSpotDonnees.enregistrer(donnees); }
    catch (_) {
      // Annuler les mutations si le navigateur refuse le stockage local.
      donnees.reservations.pop();
      methode.solde += prix;
      place.reserve = false;
      afficherAnnonce("La réservation n'a pas pu être sauvegardée dans ce navigateur.", "error");
      return;
    }
    afficherAnnonce("Paiement confirmé. Votre réservation est confirmée.", "success");
    const dateAffichee = new Date(reservation.date).toLocaleString("fr-CA");
    const proprietaire = donnees.utilisateurs.find((u) => u.id === place.idProprietaire);
    facture.hidden = false;
    facture.innerHTML = `<p class="eyebrow">Facture · ${echapper(reservation.id)}</p><h2 id="facture-titre">Paiement confirmé</h2><dl><div><dt>Locataire</dt><dd>${echapper(locataire.nom)}</dd></div><div><dt>Courriel du locataire</dt><dd>${echapper(locataire.courriel)}</dd></div><div><dt>Propriétaire</dt><dd>${echapper(proprietaire ? proprietaire.nom : "Propriétaire introuvable")}</dd></div><div><dt>Stationnement</dt><dd>${echapper(place.adresse)}</dd></div><div><dt>Durée</dt><dd>${heures} heure${heures > 1 ? "s" : ""}</dd></div><div><dt>Date du stationnement</dt><dd>${echapper(new Date(reservation.dateDebut).toLocaleString("fr-CA"))}</dd></div><div><dt>Méthode</dt><dd>Carte se terminant par ${echapper(quatreChiffres)}</dd></div><div><dt>Date du paiement</dt><dd>${echapper(dateAffichee)}</dd></div><div class="total"><dt>Total payé</dt><dd>${argent(prix)}</dd></div></dl><p class="hint">Solde restant sur cette carte : ${argent(methode.solde)}</p>`;
    stationnementSelectionneId = "";
    $("formulaire-reservation").hidden = true;
    afficherStationnements();
    facture.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function chargerJeu(nom, reinitialiser) {
    try {
      if (reinitialiser) ParkSpotDonnees.reinitialiser();
      donnees = await ParkSpotDonnees.charger(nom);
      normaliserDatesReservations(donnees);
      ParkSpotDonnees.definirJeuActif(nom);
      dateReservation.value = "";
      dateReservation.min = valeurDateHeureLocale(minimumReservation());
      selectLocataire.innerHTML = donnees.utilisateurs.filter((u) => u.role === "locataire").map((u) => `<option value="${echapper(u.id)}">${echapper(u.nom)} (${echapper(u.identifiant)})</option>`).join("");
      selectLocataire.disabled = !selectLocataire.options.length;
      const utilisateurSauvegarde = locataireId || ParkSpotDonnees.utilisateurActif();
      choisirLocataire(utilisateurSauvegarde && donnees.utilisateurs.some((u) => u.id === utilisateurSauvegarde && u.role === "locataire") ? utilisateurSauvegarde : (selectLocataire.options[0] || {}).value);
      facture.hidden = true;
      annonce.hidden = true;
    } catch (erreur) {
      afficherAnnonce(`${erreur.message} Ouvrez le projet avec VS Code Live Server pour charger les fichiers JSON.`, "error");
      selectLocataire.disabled = true;
    }
  }

  $("formulaire-reservation").addEventListener("submit", (event) => {
    event.preventDefault();
    confirmerReservation(stationnementSelectionneId);
  });
  selectLocataire.addEventListener("change", () => { facture.hidden = true; annonce.hidden = true; choisirLocataire(selectLocataire.value); });
  selectMethode.addEventListener("change", () => { facture.hidden = true; annonce.hidden = true; });
  selectJeu.value = ParkSpotDonnees.jeuDepuisUrl();
  selectJeu.addEventListener("change", () => {
    locataireId = "";
    chargerJeu(selectJeu.value, true);
  });
  chargerJeu(selectJeu.value, false);
})();
