/* Chargement des jeux JSON et sauvegarde locale du scénario de démonstration. */
(function () {
  const CLE = "parkspot-donnees-v1";
  const CLE_UTILISATEUR = "parkspot-utilisateur-actif";
  const CLE_JEU = "parkspot-jeu-actif";
  const fichiers = { normal: "data/normal.json", erreurs: "data/erreurs.json", limites: "data/limites.json" };

  function jeuDepuisUrl() {
    const demande = new URLSearchParams(location.search).get("jeu");
    if (Object.hasOwn(fichiers, demande)) return demande;
    const actif = localStorage.getItem(CLE_JEU);
    return Object.hasOwn(fichiers, actif) ? actif : "normal";
  }

  function definirJeuActif(nom) {
    if (Object.hasOwn(fichiers, nom)) localStorage.setItem(CLE_JEU, nom);
  }

  function jeuActif() {
    const nom = localStorage.getItem(CLE_JEU);
    return Object.hasOwn(fichiers, nom) ? nom : jeuDepuisUrl();
  }

  function definirUtilisateurActif(id) {
    if (id) localStorage.setItem(CLE_UTILISATEUR, id);
    else localStorage.removeItem(CLE_UTILISATEUR);
  }

  function utilisateurActif() {
    return localStorage.getItem(CLE_UTILISATEUR) || "";
  }

  async function charger(nom, ignorerSauvegarde) {
    if (!Object.hasOwn(fichiers, nom)) throw new Error("Jeu de données inconnu.");
    const reponse = await fetch(fichiers[nom]);
    if (!reponse.ok) throw new Error("Impossible de charger le jeu de données.");
    const original = await reponse.json();
    if (!ignorerSauvegarde) {
      try {
        const sauvegarde = JSON.parse(localStorage.getItem(CLE) || "null");
        if (sauvegarde && sauvegarde.nomJeu === nom) return sauvegarde;
      } catch (_) { localStorage.removeItem(CLE); }
    }
    return original;
  }

  function enregistrer(donnees) {
    localStorage.setItem(CLE, JSON.stringify(donnees));
  }

  function reinitialiser() { localStorage.removeItem(CLE); }

  window.ParkSpotDonnees = {
    charger, enregistrer, reinitialiser, jeuDepuisUrl,
    definirJeuActif, jeuActif, definirUtilisateurActif, utilisateurActif
  };
})();
