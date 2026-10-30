/**
 * Modèle de vue de post.php : formulaire de réponse ou de nouvelle discussion, erreurs,
 * prévisualisation et rappel des derniers messages du sujet. Fonction pure.
 */

import type { BoardConfig, EditablePost, PostingTarget, ReviewPost, SubjectTag, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumPath, publicPath } from '../services/routes.ts';
import { SMILIES } from '../services/smilies.ts';
import { type TagColors, tagColors } from '../services/subjectTags.ts';
import { type ToolbarSettings, toolbarButtons } from '../services/toolbar.ts';
import { type Crumb, crumbs } from './navigation.ts';
import { messageParserOptions } from './parserOptions.ts';

/** État du formulaire : saisie précédente, ou valeurs initiales. */
/** Balise de sujet proposée (bouton du formulaire), avec ses couleurs de pastille. */
export interface SubjectTagView {
	name: string;
	colors: TagColors;
}

export function subjectTagChoices(tags: readonly SubjectTag[]): { projects: SubjectTagView[]; other: SubjectTagView[] } {
	const view = (tag: SubjectTag): SubjectTagView => ({ name: tag.name, colors: tagColors(tag) });
	return {
		projects: tags.filter((tag) => tag.group === 'project').map(view),
		other: tags.filter((tag) => tag.group === 'other').map(view),
	};
}

export interface PostFormState {
	subject: string;
	message: string;
	username: string;
	email: string;
	hideSmilies: boolean;
	subscribe: boolean;
	stickTopic: boolean;
	/** Case « Enregistrer comme brouillon » (membres). */
	draft: boolean;
	/** Brouillon repris (post.php?brouillon) : supprimé une fois le message publié. */
	draftId: number | null;
	/** Nouvelle discussion sans balise de projet : avertissement, le prochain envoi publie. */
	tagWarning?: boolean;
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
	name: 'stick_topic' | 'hide_smilies' | 'subscribe' | 'silent' | 'brouillon';
	label: string;
	checked: boolean;
}

export interface PostPageView {
	crumbs: Crumb[];
	heading: string;
	formAction: string;
	/** Légende du formulaire (rédaction ou modification). */
	legend: string;
	/** Champ « Sujet » : nouvelle discussion, ou modification du premier message. */
	showSubject: boolean;
	/** Champs d'un invité : pseudo et e-mail (obligatoire avec p_force_guest_email). */
	guest: { emailField: 'req_email' | 'email'; emailRequired: boolean } | null;
	form: PostFormState;
	errors: readonly string[];
	/** HTML de parseMessage() (échappé par construction). */
	previewHtml: string | null;
	/** Préfixes de sujet proposés (projet, autre), insérés par JavaScript. */
	subjectPrefixes: { projects: SubjectTagView[]; other: SubjectTagView[] } | null;
	bbcodeStatus: BbcodeStatus;
	toolbar: ToolbarView | null;
	checkboxes: Checkbox[];
	/** Lien vers les brouillons du membre (draft_list.php), à côté de la case « brouillon ». */
	draftsUrl: string | null;
	review: { poster: string; postedAt: string; messageHtml: string }[];
}

