/**
 * Modèles de vue de la modification d'un profil (branche « edit » de profile.php) : menu du profil
 * (generate_profile_menu()) et formulaire de chaque section. Fonctions pures.
 *
 * Écarts assumés : pas de choix des formats de date et d'heure (PV les ignore à l'affichage, voir
 * viewerTimeSettings()), ni de la langue (une seule installée) ; les plugiles « UP_ » ne sont pas
 * recopiés dans la section Principal (la biographie a sa page, dans le menu).
 */

import type { BoardConfig, EditableProfile, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { TIMEZONES } from '../services/accounts.ts';
import { parseSignature } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import { canRenameUsers, isAdmin, isAnyModerator } from '../services/permissions.ts';
import { displayOptions, type ProfileSection } from '../services/profileForms.ts';
import { THEMES } from '../services/themes.ts';
import { signatureParserOptions } from './parserOptions.ts';
import { type BbcodeStatus, signatureBbcodeStatus } from './postPage.ts';

/** Pages du profil : ses sections. */
export type ProfilePage = ProfileSection;

export interface MenuItem {
	href: string;
	label: string;
	active: boolean;
}

export interface ProfileMenuView {
	sections: MenuItem[];
}

export function buildProfileMenu(viewer: Viewer, config: BoardConfig, userId: number, active: ProfilePage, lang: Lang): ProfileMenuView {
	const t = lang.profile;
	const section = (id: ProfilePage, label: string): MenuItem => ({
		href: `profile.php?section=${id}&id=${userId}`,
		label,
		active: id === active,
	});
	const sections = [
		section('essentials', t.sectionEssentials),
		section('personal', t.sectionPersonal),
		section('messaging', t.sectionMessaging),
		...(config.avatars || config.signatures ? [section('personality', t.sectionPersonality)] : []),
		section('display', t.sectionDisplay),
		section('privacy', t.sectionPrivacy),
	];
	return { sections };
}

export interface Link {
	href: string;
	label: string;
}

export interface Option<T> {
	value: T;
	label: string;
	selected: boolean;
}

export interface Checkbox {
	name: string;
	label: string;
	checked: boolean;
}

export interface EssentialsView {
	username: string;
	usernameEditable: boolean;
	/** Adresse modifiable dans le formulaire, sinon affichée avec le lien de changement. */
	email: string;
	/** Liens des modérateurs : e-mail au membre, MP et contacts (plugins/apms/profile_add4.php). */
	contactLinks: Link[];
	timezones: Option<number>[];
	dst: boolean;
	registered: string;
	registrationIp: Link | null;
	lastPost: string;
	lastVisit: string;
	/** Champ « Messages » d'un administrateur, sinon texte « Messages : N » (ou rien). */
	numPostsInput: number | null;
	postsInfo: string | null;
	searchLinks: Link[];
	/** Note de l'administrateur (modérateurs), sinon null. */
	adminNote: string | null;
}

export interface PersonalView {
	realname: string;
	/** Titre personnalisé, si le groupe peut le choisir ; null sinon. */
	title: string | null;
	location: string;
	/** Site web, si le groupe peut publier des liens ; null sinon. */
	url: string | null;
}

export interface MessagingView {
	jabber: string;
	icq: string;
	msn: string;
	aim: string;
	yahoo: string;
}

export interface PersonalityView {
	avatar: { imageUrl: string | null; links: Link[] } | null;
	signature: { value: string; maxSize: string; bbcodeStatus: BbcodeStatus; previewHtml: string | null } | null;
}

export interface DisplayView {
	styles: Option<string>[];
	checkboxes: Checkbox[];
	topicsPerPage: string;
	postsPerPage: string;
	reputation: { enabled: boolean } | null;
}

export interface PrivacyView {
	emailSettings: Option<number>[];
	subscriptions: Checkbox[];
	privateMessages: { usePm: boolean; notify: { notifyPm: boolean; notifyPmFull: boolean } | null } | null;
}

export type SectionView =
	| { section: 'essentials'; fields: EssentialsView }
	| { section: 'personal'; fields: PersonalView }
	| { section: 'messaging'; fields: MessagingView }
	| { section: 'personality'; fields: PersonalityView }
	| { section: 'display'; fields: DisplayView }
	| { section: 'privacy'; fields: PrivacyView };

export type ProfileEditView = SectionView & {
	menu: ProfileMenuView;
	heading: string;
	formAction: string;
	errors: string[];
	/** Confirmation après un enregistrement (?updated=1). */
	notice: string | null;
};

export interface ProfileEditInput {
	viewer: Viewer;
	config: BoardConfig;
	/** Profil enregistré, et valeurs du formulaire refusé à réafficher. */
	profile: EditableProfile;
	form: EditableProfile;
	section: ProfileSection;
	errors: string[];
	updated: boolean;
	avatarUrl: string | null;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

function essentials(input: ProfileEditInput): EssentialsView {
	const { viewer, config, profile, form, lang } = input;
	const t = lang.profile;
	const moderator = isAnyModerator(viewer);
	const time = viewerTimeSettings(viewer);
	const date = (timestamp: number | null, dateOnly = false): string => formatTime(timestamp, time, input.dateWords, input.now, dateOnly);

	const contactLinks: Link[] = [];
	if (moderator) {
		contactLinks.push({ href: `misc.php?email=${profile.id}`, label: t.sendEmail });
		if (profile.acceptsPrivateMessages)
			contactLinks.push(
				{ href: `pms_send.php?uid=${profile.id}`, label: t.quickMessage },
				{ href: `pms_contacts.php?add=${profile.id}`, label: t.addToContacts },
			);
	}

	const searchLinks: Link[] = [];
	if (viewer.group.canSearch || isAdmin(viewer)) {
		searchLinks.push(
			{ href: `search.php?action=show_user_topics&user_id=${profile.id}`, label: t.showTopics },
			{ href: `search.php?action=show_user_posts&user_id=${profile.id}`, label: t.showPosts },
		);
		if (config.topicSubscriptions)
			searchLinks.push({ href: `search.php?action=show_subscriptions&user_id=${profile.id}`, label: t.showSubscriptions });
	}

	return {
		username: form.username,
		usernameEditable: moderator && canRenameUsers(viewer),
		email: form.email,
		contactLinks,
		timezones: TIMEZONES.map((value) => ({
			value,
			label: lang.account.timezones[String(value)] ?? String(value),
			selected: value === form.timezone,
		})),
		dst: form.dst,
		registered: date(profile.registered, true),
		registrationIp: moderator ? { href: `moderate.php?get_host=${profile.registrationIp}`, label: profile.registrationIp } : null,
		lastPost: date(profile.lastPost),
		lastVisit: date(profile.lastVisit),
		numPostsInput: isAdmin(viewer) ? form.numPosts : null,
		postsInfo: !isAdmin(viewer) && (config.showPostCount || moderator) ? t.postsInfo(forumNumberFormat(profile.numPosts)) : null,
		searchLinks,
		adminNote: moderator ? form.adminNote : null,
	};
}

function personal(input: ProfileEditInput): PersonalView {
	const { viewer, form } = input;
	return {
		realname: form.realname,
		title: viewer.group.canSetTitle || isAdmin(viewer) ? form.title : null,
		location: form.location,
		url: viewer.group.canPostLinks ? form.url : null,
	};
}

function personality(input: ProfileEditInput): PersonalityView {
	const { viewer, config, profile, form, lang } = input;
	const t = lang.profile;
	const avatarLinks: Link[] =
		input.avatarUrl !== null
			? [
					{ href: `profile.php?action=upload_avatar&id=${profile.id}`, label: t.changeAvatar },
					{ href: `profile.php?action=delete_avatar&id=${profile.id}`, label: t.deleteAvatar },
				]
			: [{ href: `profile.php?action=upload_avatar&id=${profile.id}`, label: t.uploadAvatar }];

	return {
		avatar: config.avatars ? { imageUrl: input.avatarUrl, links: avatarLinks } : null,
		signature: config.signatures
			? {
					value: form.signature,
					maxSize: t.sigMaxSize(forumNumberFormat(config.signatureMaxLength), config.signatureMaxLines),
					bbcodeStatus: signatureBbcodeStatus(config, viewer, lang),
					// Aperçu de la signature enregistrée, comme le PHP (pas de celle en cours de saisie).
					previewHtml:
						profile.signature !== '' ? parseSignature(profile.signature, signatureParserOptions(config, viewer, lang, input.censor)) : null,
				}
			: null,
	};
}

function display(input: ProfileEditInput): DisplayView {
	const { config, form, lang } = input;
	const t = lang.profile;
	const options = displayOptions(config);
	const boxes: [boolean, Checkbox][] = [
		[options.smilies, { name: 'show_smilies', label: t.showSmilies, checked: form.showSmilies }],
		[options.signatures, { name: 'show_sig', label: t.showSigs, checked: form.showSignatures }],
		[options.avatars, { name: 'show_avatars', label: t.showAvatars, checked: form.showAvatars }],
		[options.images, { name: 'show_img', label: t.showImages, checked: form.showImages }],
		[options.signatureImages, { name: 'show_img_sig', label: t.showImagesSigs, checked: form.showSignatureImages }],
	];
	return {
		// Thème du membre, ou celui du forum s'il n'existe plus (resolveTheme()).
		// forum_list_styles() : natcasesort(), ordre alphabétique sans tenir compte de la casse.
		styles: THEMES.toSorted((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })).map((theme) => ({
			value: theme,
			label: theme,
			selected: theme === ((THEMES as readonly string[]).includes(form.style) ? form.style : config.defaultStyle),
		})),
		checkboxes: boxes.filter(([shown]) => shown).map(([, box]) => box),
		topicsPerPage: form.topicsPerPage !== null ? String(form.topicsPerPage) : '',
		postsPerPage: form.postsPerPage !== null ? String(form.postsPerPage) : '',
		reputation: options.reputation ? { enabled: form.reputationEnabled } : null,
	};
}

function privacy(input: ProfileEditInput): PrivacyView {
	const { viewer, config, form, lang } = input;
	const t = lang.profile;
	const subscriptions: Checkbox[] = [];
	if (config.forumSubscriptions || config.topicSubscriptions)
		subscriptions.push({ name: 'notify_with_post', label: t.notifyFull, checked: form.notifyWithPost });
	if (config.topicSubscriptions) subscriptions.push({ name: 'auto_notify', label: t.autoNotifyFull, checked: form.autoNotify });

	// plugins/apms/profile_add5.php : bloc affiché selon le groupe du lecteur, comme le PHP.
	const privateMessages =
		config.privateMessagesEnabled && viewer.group.canUsePrivateMessages
			? {
					usePm: form.usesPrivateMessages,
					notify: config.privateMessageNotification
						? { notifyPm: form.notifyPrivateMessages, notifyPmFull: form.notifyPrivateMessagesFull }
						: null,
				}
			: null;

	return {
		emailSettings: t.emailSettings.map((label, value) => ({ value, label, selected: value === form.emailSetting })),
		subscriptions,
		privateMessages,
	};
}

function sectionView(input: ProfileEditInput): SectionView {
	switch (input.section) {
		case 'essentials':
			return { section: 'essentials', fields: essentials(input) };
		case 'personal':
			return { section: 'personal', fields: personal(input) };
		case 'messaging': {
			const { jabber, icq, msn, aim, yahoo } = input.form;
			return { section: 'messaging', fields: { jabber, icq, msn, aim, yahoo } };
		}
		case 'personality':
			return { section: 'personality', fields: personality(input) };
		case 'display':
			return { section: 'display', fields: display(input) };
		case 'privacy':
			return { section: 'privacy', fields: privacy(input) };
	}
}

/** Libellé d'une section, pour le titre de la page et l'en-tête du formulaire. */
export function sectionTitle(section: ProfileSection, lang: Lang): string {
	const t = lang.profile;
	const titles: Record<ProfileSection, string> = {
		essentials: t.sectionEssentials,
		personal: t.sectionPersonal,
		messaging: t.sectionMessaging,
		personality: t.sectionPersonality,
		display: t.sectionDisplay,
		privacy: t.sectionPrivacy,
	};
	return titles[section];
}

export function buildProfileEditPage(input: ProfileEditInput): ProfileEditView {
	const { viewer, config, profile, section, lang } = input;
	return {
		...sectionView(input),
		menu: buildProfileMenu(viewer, config, profile.id, section, lang),
		heading: lang.profile.sectionHeading(profile.username, sectionTitle(section, lang)),
		formAction: `profile.php?section=${section}&id=${profile.id}`,
		errors: input.errors,
		notice: input.updated && input.errors.length === 0 ? lang.profile.updated : null,
	};
}
