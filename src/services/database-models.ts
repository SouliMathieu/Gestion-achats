export type DataRow = Record<string, any>;
export type AliasPair = readonly [canonical: string, legacy: string];

export const ARTICLE_ALIASES = [
  ['fournisseurId', 'fournisseur_id'],
  ['dateCreation', 'date_creation'],
  ['dateModification', 'date_modification']
] as const satisfies readonly AliasPair[];

export const FOURNISSEUR_ALIASES = [
  ['reseauxSociaux', 'reseaux_sociaux'],
  ['articlesPrincipaux', 'articles_principaux'],
  ['dateCreation', 'date_creation'],
  ['dateModification', 'date_modification']
] as const satisfies readonly AliasPair[];

export const TRANSPORT_ALIASES = [
  ['villeDepart', 'ville_depart'],
  ['paysDepart', 'pays_depart'],
  ['villeArrivee', 'ville_arrivee'],
  ['paysArrivee', 'pays_arrivee'],
  ['dureeTrajet', 'duree_trajet'],
  ['modeTarification', 'mode_tarification'],
  ['grilleTarifaire', 'grille_tarifaire'],
  ['dateCreation', 'date_creation'],
  ['dateModification', 'date_modification']
] as const satisfies readonly AliasPair[];

export const COMMANDE_ALIASES = [
  ['dateCommande', 'date_commande'],
  ['fournisseurId', 'fournisseur_id'],
  ['transportId', 'transport_id'],
  ['coutTransport', 'cout_transport'],
  ['coutTotal', 'cout_total'],
  ['modePaiement', 'mode_paiement'],
  ['dateCreation', 'date_creation'],
  ['dateModification', 'date_modification']
] as const satisfies readonly AliasPair[];

export const COMMANDE_LIGNE_ALIASES = [
  ['commandeId', 'commande_id'],
  ['articleId', 'article_id'],
  ['prixUnitaire', 'prix_unitaire']
] as const satisfies readonly AliasPair[];

export interface SqlUpdateField {
  key: string;
  column: string;
  legacy?: string;
  transform?: (value: any) => any;
}

const hasOwn = (record: DataRow, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

/**
 * Le champ canonique prévaut lorsqu'il existe, même s'il vaut null ou zéro.
 * Cela évite de remplacer une valeur explicite par un ancien alias.
 */
export function getAliasValue(record: DataRow, canonical: string, legacy?: string): any {
  if (hasOwn(record, canonical)) return record[canonical];
  if (legacy && hasOwn(record, legacy)) return record[legacy];
  return undefined;
}

export function hasAliasValue(record: DataRow, canonical: string, legacy?: string): boolean {
  return getAliasValue(record, canonical, legacy) !== undefined;
}

function normalizeAliases<T extends DataRow>(value: unknown, aliases: readonly AliasPair[]): T {
  const record: DataRow = value && typeof value === 'object' && !Array.isArray(value) ? value as DataRow : {};
  const normalized: DataRow = { ...record };

  for (const [canonical, legacy] of aliases) {
    if (hasOwn(record, canonical) || hasOwn(record, legacy)) {
      normalized[canonical] = getAliasValue(record, canonical, legacy);
    }
    delete normalized[legacy];
  }

  return normalized as T;
}

export function serializePhotos(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(photo => typeof photo === 'string')) {
    return value.join('|||');
  }
  throw new TypeError('Format de photos non reconnu ; aucune conversion implicite ne sera effectuée.');
}

export function normalizeArticle<T extends DataRow = DataRow>(value: unknown): T {
  const normalized = normalizeAliases<T>(value, ARTICLE_ALIASES);
  if (Array.isArray(normalized.photos)) normalized.photos = serializePhotos(normalized.photos);
  return normalized;
}

export function normalizeFournisseur<T extends DataRow = DataRow>(value: unknown): T {
  return normalizeAliases<T>(value, FOURNISSEUR_ALIASES);
}

export function normalizeTransport<T extends DataRow = DataRow>(value: unknown): T {
  return normalizeAliases<T>(value, TRANSPORT_ALIASES);
}

export function normalizeCommandeLine<T extends DataRow = DataRow>(value: unknown): T {
  return normalizeAliases<T>(value, COMMANDE_LIGNE_ALIASES);
}

export function normalizeCommande<T extends DataRow = DataRow>(value: unknown): T {
  const normalized = normalizeAliases<T>(value, COMMANDE_ALIASES);
  if (Array.isArray(normalized.lignes)) {
    normalized.lignes = normalized.lignes.map((line: unknown) => normalizeCommandeLine(line));
  }
  return normalized;
}

/**
 * Convertit uniquement les alias présents. Les champs absents ou undefined
 * ne deviennent pas des valeurs nulles : ils ne doivent pas effacer l'existant.
 */
export function normalizePatch(value: DataRow, aliases: readonly AliasPair[]): DataRow {
  const patch: DataRow = { ...value };

  for (const [canonical, legacy] of aliases) {
    if (hasOwn(value, canonical)) {
      if (value[canonical] === undefined) delete patch[canonical];
      else patch[canonical] = value[canonical];
    } else if (hasOwn(value, legacy)) {
      if (value[legacy] === undefined) delete patch[canonical];
      else patch[canonical] = value[legacy];
    }
    delete patch[legacy];
  }

  return patch;
}

/**
 * Mise à jour Web/Electron non destructive : les champs inconnus et historiques
 * sont conservés. Si l'ancien enregistrement utilisait aussi un alias SQL,
 * celui-ci est actualisé pour éviter deux valeurs contradictoires.
 */
export function mergeWebRecord(
  current: DataRow,
  patchValue: DataRow,
  aliases: readonly AliasPair[],
  id: string,
  modifiedAt = new Date().toISOString()
): DataRow {
  const patch = normalizePatch(patchValue, aliases);
  if (hasOwn(patch, 'photos')) patch.photos = serializePhotos(patch.photos);

  const merged: DataRow = { ...current, ...patch, id };

  for (const [canonical, legacy] of aliases) {
    if (hasOwn(current, legacy) && hasOwn(patch, canonical)) {
      merged[legacy] = patch[canonical];
    }
  }

  merged.dateModification = modifiedAt;
  if (hasOwn(current, 'date_modification')) merged.date_modification = modifiedAt;

  return merged;
}

/**
 * Construit un UPDATE à partir d'une liste de colonnes contrôlée par le code.
 * Les propriétés absentes sont ignorées ; null et zéro sont conservés.
 */
export function buildSqlUpdate(
  record: DataRow,
  fields: readonly SqlUpdateField[],
  modifiedAt: string
): { assignments: string[]; values: any[] } {
  const assignments: string[] = [];
  const values: any[] = [];

  for (const field of fields) {
    const value = getAliasValue(record, field.key, field.legacy);
    if (value === undefined) continue;

    assignments.push(field.column + '=?');
    values.push(field.transform ? field.transform(value) : value);
  }

  assignments.push('date_modification=?');
  values.push(modifiedAt);

  return { assignments, values };
}
