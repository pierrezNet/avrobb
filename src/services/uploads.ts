/**
 * Règles d'Uploadile, le dépôt de fichiers des membres de PV (plugile UPP_Mes_uploads, repris par
 * gestionnaire.php) : espace alloué selon le groupe, nom de fichier, extensions, fichiers listés.
 * Fonctions pures ; l'écriture des fichiers est faite par repositories/MemberUploadFiles.ts.
 *
 * Écarts assumés, pour la sécurité du dossier public img/members/ :
 * - le nom enregistré ne garde que lettres sans accent, chiffres et tirets (parse_file() laissait
 *   passer « # », « < », « ` »…) ;
 * - les extensions exécutables ou interprétées par un navigateur (php, html, svg…) sont refusées
 *   même si l'administrateur les a permises ;
 * - pas de miniature créée à l'envoi (le PHP utilisait GD) : celles qui existent restent affichées.
 */

import { GroupId, type UploadSettings } from '../domain/models.ts';

/** Espace « illimité » des administrateurs dans le PHP (100 Go). */
const ADMIN_LIMIT = 100_000_000_000;

/** Extensions jamais acceptées dans un dossier servi par le site. */
const DANGEROUS_EXTENSIONS = new Set([
	'php',
	'php3',
	'php4',
	'php5',
	'php7',
	'php8',
	'phtml',
	'pht',
	'phps',
	'phar',
	'cgi',
	'pl',
	'py',
	'sh',
	'asp',
	'aspx',
	'jsp',
	'htaccess',
	'htm',
	'html',
	'xhtml',
	'shtml',
	'svg',
	'svgz',
	'js',
	'mjs',
	'xml',
]);

export interface UploadLimits {
	/** Espace total, en octets. */
	quota: number;
	/** Taille maximale d'un fichier, en octets. */
	maxFileSize: number;
	/** Administrateur : pas de jauge d'espace (info_3_admi). */
	unlimited: boolean;
}

/** Espace et taille par fichier selon le groupe du propriétaire (1 = admin, 2 = modérateurs). */
export function uploadLimits(groupId: number, settings: UploadSettings): UploadLimits {
	if (groupId === GroupId.Admin) return { quota: ADMIN_LIMIT, maxFileSize: ADMIN_LIMIT, unlimited: true };
	if (groupId === GroupId.Moderator)
		return { quota: settings.moderatorQuota, maxFileSize: settings.moderatorMaxFileSize, unlimited: false };
	return { quota: settings.memberQuota, maxFileSize: settings.memberMaxFileSize, unlimited: false };
}

/** Pourcentage de l'espace utilisé, arrondi au-dessus et borné à 100 (ceil() du PHP). */
export function usedPercent(used: number, quota: number): number {
	if (quota <= 0) return used > 0 ? 100 : 0;
	return Math.min(100, Math.ceil((used * 100) / quota));
}

const ACCENTS: readonly [RegExp, string][] = [
	[/[àâä]/giu, 'a'],
	[/[éèêë]/giu, 'e'],
	[/[îï]/giu, 'i'],
	[/[ôö]/giu, 'o'],
	[/[ùüû]/giu, 'u'],
	[/ÿ/giu, 'y'],
	[/ç/giu, 'c'],
];

/** parse_file() : espaces et « _@=' » en tirets, accents retirés, autres signes supprimés. */
export function cleanFileName(name: string): string {
	let cleaned = name.replace(/[_@=' ]/g, '-');
	for (const [pattern, letter] of ACCENTS) cleaned = cleaned.replace(pattern, letter);
	cleaned = cleaned.replace(/[^A-Za-z0-9-]/g, '');
	return cleaned === '' ? 'fichier' : cleaned;
}

/** Extension acceptée telle qu'écrite : en minuscules ou tout en majuscules, comme le PHP. */
function allowedExtension(extension: string, settings: UploadSettings): boolean {
	const lower = extension.toLowerCase();
	if (DANGEROUS_EXTENSIONS.has(lower) || !settings.extensions.includes(lower)) return false;
	return extension === lower || extension === lower.toUpperCase();
}

export type UploadError = 'noFile' | 'multipleDots' | 'badExtension' | 'tooLarge' | 'quotaExceeded';

/** Fichier à enregistrer : nom nettoyé, ou l'erreur dans l'ordre des contrôles du PHP. */
export function checkUpload(
	file: { name: string; size: number },
	used: number,
	limits: UploadLimits,
	settings: UploadSettings,
): { fileName: string } | { error: UploadError } {
	if (file.size === 0 || file.name === '') return { error: 'noFile' };
	// Un seul point : on refuse « photo.php.jpg » et les noms sans extension.
	const parts = file.name.split('.');
	if (parts.length !== 2) return { error: 'multipleDots' };
	const [base = '', extension = ''] = parts;
	if (!allowedExtension(extension, settings)) return { error: 'badExtension' };
	if (file.size > limits.maxFileSize) return { error: 'tooLarge' };
	if (file.size + used > limits.quota) return { error: 'quotaExceeded' };
	return { fileName: `${cleanFileName(base)}.${extension}` };
}

/** Nom pris : préfixe date('dmY-Hi')_ comme le PHP (heure du serveur, en UTC ici). */
export function datedFileName(fileName: string, now: number): string {
	const d = new Date(now * 1000);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}_${fileName}`;
}

/**
 * Fichier affiché dans la liste : extension permise (quelle que soit sa casse), ni caché (« # » en
 * tête), ni miniature (« mini_ »). Les extensions dangereuses ne sont jamais listées.
 */
export function isListedUpload(fileName: string, settings: UploadSettings): boolean {
	const dot = fileName.lastIndexOf('.');
	const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
	return (
		dot > 0 &&
		settings.extensions.includes(extension) &&
		!DANGEROUS_EXTENSIONS.has(extension) &&
		!fileName.startsWith('#') &&
		fileName.split('_')[0] !== 'mini'
	);
}

/** Nom de fichier sûr reçu d'un formulaire (case à cocher de suppression) : basename(), sans chemin. */
export function safeBaseName(name: string): string | null {
	const base = name.split(/[/\\]/).at(-1) ?? '';
	return base === '' || base === '.' || base === '..' || base.includes('\0') ? null : base;
}
