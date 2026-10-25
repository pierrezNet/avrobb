/**
 * Contrôleur des sections de modification de profile.php (Principal, Personnel, Messagerie,
 * Personnalité, Affichage, Vie privée) : formulaire, validation et enregistrement, avec les effets
 * de bord du PHP (renommage, caches PHP des membres et des bannissements).
 *
 * Écarts assumés : les erreurs réaffichent le formulaire ; l'enregistrement redirige aussitôt vers
 * la section avec un avis « Profil mis à jour » (le PHP passait par une page « Redirection… ») ;
 * le jeton CSRF remplace confirm_referrer().
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EditableProfile, ProfileChanges } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildProfileEditPage, sectionTitle } from '../presenters/profileEditPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { PhpCacheStore } from '../repositories/PhpCacheFiles.ts';
import type { AvatarLocator } from '../services/avatars.ts';
import { buildCensor, type Censor } from '../services/censor.ts';
import { canRenameUsers, isAdmin, isAnyModerator } from '../services/permissions.ts';
import {
	displayOptions,
	type FormResult,
	forbiddenTitles,
	type ProfileSection,
	readDisplay,
	readEssentials,
	readMessaging,
	readPersonal,
	readPrivacy,
	readSignature,
} from '../services/profileForms.ts';
import { normalizeUsername, usernameSkeleton } from '../services/registration.ts';
import { isProfile, loadEditableProfile, type ProfileAccessDeps, type ProfileQuery } from './profileAccess.ts';

export interface ProfileEditControllerDeps extends LayoutDeps, ProfileAccessDeps {
	bans: BanReader;
	censorship: CensorReader;
	avatars: AvatarLocator;
	phpCache: PhpCacheStore | null;
}

type EditRequest = FastifyRequest<{ Querystring: ProfileQuery; Body?: FormBody }>;

const checked = (body: FormBody | undefined, name: string): boolean => body?.[name] !== undefined;

export class ProfileEditController {
	constructor(private readonly deps: ProfileEditControllerDeps) {}

	/** Formulaire d'une section ; `section` est déjà validée par l'aiguillage de profile.php. */
	show = async (
		request: FastifyRequest<{ Querystring: ProfileQuery }>,
		reply: FastifyReply,
		section: ProfileSection,
	): Promise<FastifyReply> => {
		const profile = await loadEditableProfile(request, reply, this.deps);
		if (!isProfile(profile)) return profile;
		if (!this.sectionAvailable(request, section))
			return renderMessage(request, reply, this.deps, 404, this.deps.page.lang.common.badRequest);
		return this.renderForm(request, reply, profile, section, profile, [], request.query.updated !== undefined);
	};

	submit = async (
		request: FastifyRequest<{ Querystring: ProfileQuery; Body: FormBody }>,
		reply: FastifyReply,
		section: ProfileSection,
	): Promise<FastifyReply> => {
		const { lang } = this.deps.page;
		const profile = await loadEditableProfile(request, reply, this.deps);
		if (!isProfile(profile)) return profile;
		if (!this.sectionAvailable(request, section)) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		const { result, rename } = await this.readSection(request, profile, section);
		if (result.errors.length > 0) {
			const form: EditableProfile = { ...profile, ...result.changes, ...(rename !== null ? { username: rename } : {}) };
			const errors = result.errors.map((error) => lang.profile.profileError(error));
			return this.renderForm(request, reply, profile, section, form, errors, false);
		}

		if (rename === null) await this.deps.profileStore.updateProfile(profile.id, result.changes);
		else {
			const { bansUpdated } = await this.deps.profileStore.renameUser(profile.id, profile.username, rename, result.changes);
			// generate_users_info_cache() et, si un bannissement a suivi le pseudo, generate_bans_cache().
			await this.deps.phpCache?.invalidate('users_info');
			if (bansUpdated) await this.deps.phpCache?.invalidate('bans');
		}
		return reply.redirect(`profile.php?section=${section}&id=${profile.id}&updated=1`, 303);
	};

	/** « Personnalité » n'existe que si les avatars ou les signatures sont activés. */
	private sectionAvailable(request: FastifyRequest, section: ProfileSection): boolean {
		return section !== 'personality' || request.board.avatars || request.board.signatures;
	}

	private async readSection(
		request: EditRequest,
		profile: EditableProfile,
		section: ProfileSection,
	): Promise<{ result: FormResult; rename: string | null }> {
		const { viewer, board: config, body } = request;
		const { lang } = this.deps.page;
		const form = (name: string): string => field(body, `form[${name}]`);

		switch (section) {
			case 'essentials': {
				const moderator = isAnyModerator(viewer);
				const renaming = moderator && canRenameUsers(viewer) ? normalizeUsername(field(body, 'req_username')) : profile.username;
				const emailEditable = moderator || !config.registration.verify;
				const email = field(body, 'req_email').trim().toLowerCase();
				const [bans, censor, similarUsername, emailOwners] = await Promise.all([
					this.deps.bans.listBans(),
					this.censor(request),
					renaming !== profile.username
						? this.deps.profileStore.findSimilarUsername(renaming, usernameSkeleton(renaming), profile.id)
						: Promise.resolve(null),
					emailEditable && !moderator && email !== profile.email.toLowerCase()
						? this.deps.profileStore.listUsernamesByEmail(email, profile.id)
						: Promise.resolve([]),
				]);
				const result = readEssentials(
					{
						timezone: form('timezone'),
						dst: checked(body, 'form[dst]'),
						username: field(body, 'req_username'),
						email: field(body, 'req_email'),
						adminNote: field(body, 'admin_note'),
						numPosts: field(body, 'num_posts'),
					},
					{
						isAnyModerator: moderator,
						isAdmin: isAdmin(viewer),
						canRename: canRenameUsers(viewer),
						emailEditable,
						currentUsername: profile.username,
						currentEmail: profile.email,
						guestLabel: lang.common.guest,
						bans,
						censor,
						similarUsername,
						emailOwners,
						allowBannedEmail: config.registration.allowBannedEmail,
						allowDupeEmail: config.registration.allowDupeEmail,
					},
				);
				return { result, rename: result.rename };
			}
			case 'personal':
				return {
					result: readPersonal(
						{ realname: form('realname'), title: field(body, 'title'), location: form('location'), url: form('url') },
						{
							isAdmin: isAdmin(viewer),
							canSetTitle: viewer.group.canSetTitle,
							canPostLinks: viewer.group.canPostLinks,
							forbiddenTitles: forbiddenTitles([
								lang.common.member,
								lang.common.moderator,
								lang.common.administrator,
								lang.common.banned,
								lang.common.guest,
							]),
						},
					),
					rename: null,
				};
			case 'messaging':
				return {
					result: readMessaging({ jabber: form('jabber'), icq: form('icq'), msn: form('msn'), aim: form('aim'), yahoo: form('yahoo') }),
					rename: null,
				};
			case 'personality': {
				if (!config.signatures) return { result: { changes: {}, errors: [] }, rename: null };
				const { changes, errors } = readSignature(field(body, 'signature'), {
					maxLength: config.signatureMaxLength,
					maxLines: config.signatureMaxLines,
					allowAllCaps: config.signatureAllCaps,
					bbcode: config.signatureBbcode,
					isAnyModerator: isAnyModerator(viewer),
					preparse: {
						quoteDepth: config.posting.quoteDepth,
						makeLinks: config.posting.makeLinks,
						allowLinks: viewer.group.canPostLinks,
						indentSpaces: config.indentSpaces,
						baseUrl: config.baseUrl,
					},
				});
				// En cas d'erreur, le texte saisi est réaffiché tel quel.
				const signature: ProfileChanges = errors.length > 0 ? { signature: field(body, 'signature') } : changes;
				return { result: { changes: signature, errors }, rename: null };
			}
			case 'display':
				return {
					result: readDisplay(
						{
							style: form('style'),
							showSmilies: checked(body, 'form[show_smilies]'),
							showSignatures: checked(body, 'form[show_sig]'),
							showAvatars: checked(body, 'form[show_avatars]'),
							showImages: checked(body, 'form[show_img]'),
							showSignatureImages: checked(body, 'form[show_img_sig]'),
							topicsPerPage: form('disp_topics'),
							postsPerPage: form('disp_posts'),
							reputationEnabled: field(body, 'reputation_enable') === '1',
						},
						displayOptions(config),
					),
					rename: null,
				};
			case 'privacy':
				return {
					result: readPrivacy(
						{
							emailSetting: form('email_setting'),
							notifyWithPost: checked(body, 'form[notify_with_post]'),
							autoNotify: checked(body, 'form[auto_notify]'),
							usesPrivateMessages: checked(body, 'form[use_pm]'),
							notifyPrivateMessages: checked(body, 'form[notify_pm]'),
							notifyPrivateMessagesFull: checked(body, 'form[notify_pm_full]'),
						},
						{
							subscriptions: config.forumSubscriptions || config.topicSubscriptions,
							autoNotify: config.topicSubscriptions,
							privateMessages: config.privateMessagesEnabled && viewer.group.canUsePrivateMessages,
							privateMessageNotification: config.privateMessageNotification,
							defaultEmailSetting: config.registration.defaultEmailSetting,
						},
					),
					rename: null,
				};
		}
	}

	private async censor(request: FastifyRequest): Promise<Censor | null> {
		return request.board.censoring ? buildCensor(await this.deps.censorship.listWords()) : null;
	}

	private async renderForm(
		request: EditRequest,
		reply: FastifyReply,
		profile: EditableProfile,
		section: ProfileSection,
		form: EditableProfile,
		errors: string[],
		updated: boolean,
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const [avatarUrl, censor] = await Promise.all([
			config.avatars && section === 'personality' ? this.deps.avatars.urlFor(profile.id, config.avatarsDir) : null,
			section === 'personality' ? this.censor(request) : null,
		]);
		const view = buildProfileEditPage({
			viewer,
			config,
			profile,
			form,
			section,
			errors,
			updated,
			avatarUrl,
			censor,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'profile_edit.njk',
			{ pageId: 'profile', titleParts: [config.boardTitle, lang.common.profile, sectionTitle(section, lang)], activeNav: 'profile' },
			view,
		);
	}
}
