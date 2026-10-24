/**
 * Modèle de vue de post.php : formulaire de réponse ou de nouvelle discussion, erreurs,
 * prévisualisation et rappel des derniers messages du sujet. Fonction pure.
 */

import type { BoardConfig, PostingTarget, ReviewPost, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { SMILIES } from '../services/smilies.ts';
import { type ToolbarSettings, toolbarButtons } from '../services/toolbar.ts';
import { type Crumb, crumbs } from './navigation.ts';
import { messageParserOptions } from './parserOptions.ts';

/** État du formulaire : saisie précédente, ou valeurs initiales. */
export interface PostFormState {
	subject: string;
	message: string;
	username: string;
	email: string;
	hideSmilies: boolean;
	subscribe: boolean;
	stickTopic: boolean;
}

export interface PostPageInput {
	viewer: Viewer;
	config: BoardConfig;
	target: PostingTarget;
	/** Modérateur du forum : peut épingler la nouvelle discussion. */
	isForumModerator: boolean;
	form: PostFormState;
	errors: readonly string[];
	/** Message pré-traité à prévisualiser, ou null. */
	preview: string | null;
	review: readonly ReviewPost[];
	toolbar: ToolbarSettings;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

export interface Checkbox {
	name: 'stick_topic' | 'hide_smilies' | 'subscribe';
	label: string;
	checked: boolean;
}

export interface PostPageView {
	crumbs: Crumb[];
	heading: string;
	formAction: string;
	isNewTopic: boolean;
	/** Champs d'un invité : pseudo et e-mail (obligatoire avec p_force_guest_email). */
	guest: { emailField: 'req_email' | 'email'; emailRequired: boolean } | null;
	form: PostFormState;
	errors: readonly string[];
	/** HTML de parseMessage() (échappé par construction). */
	previewHtml: string | null;
	/** Préfixes de sujet proposés par PV (simulateur, autre), insérés par JavaScript. */
	subjectPrefixes: { simulators: string[]; other: string[] } | null;
	bbcodeStatus: BbcodeStatus;
	toolbar: ToolbarView | null;
	checkboxes: Checkbox[];
	review: { poster: string; postedAt: string; messageHtml: string }[];
}

const SIMULATOR_PREFIXES = ['MSFS', 'FSX', 'X-Plane', 'Flight', 'P3D', 'MULTI-SIMU'];
const OTHER_PREFIXES = ['Résolu', 'Réel', 'Video'];

function checkboxes(input: PostPageInput, isNewTopic: boolean): Checkbox[] {
	const { viewer, config, form, lang, target } = input;
	const t = lang.post;
	const boxes: Checkbox[] = [];
	if (isNewTopic && input.isForumModerator) boxes.push({ name: 'stick_topic', label: t.stickTopic, checked: form.stickTopic });
	if (config.smilies) boxes.push({ name: 'hide_smilies', label: t.hideSmilies, checked: form.hideSmilies });
	if (!viewer.isGuest && config.topicSubscriptions)
		boxes.push({ name: 'subscribe', label: target.topic?.isSubscribed === true ? t.staySubscribed : t.subscribe, checked: form.subscribe });
	return boxes;
}

/** Barre d'outils : dossier des icônes et configuration JSON lue par public/js/toolbar.js. */
export interface ToolbarView {
	imageDir: string;
	config: string;
}

/** Une seule entrée par émoji (le PHP retirait les images en double). */
const TOOLBAR_SMILIES = SMILIES.filter((smiley, i) => SMILIES.findIndex((other) => other.emoji === smiley.emoji) === i).map(
	({ code, emoji, name }) => ({ code, emoji, name }),
);

export function toolbarView(settings: ToolbarSettings, form: 'form' | 'quickform', config: BoardConfig, lang: Lang): ToolbarView | null {
	const toolbar = toolbarButtons(settings, form, { bbcode: config.bbcode, imgTag: config.imgTag, smilies: config.smilies }, lang.toolbar);
	if (toolbar === null) return null;
	return {
		imageDir: toolbar.imageDir,
		config: JSON.stringify({ label: lang.toolbar.label, buttons: toolbar.buttons, smilies: TOOLBAR_SMILIES }),
	};
}

export type BbcodeStatus = { label: string; href: string; on: boolean }[];

/** Ce qui est permis dans le message (liens d'aide sous la zone de saisie). */
export function bbcodeStatus(config: BoardConfig, viewer: Viewer, lang: Lang): BbcodeStatus {
	const t = lang.post;
	return [
		{ label: t.bbcode, href: 'help.php#bbcode', on: config.bbcode },
		{ label: t.urlTag, href: 'help.php#url', on: config.bbcode && viewer.group.canPostLinks },
		{ label: t.imgTag, href: 'help.php#img', on: config.bbcode && config.imgTag },
		{ label: t.smilies, href: 'help.php#smilies', on: config.smilies },
	];
}

export function buildPostPage(input: PostPageInput): PostPageView {
	const { viewer, config, target, lang, censor } = input;
	const t = lang.post;
	const topic = target.topic;
	const isNewTopic = topic === null;
	const heading = isNewTopic ? t.postNewTopic : t.postReply;
	const formAction = isNewTopic ? `post.php?action=post&fid=${target.forum.id}` : `post.php?action=post&tid=${topic.id}`;
	const time = viewerTimeSettings(viewer);

	const path = [
		{ label: lang.common.index, href: 'index.php' },
		{ label: target.forum.name, href: `viewforum.php?id=${target.forum.id}` },
		...(topic !== null ? [{ label: censor !== null ? censor(topic.subject) : topic.subject, href: `viewtopic.php?id=${topic.id}` }] : []),
		{ label: heading, href: isNewTopic ? `post.php?fid=${target.forum.id}` : `post.php?tid=${topic.id}` },
	];

	return {
		crumbs: crumbs(...path),
		heading,
		formAction,
		isNewTopic,
		guest: viewer.isGuest
			? { emailField: config.posting.forceGuestEmail ? 'req_email' : 'email', emailRequired: config.posting.forceGuestEmail }
			: null,
		form: input.form,
		errors: input.errors,
		previewHtml:
			input.preview !== null
				? parseMessage(input.preview, messageParserOptions(config, viewer, lang, censor, input.form.hideSmilies))
				: null,
		subjectPrefixes: isNewTopic ? { simulators: SIMULATOR_PREFIXES, other: OTHER_PREFIXES } : null,
		bbcodeStatus: bbcodeStatus(config, viewer, lang),
		toolbar: toolbarView(input.toolbar, 'form', config, lang),
		checkboxes: checkboxes(input, isNewTopic),
		review: input.review.map((post) => ({
			poster: post.poster,
			postedAt: formatTime(post.posted, time, input.dateWords, input.now),
			messageHtml: parseMessage(post.message, messageParserOptions(config, viewer, lang, censor, post.hideSmilies)),
		})),
	};
}
