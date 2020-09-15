module.exports = {
  missingParameter(param) { return `Le paramètre '${param}' est requis.`; },
  invalidParameter(param) { return `Le paramètre '${param}' n'est pas valide.`; },
  InvalidEntite(param, entite) { return `Le parametre '${param}' n'est pas un ${entite} valide.`; },

  missingBody() { return 'Un body non vide est requis.'; },
  invalidBody(param) { return `le body n'est pas un '${param}' valide.`; },

  missingFile(file) { return `Le fichier demandé (${file}) n'existe pas`; },
};
