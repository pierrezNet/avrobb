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
			return { ...row, selectLabel: lang.profile.selectTopic(row.subject.map((part) => part.text).join('')) };
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

export function buildUploadsPage(
	input: CommonInput & { files: readonly StoredUpload[] | null; limits: UploadLimits; usedBytes: number },
): UploadsPageView {
	const { viewer, config, lang, limits } = input;
	const t = lang.profile;
	const settings = config.uploads;
	const extensions = settings.extensions.join(', ');
	const byName = new Map((input.files ?? []).map((file) => [file.name, file]));

	const files =
		input.files === null
			? null
			: input.files
					.filter((file) => isListedUpload(file.name, settings))
					// krsort() sur « date de modification + nom » : les plus récents d'abord.
					.toSorted((a, b) => b.modified - a.modified || (a.name < b.name ? 1 : -1))
					.map((file) => {
						const dot = file.name.lastIndexOf('.');
						const thumbnail = settings.thumbnails ? byName.get(`mini_${file.name}`) : undefined;
						return {
							value: file.name,
							name: file.name.slice(0, dot),
							extension: file.name.slice(dot + 1),
							size: fileSize(file.size),
							href: file.href,
							thumbnailUrl: thumbnail?.href ?? null,
						};
					});

	return {
		menu: buildProfileMenu(viewer, config, input.userId, 'uploads', lang),
		heading: t.uploadsPlugile,
		formAction: `profile.php?plugin=UPP_Mes_uploads.php&id=${input.userId}`,
		errors: input.errors,
		notice: input.notice,
		limits:
			settings.extensions.length === 0
				? null
				: limits.unlimited
					? t.uploadLimitsAdmin(extensions)
					: t.uploadLimits(fileSize(limits.maxFileSize), extensions),
		usage: limits.unlimited
			? null
			: { percent: usedPercent(input.usedBytes, limits.quota), text: t.usedSpaceOf(fileSize(input.usedBytes), fileSize(limits.quota)) },
		folder: `img/members/${input.userId}`,
		files,
	};
}
