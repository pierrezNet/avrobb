/**
 * Plugiles du profil, propres à PV (profile.php?plugin=…) : « Ma biographie » (modification),
 * « Suivile » (désabonnement des discussions) et « Mes uploads » (dépôt de fichiers Uploadile).
 *
 * Écarts assumés : les plugiles privés (UPP_) sont réservés au membre et aux administrateurs, comme
 * le veut leur convention de nom (le PHP ne contrôlait rien : tout visiteur pouvait se désabonner
 * ou supprimer les fichiers d'un autre en changeant l'id) ; les erreurs et confirmations
 * s'affichent dans la page au lieu d'une page « Redirection… ».
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ImageProcessor } from '../adapters/imageProcessor.ts';
import type { EditableProfile } from '../domain/models.ts';
import { GroupId } from '../domain/models.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderPage } from '../http/layout.ts';
import { buildBiographyPage, buildSubscriptionsPage, buildUploadsPage } from '../presenters/profilePlugilePage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { UploadStore } from '../repositories/MemberUploadFiles.ts';
import type { TopicLabelReader } from '../repositories/TopicLabelRepository.ts';
import { buildCensor, type Censor } from '../services/censor.ts';
import { canEditProfile, canUsePrivatePlugiles } from '../services/permissions.ts';
import { readBiography } from '../services/profileForms.ts';
import { uploadLimits } from '../services/uploads.ts';
import { positiveInt } from './params.ts';
import { isProfile, loadEditableProfile, type ProfileAccessDeps, type ProfileQuery } from './profileAccess.ts';
import { UploadActions } from './uploadActions.ts';

export interface PlugileControllerDeps extends LayoutDeps, ProfileAccessDeps {
	imageProcessor: ImageProcessor;
	censorship: CensorReader;
	topicLabels: TopicLabelReader;
	uploads: UploadStore;
}

type PlugileRequest = FastifyRequest<{ Querystring: ProfileQuery; Body?: FormBody }>;

/** Avis affichés après une redirection (?updated=…). */
type Notice = 'saved' | 'unsubscribed' | 'uploaded' | 'deleted' | 'deleteFailed';