function checkboxes(input: PostPageInput, isNewTopic: boolean): Checkbox[] {
	const { viewer, config, form, lang, target } = input;
	const t = lang.post;
	const boxes: Checkbox[] = [];
	if (isNewTopic && input.isForumModerator) boxes.push({ name: 'stick_topic', label: t.stickTopic, checked: form.stickTopic });
	if (config.smilies) boxes.push({ name: 'hide_smilies', label: t.hideSmilies, checked: form.hideSmilies });
	if (!viewer.isGuest && config.topicSubscriptions)
		boxes.push({ name: 'subscribe', label: target.topic?.isSubscribed === true ? t.staySubscribed : t.subscribe, checked: form.subscribe });
	if (!viewer.isGuest) boxes.push({ name: 'brouillon', label: t.saveAsDraft, checked: form.draft });
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

/**
 * Barre d'outils du message. `member` : le bouton image propose aussi la galerie (choisir une image
 * ou en envoyer une nouvelle, gallery.php?info=pick), réservée aux membres.
 */
export function toolbarView(
	settings: ToolbarSettings,
	form: 'form' | 'quickform',
	config: BoardConfig,
	lang: Lang,
	member = false,
): ToolbarView | null {
	const toolbar = toolbarButtons(settings, form, { bbcode: config.bbcode, imgTag: config.imgTag, smilies: config.smilies }, lang.toolbar);
	if (toolbar === null) return null;
	const imageChooser = member
		? {
				...lang.toolbar.imageChooser,
				// Popin (iframe) ; la fenêtre séparée ne sert que sans <dialog>. Adresses absolues : lues
				// par js/toolbar.js, elles doivent être justes depuis n'importe quelle page.
				galleryUrl: publicPath('gallery.php?info=pick&embed=1'),
				uploadUrl: publicPath('gallery.php?info=pick&embed=1#gallery-upload'),
				windowUrl: publicPath('gallery.php?info=pick'),
			}
		: null;
	return {
		imageDir: toolbar.imageDir,
		config: JSON.stringify({ label: lang.toolbar.label, buttons: toolbar.buttons, smilies: TOOLBAR_SMILIES, imageChooser }),
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

/** Ce qui est permis dans une signature (section « Personnalité » du profil : p_sig_*, o_smilies_sig). */
export function signatureBbcodeStatus(config: BoardConfig, viewer: Viewer, lang: Lang): BbcodeStatus {
	const t = lang.post;
	return [
		{ label: t.bbcode, href: 'help.php#bbcode', on: config.signatureBbcode },
		{ label: t.urlTag, href: 'help.php#url', on: config.signatureBbcode && viewer.group.canPostLinks },
		{ label: t.imgTag, href: 'help.php#img', on: config.signatureBbcode && config.signatureImgTag },
		{ label: t.smilies, href: 'help.php#smilies', on: config.signatureSmilies },
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
		{ label: target.forum.name, href: forumPath(target.forum.id, target.forum.name) },
		...(topic !== null ? [{ label: censor !== null ? censor(topic.subject) : topic.subject, href: `viewtopic.php?id=${topic.id}` }] : []),
		{ label: heading, href: isNewTopic ? `post.php?fid=${target.forum.id}` : `post.php?tid=${topic.id}` },
	];

	return {
		crumbs: crumbs(...path),
		heading,
		formAction,
		legend: t.writeMessageLegend,
		showSubject: isNewTopic,
		guest: viewer.isGuest
			? { emailField: config.posting.forceGuestEmail ? 'req_email' : 'email', emailRequired: config.posting.forceGuestEmail }
			: null,
		form: input.form,
		errors: input.errors,
		previewHtml:
			input.preview !== null
				? parseMessage(input.preview, messageParserOptions(config, viewer, lang, censor, input.form.hideSmilies))
				: null,
		subjectPrefixes: isNewTopic ? subjectTagChoices(config.subjectTags) : null,
		bbcodeStatus: bbcodeStatus(config, viewer, lang),
		toolbar: toolbarView(input.toolbar, 'form', config, lang, !viewer.isGuest),
		checkboxes: checkboxes(input, isNewTopic),
		draftsUrl: viewer.isGuest ? null : 'draft_list.php',
		review: input.review.map((post) => ({
			poster: post.poster,
			postedAt: formatTime(post.posted, time, input.dateWords, input.now),
			messageHtml: parseMessage(post.message, messageParserOptions(config, viewer, lang, censor, post.hideSmilies)),
		})),
	};
}

export interface EditPageInput {
	viewer: Viewer;
	config: BoardConfig;
	post: EditablePost;
	/** Modérateur du forum : épinglage et modification silencieuse. */
	isForumModerator: boolean;
	form: Omit<PostFormState, 'draft' | 'draftId'> & { silent: boolean };
	errors: readonly string[];
	preview: string | null;
	toolbar: ToolbarSettings;
	censor: Censor | null;
	lang: Lang;
}

/** Modèle de vue de edit.php, affiché par le même gabarit que post.php. */
export function buildEditPage(input: EditPageInput): PostPageView {
	const { viewer, config, post, lang, censor, form } = input;
	const t = lang.post;
	const isTopicPost = post.id === post.topic.firstPostId;
	const subject = censor !== null ? censor(post.topic.subject) : post.topic.subject;

	const checkboxes: Checkbox[] = [];
	if (isTopicPost && input.isForumModerator) checkboxes.push({ name: 'stick_topic', label: t.stickTopic, checked: form.stickTopic });
	if (config.smilies) checkboxes.push({ name: 'hide_smilies', label: t.hideSmilies, checked: form.hideSmilies });
	if (input.isForumModerator) checkboxes.push({ name: 'silent', label: t.silentEdit, checked: form.silent });

	return {
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: post.forum.name, href: forumPath(post.forum.id, post.forum.name) },
			{ label: subject, href: `viewtopic.php?id=${post.topic.id}` },
			{ label: t.editPost, href: `edit.php?id=${post.id}` },
		),
		heading: t.editPost,
		formAction: `edit.php?id=${post.id}&action=edit`,
		legend: t.editPostLegend,
		showSubject: isTopicPost,
		guest: null,
		form: { ...form, draft: false, draftId: null },
		errors: input.errors,
		previewHtml:
			input.preview !== null ? parseMessage(input.preview, messageParserOptions(config, viewer, lang, censor, form.hideSmilies)) : null,
		subjectPrefixes: isTopicPost ? subjectTagChoices(input.config.subjectTags) : null,
		bbcodeStatus: bbcodeStatus(config, viewer, lang),
		toolbar: toolbarView(input.toolbar, 'form', config, lang, !viewer.isGuest),
		checkboxes,
		draftsUrl: null,
		review: [],
	};
}
