(() => {
  "use strict";

  const formulaire = document.querySelector("#formulairePaiement");
  const jeuSelect = document.querySelector("#jeuDonnees");
  const typeInput = document.querySelector("#type");
  const numeroInput = document.querySelector("#numeroCarte");
  const expirationInput = document.querySelector("#expiration");
  const soldeInput = document.querySelector("#solde");
  const message = document.querySelector("#message");
  const liste = document.querySelector("#methodes");
  const locataireLabel = document.querySelector("#locataire");
  const locataireSelect = document.querySelector("#locataireSelect");
  const confirmerBouton = document.querySelector("#confirmer");

  const SCENARIOS = ["normal", "limites", "erreurs"];
  let donnees;
  let utilisateur;

  function moisCourant() {
    if (donnees && /^\d{4}-\d{2}/.test(donnees.dateDuJour)) {
      return donnees.dateDuJour.slice(0, 7);
    }
    const maintenant = new Date();
    return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}`;
  }

  function lireUtilisateurConnecte() {
    try {
      const session = JSON.parse(sessionStorage.getItem("parkspotSession") || "null");
      return session && session.id ? session : null;
    } catch (_) {
      return null;
    }
  }

  function montrerMessage(texte, erreur = true) {
    message.textContent = texte;
    message.className = `message ${erreur ? "erreur" : "succes"}`;
  }

  function normaliserCarte(valeur) {
    return valeur.replace(/[^0-9]/g, "");
  }

  function validerNumeroCarte(numero) {
    return /^\d{13,19}$/.test(numero);
  }

  function clotureMois(expiration) {
    return /^\d{4}-\d{2}$/.test(expiration) && expiration >= moisCourant();
  }

  function lireSauvegardes() {
    try {
      return JSON.parse(localStorage.getItem(`parkspotMethodesPaiement_${jeuSelect.value}`) || "[]");
    } catch (_) {
      return [];
    }
  }

  function ecrireSauvegardes(methodes) {
    localStorage.setItem(`parkspotMethodesPaiement_${jeuSelect.value}`, JSON.stringify(methodes));
  }

  function lireMethodesSupprimees() {
    try {
      return JSON.parse(sessionStorage.getItem(`parkspotMethodesSupprimees_${jeuSelect.value}`) || "[]");
    } catch (_) {
      return [];
    }
  }

  function supprimerMethode(id) {
    const estDansJeuDeDonnees = donnees.methodesPaiement.some((m) => m.id === id);

    if (estDansJeuDeDonnees) {
      const supprimees = lireMethodesSupprimees();
      if (!supprimees.includes(id)) supprimees.push(id);
      sessionStorage.setItem(`parkspotMethodesSupprimees_${jeuSelect.value}`, JSON.stringify(supprimees));
    } else {
      const sauvegardes = lireSauvegardes().filter((m) => m.id !== id);
      ecrireSauvegardes(sauvegardes);
    }

    const selection = sessionStorage.getItem("parkspotMethodeSelectionnee");
    if (selection === id) {
      sessionStorage.removeItem("parkspotMethodeSelectionnee");
      sessionStorage.removeItem("parkspotMethodeSelectionneeDetails");
    }

    afficherMethodes();
    montrerMessage("La méthode de paiement a été retirée de la liste.", false);
  }

  function obtenirMethodesUtilisateur() {
    const supprimees = lireMethodesSupprimees();
    const initiales = donnees.methodesPaiement.filter((m) => m.idUtilisateur === utilisateur.id && !supprimees.includes(m.id));
    const nouvelles = lireSauvegardes().filter((m) => m.idUtilisateur === utilisateur.id);
    return [...initiales, ...nouvelles];
  }

  function obtenirToutesMethodes() {
    const supprimees = lireMethodesSupprimees();
    const initiales = (donnees ? donnees.methodesPaiement : []).filter((m) => !supprimees.includes(m.id));
    const nouvelles = lireSauvegardes();
    return [...initiales, ...nouvelles];
  }

  function afficherMethodes() {
    const methodes = obtenirMethodesUtilisateur();
    liste.replaceChildren();

    if (methodes.length === 0) {
      confirmerBouton.disabled = true;
      const vide = document.createElement("p");
      vide.className = "vide";
      vide.textContent = "Aucune méthode de paiement enregistrée.";
      liste.append(vide);
      return;
    }

    confirmerBouton.disabled = methodes.length === 0;

    const selectionSauvegardee = sessionStorage.getItem("parkspotMethodeSelectionnee");
    const selectionValide = methodes.some((m) => m.id === selectionSauvegardee)
      ? selectionSauvegardee
      : methodes[0].id;

    methodes.forEach((m, index) => {
      const article = document.createElement("div");
      article.className = "methode methode-selectable";

      const masque = `•••• •••• •••• ${m.numeroCarte.slice(-4)}`;
      article.innerHTML = `
        <div class="radio-zone">
          <input type="radio" name="methodeSelectionnee" value="${m.id}" ${m.id === selectionValide ? "checked" : ""}>
          <div>
            <strong>${m.type === "credit" ? "Crédit" : "Débit"}</strong>
            <span>${masque}</span>
          </div>
        </div>
        <div class="details">
          <span>Expire ${m.expiration}</span>
          <span>${Number(m.solde).toFixed(2)} $</span>
          <button type="button" class="bouton-supprimer" data-id="${m.id}">Retirer</button>
        </div>`;
      liste.append(article);
    });

    sessionStorage.setItem("parkspotMethodeSelectionnee", selectionValide);
  }

  async function chargerJeu(nom) {
    if (!SCENARIOS.includes(nom)) nom = "normal";

    try {
      const reponse = await fetch(`data/${nom}.json`);
      if (!reponse.ok) throw new Error("Jeu introuvable");
      donnees = await reponse.json();
    } catch (_) {
      montrerMessage("Impossible de charger le jeu de données. Servez le dossier avec Live Server.", true);
      return;
    }

    const session = lireUtilisateurConnecte();
    const locataires = donnees.utilisateurs.filter((u) => u.role === "locataire");

    locataireSelect.replaceChildren();
    locataires.forEach((locataire) => {
      const option = document.createElement("option");
      option.value = locataire.id;
      option.textContent = locataire.nom;
      locataireSelect.append(option);
    });

    const locataireSession = session
      ? locataires.find((u) => u.id === session.id)
      : null;
    utilisateur = locataireSession || locataires[0];

    if (!utilisateur) {
      locataireLabel.textContent = "Aucun locataire";
      montrerMessage("Aucun locataire n'est disponible dans ce jeu de données.");
      return;
    }

    locataireSelect.value = utilisateur.id;
    locataireLabel.textContent = utilisateur.nom;
    expirationInput.min = moisCourant();
    afficherMethodes();
  }

  formulaire.addEventListener("submit", (event) => {
    event.preventDefault();
    montrerMessage("", false);

    const type = typeInput.value;
    const numero = normaliserCarte(numeroInput.value);
    const expiration = expirationInput.value;
    const solde = Number(soldeInput.value);

    if (!type) return montrerMessage("Choisissez un type de paiement.");
    if (!validerNumeroCarte(numero)) return montrerMessage("Entrez un numéro de carte valide.");
    if (!clotureMois(expiration)) return montrerMessage("La méthode de paiement est expirée.");
    if (!Number.isFinite(solde) || solde < 0) return montrerMessage("Entrez un solde valide.");

    const existantes = obtenirToutesMethodes();
    if (existantes.some((m) => m.numeroCarte === numero)) {
      return montrerMessage("Cette méthode de paiement est déjà enregistrée sur votre profil.");
    }

    const sauvegardes = lireSauvegardes();
    const nouvelleMethodes = {
      id: `m${Date.now()}`,
      idUtilisateur: utilisateur.id,
      type,
      numeroCarte: numero,
      expiration,
      solde: Math.round(solde * 100) / 100
    };

    sauvegardes.push(nouvelleMethodes);
    ecrireSauvegardes(sauvegardes);
    sessionStorage.setItem("parkspotMethodeSelectionnee", nouvelleMethodes.id);

    afficherMethodes();
    formulaire.reset();
    soldeInput.value = "0.00";
    montrerMessage("La méthode de paiement a été enregistrée.", false);
  });

  jeuSelect.addEventListener("change", () => chargerJeu(jeuSelect.value));
  document.querySelector("#annuler").addEventListener("click", () => {
    window.location.href = "accueil.html";
  });

  numeroInput.addEventListener("input", () => {
    const chiffres = normaliserCarte(numeroInput.value).slice(0, 19);
    numeroInput.value = chiffres.replace(/(.{4})/g, "$1 ").trim();
  });

  locataireSelect.addEventListener("change", () => {
    utilisateur = donnees.utilisateurs.find((u) => u.id === locataireSelect.value);
    locataireLabel.textContent = utilisateur ? utilisateur.nom : "Locataire";
    montrerMessage("", false);
    afficherMethodes();
  });

  confirmerBouton.addEventListener("click", () => {
    const selection = document.querySelector('input[name="methodeSelectionnee"]:checked');
    if (!selection) {
      montrerMessage("Sélectionnez une méthode de paiement.");
      return;
    }

    const methodeSelectionnee = obtenirToutesMethodes().find((m) => m.id === selection.value);
    if (!methodeSelectionnee) {
      montrerMessage("Cette méthode de paiement est introuvable.");
      return;
    }

    sessionStorage.setItem("parkspotMethodeSelectionnee", selection.value);
    sessionStorage.setItem("parkspotMethodeSelectionneeDetails", JSON.stringify(methodeSelectionnee));
    window.location.href = "accueil.html";
  });

  liste.addEventListener("click", (event) => {
    if (event.target.classList.contains("bouton-supprimer")) {
      supprimerMethode(event.target.dataset.id);
    }
  });

  chargerJeu(jeuSelect.value);
})();
