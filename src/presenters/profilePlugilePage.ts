/**
 * Modèles de vue des plugiles du profil, propres à PV : « Ma biographie » (UP_Ma_biographie),
 * « Suivile » (UPP_Suivile, abonnements aux discussions) et « Mes uploads » (UPP_Mes_uploads).
 * Fonctions pures.
 */

import type { BoardConfig, SubscribedTopic, TopicLabel, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import type { DateWords } from '../services/dateFormat.ts';
import { MOBILE_PREFIX } from '../services/imageVariants.ts';
import { fileSize } from '../services/numberFormat.ts';
import { isListedUpload, type UploadLimits, usedPercent } from '../services/uploads.ts';
import { buildTopicRow, type TopicRowView } from './forumPage.ts';
import { messageParserOptions } from './parserOptions.ts';
import { type BbcodeStatus, bbcodeStatus } from './postPage.ts';
import { buildProfileMenu, type ProfileMenuView } from './profileEditPage.ts';

interface PlugilePage {
	menu: ProfileMenuView;
	heading: string;
	formAction: string;
	errors: string[];
	notice: string | null;
}

interface CommonInput {
	viewer: Viewer;
	config: BoardConfig;
	userId: number;
	lang: Lang;
	errors: string[];
	notice: string | null;
}

// ——— Ma biographie ———

export interface BiographyPageView extends PlugilePage {
	biography: string;
	bbcodeStatus: BbcodeStatus;
	/** Biographie enregistrée, rendue (parse_message()) ; null si elle est vide. */
	currentHtml: string | null;
}

export function buildBiographyPage(input: CommonInput & { saved: string; biography: string; censor: Censor | null }): BiographyPageView {
	const { viewer, config, lang } = input;
	return {
		menu: buildProfileMenu(viewer, config, input.userId, 'biography', lang),
		heading: lang.profile.myBiography,
		formAction: `profile.php?plugin=UP_Ma_biographie.php&id=${input.userId}`,
		errors: input.errors,
		notice: input.notice,
		biography: input.biography,
		bbcodeStatus: bbcodeStatus(config, viewer, lang),
		// hide_smilies = !o_smilies, comme le plugile.
		currentHtml:
			input.saved !== '' ? parseMessage(input.saved, messageParserOptions(config, viewer, lang, input.censor, !config.smilies)) : null,
	};
}

// ——— Suivile ———

export interface SubscriptionsPageView extends PlugilePage {
	/** Lignes de sujet, avec le libellé de leur case à cocher pour les lecteurs d'écran. */
	topics: (TopicRowView & { selectLabel: string })[];
}

export function buildSubscriptionsPage(
	input: CommonInput & {
		topics: readonly SubscribedTopic[];
		topicLabels: ReadonlyMap<number, readonly TopicLabel[]>;
		labelDefinitions: readonly TopicLabel[];
		censor: Censor | null;
		dateWords: DateWords;
		now: number;
	},
): SubscriptionsPageView {
	const { viewer, config, lang } = input;
	// Nouveaux messages d'après la seule dernière visite, comme le plugile (sans le cookie de suivi).
	const context = {
		viewer,
		config,
		tracked: { topics: new Map(), forums: new Map() },
		censor: input.censor,
		labelDefinitions: input.labelDefinitions,
		dateWords: input.dateWords,
		now: input.now,
	};
	return {
		menu: buildProfileMenu(viewer, config, input.userId, 'subscriptions', lang),
		heading: lang.profile.subscriptionsManager,
		formAction: `profile.php?plugin=UPP_Suivile.php&id=${input.userId}`,
		errors: input.errors,
		notice: input.notice,
		topics: input.topics.map((topic) => {
			const row = buildTopicRow(topic, topic.forumId, input.topicLabels.get(topic.id) ?? [], context);
			return { ...row, selectLabel: lang.profile.selectTopic(row.subjectText) };
		}),
	};
}

// ——— Mes uploads ———

export interface UploadFileView {
	/** Nom complet, envoyé par la case de suppression. */
	value: string;
	name: string;
	extension: string;
	size: string;
	href: string;
	thumbnailUrl: string | null;
}

export interface UploadsPageView extends PlugilePage {
	/** Texte des limites (taille et types), ou null si aucune extension n'est permise. */
	limits: string | null;
	/** Jauge de l'espace occupé ; null pour un administrateur (espace illimité). */
	usage: { percent: number; text: string } | null;
	folder: string;
	/** null : le dossier n'existe pas encore (aucun envoi). */
	files: UploadFileView[] | null;
}

export interface StoredUpload {
	name: string;
	size: number;
	modified: number;
	href: string;
}

/** Extensions affichées et insérées comme image ([img]) ; les autres fichiers le sont comme lien. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

/**
 * Fichiers listés (ni cachés, ni variantes), les plus récents d'abord (krsort() du PHP). Aperçu :
 * la variante mobile (WebP 640 px) si elle existe, sinon l'image elle-même réduite.
 */
function uploadFiles(files: readonly StoredUpload[] | null, config: BoardConfig): UploadFileView[] | null {
	if (files === null) return null;
	const settings = config.uploads;
	const byName = new Map(files.map((file) => [file.name, file]));
	return files
		.filter((file) => isListedUpload(file.name, settings))
		.toSorted((a, b) => b.modified - a.modified || (a.name < b.name ? 1 : -1))
		.map((file) => {
			const dot = file.name.lastIndexOf('.');
			const thumbnail = byName.get(`${MOBILE_PREFIX}${file.name}`);
			return {
				value: file.name,
				name: file.name.slice(0, dot),
				extension: file.name.slice(dot + 1),
				size: fileSize(file.size),
				href: file.href,
				thumbnailUrl: thumbnail?.href ?? (IMAGE_EXTENSIONS.has(file.name.slice(dot + 1).toLowerCase()) ? file.href : null),
			};
		});
}

/** Limites d'envoi et jauge d'espace, communes au plugile et au gestionnaire. */
function uploadSummary(config: BoardConfig, lang: Lang, limits: UploadLimits, usedBytes: number) {
	const t = lang.profile;
	const extensions = config.uploads.extensions.join(', ');
	return {
		limits:
			config.uploads.extensions.length === 0
				? null
				: limits.unlimited
					? t.uploadLimitsAdmin(extensions)
					: t.uploadLimits(fileSize(limits.maxFileSize), extensions),
		usage: limits.unlimited
			? null
			: { percent: usedPercent(usedBytes, limits.quota), text: t.usedSpaceOf(fileSize(usedBytes), fileSize(limits.quota)) },
	};
}

export function buildUploadsPage(
	input: CommonInput & { files: readonly StoredUpload[] | null; limits: UploadLimits; usedBytes: number },
): UploadsPageView {
	const { viewer, config, lang } = input;
	return {
		menu: buildProfileMenu(viewer, config, input.userId, 'uploads', lang),
		heading: lang.profile.uploadsPlugile,
		formAction: `profile.php?plugin=UPP_Mes_uploads.php&id=${input.userId}`,
		errors: input.errors,
		notice: input.notice,
		...uploadSummary(config, lang, input.limits, input.usedBytes),
		folder: `img/members/${input.userId}`,
		files: uploadFiles(input.files, config),
	};
}

// ——— Gestionnaire de fichiers (gestionnaire.php) ———

export interface ManagedFileView extends UploadFileView {
	/** Adresse permanente du fichier (o_base_url), à copier ou insérer dans un message. */
	publicUrl: string;
	/** BBCode inséré dans le message en cours de rédaction. */
	insertCode: string;
}

export interface FileManagerView {
	formAction: string;
	errors: string[];
	notice: string | null;
	limits: string | null;
	usage: { percent: number; text: string } | null;
	files: ManagedFileView[] | null;
}

export function buildFileManager(input: {
	viewer: Viewer;
	config: BoardConfig;
	lang: Lang;
	files: readonly StoredUpload[] | null;
	limits: UploadLimits;
	usedBytes: number;
	errors: string[];
	notice: string | null;
}): FileManagerView {
	const { viewer, config, lang } = input;
	return {
		formAction: 'gestionnaire.php',
		errors: input.errors,
		notice: input.notice,
		...uploadSummary(config, lang, input.limits, input.usedBytes),
		files:
			uploadFiles(input.files, config)?.map((file) => {
				const publicUrl = `${config.baseUrl}/img/members/${viewer.id}/${encodeURIComponent(file.value)}`;
				return {
					...file,
					publicUrl,
					insertCode: IMAGE_EXTENSIONS.has(file.extension.toLowerCase())
						? `[img]${publicUrl}[/img]`
						: `[url=${publicUrl}]${file.name}[/url]`,
				};
			}) ?? null,
	};
}