/** Valeurs d'un champ répété (cases à cocher). */
function values(body: FormBody | undefined, name: string): string[] {
	const value = body?.[name];
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export class PlugileController {
	readonly #uploadActions: UploadActions;

	constructor(private readonly deps: PlugileControllerDeps) {
		this.#uploadActions = new UploadActions(deps);
	}

	// ——— Ma biographie ———

	biography = async (request: PlugileRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const profile = await loadEditableProfile(request, reply, this.deps);
		if (!isProfile(profile)) return profile;
		return this.renderBiography(request, reply, profile, profile.biography, []);
	};

	saveBiography = async (request: PlugileRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config, body } = request;
		const { lang } = this.deps.page;
		const profile = await loadEditableProfile(request, reply, this.deps);
		if (!isProfile(profile)) return profile;

		const raw = field(body, 'req_message');
		const { biography, errors } = readBiography(raw, {
			bbcode: config.bbcode,
			messageAllCaps: config.posting.messageAllCaps,
			isModeratorGroup: viewer.group.id === GroupId.Admin || viewer.group.id === GroupId.Moderator,
			preparse: {
				quoteDepth: config.posting.quoteDepth,
				makeLinks: config.posting.makeLinks,
				allowLinks: viewer.group.canPostLinks,
				indentSpaces: config.indentSpaces,
				baseUrl: config.baseUrl,
			},
		});
		if (errors.length > 0) {
			const texts = errors.map((error) => (error === 'tooLong' ? lang.profile.biographyTooLong : lang.post.preparseError(error)));
			return this.renderBiography(request, reply, profile, raw, texts);
		}

		await this.deps.profileStore.updateProfile(profile.id, { biography });
		return reply.redirect(`profile.php?plugin=UP_Ma_biographie.php&id=${profile.id}&updated=saved`, 303);
	};

	// ——— Suivile ———

	subscriptions = async (request: PlugileRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const profile = await this.privateProfile(request, reply);
		if (!isProfile(profile)) return profile;
		return this.renderSubscriptions(request, reply, profile, []);
	};

	unsubscribe = async (request: PlugileRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const profile = await this.privateProfile(request, reply);
		if (!isProfile(profile)) return profile;

		const topicIds = values(request.body, 'topics')
			.map((id) => positiveInt(id))
			.filter((id) => id > 0);
		if (topicIds.length === 0) return this.renderSubscriptions(request, reply, profile, [this.deps.page.lang.profile.noTopicsSelected]);

		await this.deps.profileStore.unsubscribeTopics(profile.id, topicIds);
		return reply.redirect(`profile.php?plugin=UPP_Suivile.php&id=${profile.id}&updated=unsubscribed`, 303);
	};

	// ——— Mes uploads ———

	uploads = async (request: PlugileRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const profile = await this.privateProfile(request, reply);
		if (!isProfile(profile)) return profile;
		return this.renderUploads(request, reply, profile, profile.uploadedBytes, []);
	};

	/** Formulaire d'envoi ou de suppression (controllers/uploadActions.ts). */
	updateUploads = async (request: PlugileRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const profile = await this.privateProfile(request, reply);
		if (!isProfile(profile)) return profile;
		const outcome = await this.#uploadActions.handle(request, profile);
		if ('error' in outcome) return this.renderUploads(request, reply, profile, profile.uploadedBytes, [outcome.error]);
		return reply.redirect(`profile.php?plugin=UPP_Mes_uploads.php&id=${profile.id}&updated=${outcome.notice}`, 303);
	};

	/** Profil modifiable, et plugile privé accessible au lecteur. */
	private privateProfile(request: PlugileRequest, reply: FastifyReply): Promise<EditableProfile | FastifyReply> {
		return loadEditableProfile(
			request,
			reply,
			this.deps,
			(profile) => canEditProfile(request.viewer, profile) && canUsePrivatePlugiles(request.viewer, profile.id),
		);
	}

	private notice(request: PlugileRequest): string | null {
		const t = this.deps.page.lang.profile;
		const notices: Record<Notice, string> = {
			saved: t.updated,
			unsubscribed: t.updated,
			uploaded: t.uploadSuccess,
			deleted: t.deleteSuccess,
			deleteFailed: t.deleteFailed,
		};
		const key = request.query.updated;
		return key !== undefined && key in notices ? notices[key as Notice] : null;
	}

	private async censor(request: FastifyRequest): Promise<Censor | null> {
		return request.board.censoring ? buildCensor(await this.deps.censorship.listWords()) : null;
	}

	private async renderBiography(
		request: PlugileRequest,
		reply: FastifyReply,
		profile: EditableProfile,
		biography: string,
		errors: string[],
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const view = buildBiographyPage({
			viewer,
			config,
			userId: profile.id,
			lang,
			errors,
			notice: this.notice(request),
			saved: profile.biography,
			biography,
			censor: await this.censor(request),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'profile_biography.njk',
			{ pageId: 'profile', titleParts: [config.boardTitle, lang.common.profile, lang.profile.myBiography], activeNav: 'profile' },
			view,
		);
	}

	private async renderSubscriptions(
		request: PlugileRequest,
		reply: FastifyReply,
		profile: EditableProfile,
		errors: string[],
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const topics = await this.deps.profileStore.listSubscribedTopics(profile.id, viewer.group.id);
		const [topicLabels, labelDefinitions, censor] = await Promise.all([
			this.deps.topicLabels.listForTopics(topics.map((topic) => topic.id)),
			this.deps.topicLabels.listDefinitions(),
			this.censor(request),
		]);
		const view = buildSubscriptionsPage({
			viewer,
			config,
			userId: profile.id,
			lang,
			errors,
			notice: this.notice(request),
			topics,
			topicLabels,
			labelDefinitions,
			censor,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'profile_subscriptions.njk',
			{ pageId: 'profile', titleParts: [config.boardTitle, lang.common.profile, lang.profile.subscriptionsPlugile], activeNav: 'profile' },
			view,
		);
	}

	private async renderUploads(
		request: PlugileRequest,
		reply: FastifyReply,
		profile: EditableProfile,
		usedBytes: number,
		errors: string[],
	): Promise<FastifyReply> {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		const stored = await this.deps.uploads.list(profile.id);
		const view = buildUploadsPage({
			viewer,
			config,
			userId: profile.id,
			lang,
			errors,
			notice: this.notice(request),
			files: stored?.map((file) => ({ ...file, href: this.deps.uploads.urlFor(profile.id, file.name) })) ?? null,
			limits: uploadLimits(profile.groupId, config.uploads),
			usedBytes,
		});
		return renderPage(
			request,
			reply,
			this.deps,
			'profile_uploads.njk',
			{ pageId: 'profile', titleParts: [config.boardTitle, lang.common.profile, lang.profile.uploadsPlugile], activeNav: 'profile' },
			view,
		);
	}
}
