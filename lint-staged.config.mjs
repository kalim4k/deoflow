/**
 * Configuration lint-staged — en fichier plutôt que dans `package.json`, parce
 * qu'elle a besoin de fonctions.
 *
 * Le problème qu'elle résout : lint-staged ajoute le chemin de CHAQUE fichier
 * indexé à la commande. Windows plafonne une ligne de commande à 8191
 * caractères — un commit de 180 fichiers dépasse largement, et le hook meurt
 * sur « La ligne de commande est trop longue ». Le commit est alors annulé,
 * sans que rien n'indique que la cause est la LONGUEUR et non le contenu.
 *
 * On découpe donc la liste en lots tenant sous la limite. Le comportement ne
 * change pas — seuls les fichiers indexés sont traités, comme avant.
 *
 * Alternative écartée : lancer `prettier --write .` sans énumérer les
 * fichiers. Ça tient en une ligne, mais ça reformate tout le dépôt à chaque
 * commit, y compris des fichiers que l'auteur n'a pas touchés — et ça les
 * laisse modifiés hors de l'index, ce qui salit le prochain `git status`.
 */

/**
 * Marge sous la limite Windows : il reste de la place pour le nom du binaire,
 * ses options, et l'enrobage `cmd.exe` que npm ajoute au passage.
 */
const MAX_ARGS_CHARS = 6000;

/** Découpe par LONGUEUR cumulée, pas par nombre de fichiers : un dossier
 *  profond peut porter des chemins deux fois plus longs qu'un autre. */
function batches(files) {
  const out = [];
  let current = [];
  let length = 0;

  for (const file of files) {
    const cost = file.length + 3; // deux guillemets + une espace
    if (current.length > 0 && length + cost > MAX_ARGS_CHARS) {
      out.push(current);
      current = [];
      length = 0;
    }
    current.push(file);
    length += cost;
  }

  if (current.length > 0) out.push(current);
  return out;
}

/** Les chemins peuvent contenir des espaces (« Images de models/ ») : on cite. */
const run = (command, files) =>
  batches(files).map((batch) => `${command} ${batch.map((f) => `"${f}"`).join(' ')}`);

export default {
  '*.{ts,tsx,js,mjs,cjs}': (files) => [
    ...run('prettier --write', files),
    ...run('eslint --fix --max-warnings=0 --no-warn-ignored', files),
  ],
  '*.{json,md,yml,yaml}': (files) => run('prettier --write', files),
};
