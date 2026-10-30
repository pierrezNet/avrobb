/**
 * Modèle de vue de la consultation d'un profil (branche « view » de profile.php). Fonction pure.
 */

import type { BoardConfig, UserProfile, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type BbcodeOptions, parseSignature } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { safeExternalUrl } from '../services/links.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import { canSearch, canUsePrivateMessages, isAnyModerator } from '../services/permissions.ts';
import { userTitle } from '../services/userTitle.ts';

/** Ligne « intitulé : valeur » ; `links` pour les valeurs qui sont des liens. */
export interface ProfileField {
	label: string;
	text: string | null;
	links: { href: string; label: string; external: boolean }[];
	/** HTML de parseSignature() (échappé par construction). */
	html: string | null;
	imageUrl: string | null;
}

export interface ProfileSection {
	id: string;
	title: string;
	fields: ProfileField[];
}

export interface ProfilePageView {
	username: string;
	sections: ProfileSection[];
}

export interface ProfilePageInput {
	viewer: Viewer;
	config: BoardConfig;
	profile: UserProfile;
	avatarUrl: string | null;
	bannedUsernames: ReadonlySet<string>;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

const empty = { text: null, links: [], html: null, imageUrl: null };
const text = (label: string, value: string): ProfileField => ({ ...empty, label, text: value });
const links = (label: string, items: ProfileField['links']): ProfileField => ({ ...empty, label, links: items });

function parserOptions(input: ProfilePageInput, signature: boolean): BbcodeOptions {
	const { config, viewer, lang, censor } = input;
	return {
		bbcode: signature ? config.signatureBbcode : config.bbcode,
		imgTag: signature ? config.signatureImgTag : config.imgTag,
		showImages: signature ? viewer.showSignatureImages : viewer.showImages,
		// Signature : o_smilies_sig ; le reste : o_smilies.
		smilies: (signature ? config.signatureSmilies : config.smilies) && viewer.showSmilies,
		censor,
		baseUrl: config.baseUrl,
		indentSpaces: config.indentSpaces,
		labels: { wrote: lang.common.wrote, imageLink: lang.common.imageLink, spoiler: lang.common.spoiler, video: lang.common.video },
	};
}

export function buildProfilePage(input: ProfilePageInput): ProfilePageView {
	const { viewer, config, profile, lang, censor } = input;
	const t = lang.profile;
	const censored = (value: string): string => (censor !== null ? censor(value) : value);
	const time = viewerTimeSettings(viewer);
	const member = !viewer.isGuest;

	const personal: ProfileField[] = [
		text(t.username, profile.username),
		text(
			t.title,
			censored(
				userTitle(profile, input.bannedUsernames, { banned: lang.common.banned, guest: lang.common.guest, member: lang.common.member }),
			),
		),
	];
	if (profile.realname !== '') personal.push(text(t.realname, censored(profile.realname)));
	if (profile.location !== '') personal.push(text(t.location, censored(profile.location)));
	if (profile.url !== '') {
		const url = censored(profile.url);
		personal.push(links(t.website, [{ href: safeExternalUrl(url), label: url, external: true }]));
	}
	// Adresse facultative (comptes SSO) : rien à proposer sans adresse.
	if (member && viewer.group.canSendEmail && profile.email !== '') {
		if (profile.emailSetting === 0)
			personal.push(links(t.email, [{ href: `mailto:${profile.email}`, label: profile.email, external: false }]));
		else if (profile.emailSetting === 1)
			personal.push(links(t.email, [{ href: `misc.php?email=${profile.id}`, label: t.sendEmail, external: false }]));
	}
	// plugins/apms/profile_add3.php
	if (canUsePrivateMessages(viewer, config) && profile.acceptsPrivateMessages) {
		personal.push(links(t.pm, [{ href: `pms_send.php?uid=${profile.id}`, label: t.quickMessage, external: false }]));
	}

	const messaging: ProfileField[] = [
		[t.jabber, censored(profile.jabber)],
		[t.icq, profile.icq],
		[t.msn, censored(profile.msn)],
		[t.aim, censored(profile.aim)],
		[t.yahoo, censored(profile.yahoo)],
	]
		.filter(([, value]) => value !== '')
		.map(([label = '', value = '']) => text(label, value));

	const personality: ProfileField[] = [];
	if (config.avatars && input.avatarUrl !== null) personality.push({ ...empty, label: t.avatar, imageUrl: input.avatarUrl });
	if (config.signatures && profile.signature !== '')
		personality.push({ ...empty, label: t.signature, html: parseSignature(profile.signature, parserOptions(input, true)) });

	const activity: ProfileField[] = [];
	const searches: ProfileField['links'] = [];
	if (canSearch(viewer)) {
		if (profile.numPosts > 0) {
			searches.push({ href: `search.php?action=show_user_topics&user_id=${profile.id}`, label: t.showTopics, external: false });
			searches.push({ href: `search.php?action=show_user_posts&user_id=${profile.id}`, label: t.showPosts, external: false });
		}
		if (isAnyModerator(viewer) && config.topicSubscriptions)
			searches.push({ href: `search.php?action=show_subscriptions&user_id=${profile.id}`, label: t.showSubscriptions, external: false });
	}
	const postCount = config.showPostCount || isAnyModerator(viewer) ? forumNumberFormat(profile.numPosts) : null;
	if (postCount !== null || searches.length > 0) activity.push({ ...empty, label: t.posts, text: postCount, links: searches });
	if (profile.numPosts > 0) activity.push(text(t.lastPost, formatTime(profile.lastPost, time, input.dateWords, input.now)));
	activity.push(text(t.registered, formatTime(profile.registered, time, input.dateWords, input.now, true)));

	const sections: ProfileSection[] = [
		{ id: 'personal', title: t.sectionPersonal, fields: personal },
		{ id: 'messaging', title: t.sectionMessaging, fields: messaging },
		{ id: 'personality', title: t.sectionPersonality, fields: personality },
		{ id: 'activity', title: t.userActivity, fields: activity },
	];

	return {
		username: profile.username,
		sections: sections.filter((section) => section.fields.length > 0),
	};
}
