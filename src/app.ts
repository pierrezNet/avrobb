/**
 * Assemblage de l'application Fastify. Les dépendances (repositories…) sont passées en paramètre :
 * server.ts fournit les vraies, les tests des doublures en mémoire.
 */

import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import nunjucks from 'nunjucks';
import type { ImageProcessor } from './adapters/imageProcessor.ts';
import type { Mailer } from './adapters/mailer.ts';
import type { ServerInfo } from './adapters/serverInfo.ts';
import { AdminAppearanceController, type AdminAppearanceQuery } from './controllers/AdminAppearanceController.ts';
import { AdminBansController, type AdminBansQuery } from './controllers/AdminBansController.ts';
import { AdminCensoringController, type AdminCensoringQuery } from './controllers/AdminCensoringController.ts';
import { AdminGroupsController, type AdminGroupsQuery } from './controllers/AdminGroupsController.ts';
import { AdminIndexController } from './controllers/AdminIndexController.ts';
import { AdminLoaderController, type AdminLoaderQuery } from './controllers/AdminLoaderController.ts';
import { AdminMaintenanceController, type AdminMaintenanceQuery } from './controllers/AdminMaintenanceController.ts';
import { AdminOptionsController, type AdminOptionsQuery } from './controllers/AdminOptionsController.ts';
import { AdminPagesController, type AdminPagesQuery } from './controllers/AdminPagesController.ts';
import { AdminPermissionsController, type AdminPermissionsQuery } from './controllers/AdminPermissionsController.ts';
import { AdminReportsController, type AdminReportsQuery } from './controllers/AdminReportsController.ts';
import { AdminUsersController, type AdminUsersQuery } from './controllers/AdminUsersController.ts';
import { ContactController, type ContactQuery } from './controllers/ContactController.ts';
import { DeleteController, type DeleteQuery } from './controllers/DeleteController.ts';
import { DraftController, type DraftQuery } from './controllers/DraftController.ts';
import { EditController, type EditQuery } from './controllers/EditController.ts';
import { ExternController, type ExternQuery } from './controllers/ExternController.ts';
import { FileManagerController, type FileManagerQuery } from './controllers/FileManagerController.ts';
import { type AdminCategoriesQuery, type AdminForumsQuery, ForumAdminController } from './controllers/ForumAdminController.ts';
import { ForumController, type ForumQuery } from './controllers/ForumController.ts';
import { GalleryController, type GalleryQuery } from './controllers/GalleryController.ts';
import { HelpController } from './controllers/HelpController.ts';
import { IndexController } from './controllers/IndexController.ts';
import { LoginController, type LoginQuery } from './controllers/LoginController.ts';
import { MemberSuggestController, type MemberSuggestQuery } from './controllers/MemberSuggestController.ts';
import { MiscController, type MiscQuery } from './controllers/MiscController.ts';
import { type HostResolver, ModerateController, type ModerateQuery } from './controllers/ModerateController.ts';
import { PostController, type PostQuery } from './controllers/PostController.ts';
import { PrivateContactController, type PrivateContactQuery } from './controllers/PrivateContactController.ts';
import { PrivateMessageController, type PrivateMessageQuery } from './controllers/PrivateMessageController.ts';
import { PrivateMessageSendController, type PrivateMessageSendQuery } from './controllers/PrivateMessageSendController.ts';
import { ProfileController, type ProfileQuery } from './controllers/ProfileController.ts';
import { ReputationController, type ReputationQuery } from './controllers/ReputationController.ts';
import { SearchController, type SearchQuery } from './controllers/SearchController.ts';
import { SeoController } from './controllers/SeoController.ts';
import { StaticPageController } from './controllers/StaticPageController.ts';
import { StatsPageController } from './controllers/StatsPageController.ts';
import { SubjectPrefixController, type SubjectPrefixQuery } from './controllers/SubjectPrefixController.ts';
import { TopicController, type TopicQuery } from './controllers/TopicController.ts';
import { UserlistController, type UserlistParams } from './controllers/UserlistController.ts';
import type { BoardConfig, Viewer } from './domain/models.ts';
import { ASSETS_PREFIX, createAssetUrl } from './http/assets.ts';
import { ensureCsrfToken, isValidCsrf } from './http/csrf.ts';
import { type FormBody, registerFormParser } from './http/forms.ts';
import { type LayoutDeps, renderBlock, renderMessage, renderMinimalMessage } from './http/layout.ts';
import { securityHeaders } from './http/securityHeaders.ts';
import { checkAccess, purgeOnline, type SessionDeps, startSession, trackCookieName as trackCookieOf } from './http/session.ts';
import type { AdminStatsReader } from './repositories/AdminStatsRepository.ts';
import type { BanStore } from './repositories/BanRepository.ts';
import type { CensorStore } from './repositories/CensorRepository.ts';
import type { ConfigCache, ConfigReader } from './repositories/ConfigLoader.ts';
import type { ConfigStore } from './repositories/ConfigRepository.ts';
import type { ContactStore } from './repositories/ContactRepository.ts';
import type { DraftStore } from './repositories/DraftRepository.ts';
import type { FeedReader } from './repositories/FeedRepository.ts';
import type { ForumAdminStore } from './repositories/ForumAdminRepository.ts';
import type { GalleryFileStore } from './repositories/GalleryFiles.ts';
import type { GalleryStore } from './repositories/GalleryRepository.ts';
import type { GroupAdminStore } from './repositories/GroupAdminRepository.ts';
import type { HeaderImageStore } from './repositories/HeaderImageFiles.ts';
import type { HomeActivityReader } from './repositories/HomeActivityRepository.ts';
import type { LabelAdminStore } from './repositories/LabelAdminRepository.ts';
import type { MailTemplateReader } from './repositories/MailTemplateFiles.ts';
import type { MaintenanceStore } from './repositories/MaintenanceRepository.ts';
import type { MemberSuggestReader } from './repositories/MemberSuggestRepository.ts';
import type { UploadStore } from './repositories/MemberUploadFiles.ts';
import type { ModerationStore } from './repositories/ModerationRepository.ts';
import type { PostEditStore } from './repositories/PostEditRepository.ts';
import type { PostingStore } from './repositories/PostingRepository.ts';
import type { PostReader } from './repositories/PostRepository.ts';
import type { PrivateContactStore, SendingListStore } from './repositories/PrivateContactRepository.ts';
import type { PrivateMessageStore } from './repositories/PrivateMessageRepository.ts';
import type { ProfileStore } from './repositories/ProfileRepository.ts';
import type { ReportStore, ReportWriter } from './repositories/ReportRepository.ts';
import type { ReputationStore } from './repositories/ReputationRepository.ts';
import type { SearchReader, SearchWriter } from './repositories/SearchRepository.ts';
import type { SitemapReader } from './repositories/SitemapRepository.ts';
import type { StatsReader } from './repositories/StatsRepository.ts';
import type { StopwordsReader } from './repositories/StopwordsLoader.ts';
import type { SubjectPrefixStore } from './repositories/SubjectPrefixRepository.ts';
import type { SubscriptionStore } from './repositories/SubscriptionRepository.ts';
import type { ToolbarReader } from './repositories/ToolbarRepository.ts';
import type { TopicLabelReader } from './repositories/TopicLabelRepository.ts';
import type { TopicReader, TopicWriter } from './repositories/TopicRepository.ts';
import type { UploadileAdminStore, UserAdminReader, UserAdminWriter } from './repositories/UserAdminRepository.ts';
import type { AccountLookup, MemberListReader, ProfileReader } from './repositories/UserRepository.ts';
import type { UsersInfoReader } from './repositories/UsersInfoLoader.ts';
import type { AvatarLocator, AvatarStore } from './services/avatars.ts';
import { type BannedWriteQuery, canWriteWhileBanned, readOnlyViewer } from './services/permissions.ts';

declare module 'fastify' {
	interface FastifyRequest {
		/** Utilisateur courant ; null tant que le hook d'authentification n'a pas abouti. */
		viewer: Viewer;
		/** Réglages du forum chargés pour cette requête. */
		board: BoardConfig;
		/** Jeton CSRF du visiteur, à placer dans chaque formulaire POST (http/csrf.ts). */
		csrfToken: string;
	}
}

export interface AppDeps extends LayoutDeps, SessionDeps {
	config: ConfigReader;
	members: MemberListReader;
	accounts: AccountLookup;
	/** Connexion de développement (DEV_LOGIN=1), depuis la machine seulement. */
	devLogin: boolean;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	profiles: ProfileReader;
	profileStore: ProfileStore;
	topics: TopicReader;
	topicWriter: TopicWriter;
	posts: PostReader;
	posting: PostingStore;
	postEdits: PostEditStore;
	drafts: DraftStore;
	/** Messagerie privée (mod APMS) : conversations, contacts, listes d'envoi. */
	privateMessageStore: PrivateMessageStore;
	privateContacts: PrivateContactStore;
	sendingLists: SendingListStore;
	subscriptions: SubscriptionStore;
	reputation: ReputationStore;
	/** Modération des sujets et messages (moderate.php) et résolution inverse des IP. */
	moderation: ModerationStore;
	hostResolver: HostResolver;
	contacts: ContactStore;
	reportWriter: ReportWriter;
	/** Liste et traitement des signalements (admin_reports.php). */
	reportStore: ReportStore;
	/** Bannissements gérés dans l'administration (admin_bans.php). */
	banStore: BanStore;
	/** Statistiques de l'administration (admin_statistics.php). */
	adminStats: AdminStatsReader;
	serverInfo: ServerInfo;
	/** Options du forum (admin_options.php) : table config et invalidation des caches. */
	configStore: ConfigStore;
	configCache: ConfigCache;
	/** Catégories et forums (admin_categories.php, admin_forums.php). */
	forumAdmin: ForumAdminStore;
	/** Reconstruction de l'index et élagage (admin_maintenance.php). */
	maintenance: MaintenanceStore;
	/** Plugin AP_Balises.php (mod PunBalise). */
	labelAdmin: LabelAdminStore;
	/** Préfixes du sujet (topic_prefixes.php, page propre à Node). */
	subjectPrefixes: SubjectPrefixStore;
	/** Complètement des noms de membres (member_suggest.php, propre à Node). */
	memberSuggest: MemberSuggestReader;
	/** Groupes d'utilisateurs (admin_groups.php). */
	groupAdmin: GroupAdminStore;
	/** Recherche d'utilisateurs et d'adresses IP (admin_users.php). */
	userAdmin: UserAdminReader & UserAdminWriter & UploadileAdminStore;
	toolbar: ToolbarReader;
	avatars: AvatarLocator;
	avatarStore: AvatarStore;
	/** Fichiers des membres (Uploadile) dans img/members/ de l'installation PHP. */
	uploads: UploadStore;
	/** Conversion des images envoyées en WebP (sharp). */
	imageProcessor: ImageProcessor;
	censorship: CensorStore;
	topicLabels: TopicLabelReader;
	stats: StatsReader;
	search: SearchReader;
	searchWriter: SearchWriter;
	feeds: FeedReader;
	gallery: GalleryStore;
	/** Plan du site (sitemap.xml) : forums et discussions lisibles par un invité. */
	sitemap: SitemapReader;
	/** Activité de la semaine affichée à l'accueil (discussions, nouveaux membres, simulateurs). */
	homeActivity: HomeActivityReader;
	/** Logo et bannière de l'en-tête (fichiers de l'installation PHP), page Apparence. */
	headerImages: HeaderImageStore;
	/** Fichiers de la galerie (img/gallery/ de l'installation PHP). */
	galleryFiles: GalleryFileStore;
	stopwords: StopwordsReader;
	usersInfo: UsersInfoReader;
	/** URL de l'installation PHP : les liens vers les pages non portées y renvoient. */
	legacyBaseUrl: string;
	/**
	 * Dossier img/ de l'installation PHP, servi sous /img/ (images seulement) : o_base_url peut
	 * désigner Node, et les images insérées dans les messages (galerie, uploads) y pointent.
	 */
	legacyImagesRoot?: string;
	/** Derrière un reverse proxy : l'IP du client est lue dans X-Forwarded-For. */
	trustProxy?: boolean;
	logger?: boolean;
}

/** Fichiers de img/ que Node accepte de servir. */
const LEGACY_IMAGE_PATH = /\.(?:gif|jpe?g|png|webp|ico)$/i;

/** Pages déjà servies par Node ; les autres liens partent vers l'installation PHP. */
const PORTED_PAGES = new Set([
	'admin_appearance.php',
	'faq.php',
	'stats.php',
	'privacy.php',
	'terms.php',
	'admin_bans.php',
	'admin_pages.php',
	'admin_categories.php',
	'admin_censoring.php',
	'admin_forums.php',
	'admin_groups.php',
	'admin_index.php',
	'admin_loader.php',
	'admin_maintenance.php',
	'admin_options.php',
	'admin_permissions.php',
	'admin_reports.php',
	'admin_users.php',
	'member_suggest.php',
	'topic_prefixes.php',
	'admin_statistics.php',
	'delete.php',
	'draft_edit.php',
	'draft_list.php',
	'edit.php',
	'extern.php',
	'gallery.php',
	'gestionnaire.php',
	'help.php',
	'index.php',
	'login.php',
	'misc.php',
	'moderate.php',
	'pms_contacts.php',
	'pms_inbox.php',
	'pms_send.php',
	'pms_sending_lists.php',
	'pms_view.php',
	'post.php',
	'profile.php',
	'reputation.php',
	'search.php',
	'userlist.php',
	'viewforum.php',
	'viewtopic.php',
]);

const ROOT_DIR = path.join(import.meta.dirname, '..');

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
	const app = Fastify({ logger: deps.logger ?? false, trustProxy: deps.trustProxy ?? false });

	// url('profile.php?id=2') : lien local si la page est portée, sinon vers l'installation PHP.
	// Les URL absolues (http:, mailto:…) sont laissées telles quelles.
	const url = (target: string): string => {
		const page = target.split(/[?#]/)[0] ?? '';
		const keep = /^[a-z][a-z0-9+.-]*:/i.test(target) || PORTED_PAGES.has(page) || deps.legacyBaseUrl === '';
		return keep ? target : `${deps.legacyBaseUrl}/${target}`;
	};
	const asset = createAssetUrl(path.join(ROOT_DIR, 'public'));

	// En-têtes de sécurité sur toutes les réponses, fichiers statiques compris (http/securityHeaders.ts).
	app.addHook('onSend', async (request, reply) => {
		reply.headers(securityHeaders(deps.legacyBaseUrl, request.protocol === 'https'));
	});
	await app.register(fastifyCookie);
	registerFormParser(app);
	await app.register(fastifyView, {
		engine: { nunjucks },
		root: path.join(import.meta.dirname, 'views'),
		options: {
			autoescape: true,
			throwOnUndefined: true,
			onConfigure: (env: nunjucks.Environment) => {
				env.addGlobal('url', url);
				env.addGlobal('asset', asset);
			},
		},
	});
	await app.register(fastifyStatic, {
		root: path.join(ROOT_DIR, 'public'),
		prefix: ASSETS_PREFIX,
		// Les URL portent une empreinte du contenu (http/assets.ts) : on peut les garder longtemps.
		maxAge: '30d',
		immutable: true,
	});
	if (deps.legacyImagesRoot !== undefined) {
		await app.register(fastifyStatic, {
			root: deps.legacyImagesRoot,
			prefix: '/img/',
			decorateReply: false,
			index: false,
			maxAge: '7d',
			// Rien d'autre que des images : le dossier contient aussi des .html et des Thumbs.db.
			allowedPath: (pathname) => LEGACY_IMAGE_PATH.test(pathname),
		});
	}

	app.decorateRequest('viewer', null as unknown as Viewer);
	app.decorateRequest('board', null as unknown as BoardConfig);
	app.decorateRequest('csrfToken', '');

	// Équivalent de common.php : réglages, visiteur et présence, maintenance, bannissements. Déclaré
	// par route (et non globalement) pour que les fichiers statiques ne coûtent aucune requête SQL.
	const session =
		(options: { quiet?: boolean | ((request: FastifyRequest) => boolean); allowDuringMaintenance?: boolean } = {}) =>
		async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
			const now = deps.page.clock();
			request.board = await deps.config.load();
			const quiet = typeof options.quiet === 'function' ? options.quiet(request) : (options.quiet ?? false);
			request.viewer = await startSession(request, reply, deps, request.board, now, { quiet });
			request.csrfToken = ensureCsrfToken(request, reply, deps.cookie, request.viewer.id);

			const block = await checkAccess(request, deps, request.viewer, request.board, now, options.allowDuringMaintenance ?? false);
			// Banni : lecture seule (AvroBB) ; les écritures sont refusées par verifyCsrf.
			if (block?.kind === 'banned') request.viewer = readOnlyViewer(request.viewer, { expire: block.expire, message: block.message });
			else if (block !== null) return renderBlock(request, reply, deps, block);

			await purgeOnline(deps, request.board, now);
			return undefined;
		};
	const authenticate = session();
	/**
	 * Formulaires POST : session puis jeton CSRF (403 sinon), avant toute écriture. Un visiteur banni
	 * ne peut que se connecter ou se déconnecter, marquer comme lu et gérer ses abonnements.
	 */
	const verifyCsrf = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
		if (!isValidCsrf(request, deps.cookie, request.viewer.id))
			return renderMessage(request, reply, deps, 403, deps.page.lang.common.badCsrf);
		const { ban } = request.viewer;
		if (ban !== null && !canWriteWhileBanned(request.url.split('?')[0] ?? '', request.query as BannedWriteQuery))
			return renderBlock(request, reply, deps, { kind: 'banned', ...ban });
		return undefined;
	};
	const quietSession = session({ quiet: true });

	app.setErrorHandler((error: FastifyError, request, reply) => handleError(error, request, reply, deps));
	app.setNotFoundHandler({ preHandler: authenticate }, (request, reply) =>
		renderMessage(request, reply, deps, 404, deps.page.lang.common.badRequest),
	);

	// Les navigateurs et les robots demandent /favicon.ico d'office : icône AvroBB (sans session).
	app.get('/favicon.ico', (_request, reply) => reply.redirect(asset('icons/favicon-32.png'), 301));
	const seo = new SeoController(deps);
	app.get('/robots.txt', seo.robots);
	app.get('/sitemap.xml', seo.sitemap);

	const trackCookieName = trackCookieOf(deps.cookie);
	const index = new IndexController({ ...deps, trackCookieName });
	app.get('/', { preHandler: authenticate }, index.show);
	app.get('/index.php', { preHandler: authenticate }, index.show);

	const forums = new ForumController({ ...deps, trackCookieName });
	app.get<{ Querystring: ForumQuery }>('/viewforum.php', { preHandler: authenticate }, forums.show);

	const search = new SearchController({ ...deps, trackCookieName });
	app.get<{ Querystring: SearchQuery }>('/search.php', { preHandler: authenticate }, search.show);

	const userlist = new UserlistController(deps);
	app.get<{ Querystring: UserlistParams }>('/userlist.php', { preHandler: authenticate }, userlist.show);

	const extern = new ExternController(deps);
	app.get<{ Querystring: ExternQuery }>('/extern.php', { preHandler: quietSession }, extern.show);

	const gallery = new GalleryController(deps);
	app.get<{ Querystring: GalleryQuery }>('/gallery.php', { preHandler: authenticate }, gallery.show);
	app.post<{ Querystring: GalleryQuery; Body: FormBody }>('/gallery.php', { preHandler: [authenticate, verifyCsrf] }, gallery.submit);

	// login.php : visite discrète dès qu'une action est demandée (PUN_QUIET_VISIT), et accessible en
	// maintenance pour qu'un administrateur puisse se connecter.
	const loginSession = session({ quiet: (request) => (request.query as LoginQuery).action !== undefined, allowDuringMaintenance: true });
	const login = new LoginController(deps);
	app.get<{ Querystring: LoginQuery }>('/login.php', { preHandler: loginSession }, login.show);
	app.post<{ Querystring: LoginQuery; Body: FormBody }>('/login.php', { preHandler: [loginSession, verifyCsrf] }, (request, reply) => {
		if (request.query.action === 'in') return login.login(request, reply);
		if (request.query.action === 'out') return login.logout(request, reply);
		return renderMessage(request, reply, deps, 400, deps.page.lang.common.badRequest);
	});

	// misc.php : visite discrète dès qu'une action est demandée (PUN_QUIET_VISIT).
	const miscSession = session({ quiet: (request) => (request.query as MiscQuery).action !== undefined });
	const misc = new MiscController({ ...deps, trackCookieName });
	const contact = new ContactController(deps);
	app.get<{ Querystring: MiscQuery & ContactQuery }>('/misc.php', { preHandler: miscSession }, (request, reply) => {
		if (request.query.email !== undefined) return contact.emailForm(request, reply);
		if (request.query.report !== undefined) return contact.reportForm(request, reply);
		return misc.show(request, reply);
	});
	app.post<{ Querystring: MiscQuery & ContactQuery; Body: FormBody }>(
		'/misc.php',
		{ preHandler: [miscSession, verifyCsrf] },
		(request, reply) => {
			if (request.query.email !== undefined) return contact.sendEmail(request, reply);
			if (request.query.report !== undefined) return contact.sendReport(request, reply);
			if (request.query.action === 'subscribe' || request.query.action === 'unsubscribe') return misc.subscription(request, reply);
			return misc.markRead(request, reply);
		},
	);

	const help = new HelpController(deps);
	app.get('/help.php', { preHandler: authenticate }, help.show);

	const profiles = new ProfileController(deps);
	app.get<{ Querystring: ProfileQuery }>('/profile.php', { preHandler: authenticate }, profiles.show);
	app.post<{ Querystring: ProfileQuery; Body: FormBody }>('/profile.php', { preHandler: [authenticate, verifyCsrf] }, profiles.submit);

	const fileManager = new FileManagerController(deps);
	app.get<{ Querystring: FileManagerQuery }>('/gestionnaire.php', { preHandler: authenticate }, fileManager.show);
	app.post<{ Querystring: FileManagerQuery; Body: FormBody }>(
		'/gestionnaire.php',
		{ preHandler: [authenticate, verifyCsrf] },
		fileManager.submit,
	);

	const moderate = new ModerateController({ ...deps, trackCookieName });
	app.get<{ Querystring: ModerateQuery }>('/moderate.php', { preHandler: authenticate }, moderate.show);
	app.post<{ Querystring: ModerateQuery; Body: FormBody }>('/moderate.php', { preHandler: [authenticate, verifyCsrf] }, moderate.submit);

	const adminIndex = new AdminIndexController(deps);
	app.get('/admin_index.php', { preHandler: authenticate }, adminIndex.index);
	app.get('/admin_statistics.php', { preHandler: authenticate }, adminIndex.statistics);

	const adminOptions = new AdminOptionsController(deps);
	app.get<{ Querystring: AdminOptionsQuery }>('/admin_options.php', { preHandler: authenticate }, adminOptions.show);
	app.post<{ Body: FormBody }>('/admin_options.php', { preHandler: [authenticate, verifyCsrf] }, adminOptions.save);

	const adminPermissions = new AdminPermissionsController(deps);
	app.get<{ Querystring: AdminPermissionsQuery }>('/admin_permissions.php', { preHandler: authenticate }, adminPermissions.show);
	app.post<{ Body: FormBody }>('/admin_permissions.php', { preHandler: [authenticate, verifyCsrf] }, adminPermissions.save);

	const forumAdmin = new ForumAdminController(deps);
	app.get<{ Querystring: AdminCategoriesQuery }>('/admin_categories.php', { preHandler: authenticate }, forumAdmin.showCategories);
	app.post<{ Body: FormBody }>('/admin_categories.php', { preHandler: [authenticate, verifyCsrf] }, forumAdmin.submitCategories);
	app.get<{ Querystring: AdminForumsQuery }>('/admin_forums.php', { preHandler: authenticate }, forumAdmin.showForums);
	app.post<{ Querystring: AdminForumsQuery; Body: FormBody }>(
		'/admin_forums.php',
		{ preHandler: [authenticate, verifyCsrf] },
		forumAdmin.submitForums,
	);

	const adminGroups = new AdminGroupsController(deps);
	app.get<{ Querystring: AdminGroupsQuery }>('/admin_groups.php', { preHandler: authenticate }, adminGroups.show);
	app.post<{ Querystring: AdminGroupsQuery; Body: FormBody }>(
		'/admin_groups.php',
		{ preHandler: [authenticate, verifyCsrf] },
		adminGroups.submit,
	);

	const adminUsers = new AdminUsersController(deps);
	app.get<{ Querystring: AdminUsersQuery }>('/admin_users.php', { preHandler: authenticate }, adminUsers.show);
	app.post<{ Body: FormBody }>('/admin_users.php', { preHandler: [authenticate, verifyCsrf] }, adminUsers.submit);

	const adminLoader = new AdminLoaderController(deps);
	app.get<{ Querystring: AdminLoaderQuery }>('/admin_loader.php', { preHandler: authenticate }, adminLoader.show);
	app.post<{ Querystring: AdminLoaderQuery; Body: FormBody }>(
		'/admin_loader.php',
		{ preHandler: [authenticate, verifyCsrf] },
		adminLoader.submit,
	);

	// Pages d'information : même en mode maintenance ou sans droit de lecture du forum.
	const staticPages = new StaticPageController(deps);
	const infoSession = session({ allowDuringMaintenance: true });
	app.get('/terms.php', { preHandler: infoSession }, staticPages.show('terms'));
	app.get('/privacy.php', { preHandler: infoSession }, staticPages.show('privacy'));
	app.get('/faq.php', { preHandler: infoSession }, staticPages.show('faq'));
	app.get('/stats.php', { preHandler: authenticate }, new StatsPageController(deps).show);

	const adminPages = new AdminPagesController(deps);
	app.get<{ Querystring: AdminPagesQuery }>('/admin_pages.php', { preHandler: authenticate }, adminPages.show);
	app.post<{ Body: FormBody }>('/admin_pages.php', { preHandler: [authenticate, verifyCsrf] }, adminPages.submit);

	const adminAppearance = new AdminAppearanceController(deps);
	app.get<{ Querystring: AdminAppearanceQuery }>('/admin_appearance.php', { preHandler: authenticate }, adminAppearance.show);
	app.post<{ Body: FormBody }>('/admin_appearance.php', { preHandler: [authenticate, verifyCsrf] }, adminAppearance.submit);

	const adminCensoring = new AdminCensoringController(deps);
	app.get<{ Querystring: AdminCensoringQuery }>('/admin_censoring.php', { preHandler: authenticate }, adminCensoring.show);
	app.post<{ Body: FormBody }>('/admin_censoring.php', { preHandler: [authenticate, verifyCsrf] }, adminCensoring.submit);

	const adminBans = new AdminBansController(deps);
	app.get<{ Querystring: AdminBansQuery }>('/admin_bans.php', { preHandler: authenticate }, adminBans.show);
	app.post<{ Querystring: AdminBansQuery; Body: FormBody }>(
		'/admin_bans.php',
		{ preHandler: [authenticate, verifyCsrf] },
		adminBans.submit,
	);

	const adminMaintenance = new AdminMaintenanceController(deps);
	app.get<{ Querystring: AdminMaintenanceQuery }>('/admin_maintenance.php', { preHandler: authenticate }, adminMaintenance.show);
	app.post<{ Body: FormBody }>('/admin_maintenance.php', { preHandler: [authenticate, verifyCsrf] }, adminMaintenance.submit);

	const subjectPrefixes = new SubjectPrefixController(deps);
	app.get<{ Querystring: SubjectPrefixQuery }>('/topic_prefixes.php', { preHandler: authenticate }, subjectPrefixes.show);
	app.post<{ Querystring: SubjectPrefixQuery; Body: FormBody }>(
		'/topic_prefixes.php',
		{ preHandler: [authenticate, verifyCsrf] },
		subjectPrefixes.submit,
	);

	const memberSuggest = new MemberSuggestController(deps);
	app.get<{ Querystring: MemberSuggestQuery }>('/member_suggest.php', { preHandler: authenticate }, memberSuggest.suggest);

	const adminReports = new AdminReportsController(deps);
	app.get<{ Querystring: AdminReportsQuery }>('/admin_reports.php', { preHandler: authenticate }, adminReports.show);
	app.post<{ Body: FormBody }>('/admin_reports.php', { preHandler: [authenticate, verifyCsrf] }, adminReports.zap);

	const reputation = new ReputationController(deps);
	app.get<{ Querystring: ReputationQuery }>('/reputation.php', { preHandler: authenticate }, reputation.show);
	app.post<{ Querystring: ReputationQuery; Body: FormBody }>(
		'/reputation.php',
		{ preHandler: [authenticate, verifyCsrf] },
		reputation.submit,
	);

	const pms = new PrivateMessageController(deps);
	app.get<{ Querystring: PrivateMessageQuery }>('/pms_inbox.php', { preHandler: authenticate }, (request, reply) =>
		pms.inbox(request, reply),
	);
	app.post<{ Querystring: PrivateMessageQuery; Body: FormBody }>(
		'/pms_inbox.php',
		{ preHandler: [authenticate, verifyCsrf] },
		pms.inboxAction,
	);
	app.get<{ Querystring: PrivateMessageQuery }>('/pms_view.php', { preHandler: authenticate }, pms.view);
	app.post<{ Querystring: PrivateMessageQuery; Body: FormBody }>('/pms_view.php', { preHandler: [authenticate, verifyCsrf] }, pms.delete);

	const pmSend = new PrivateMessageSendController(deps);
	app.get<{ Querystring: PrivateMessageSendQuery }>('/pms_send.php', { preHandler: authenticate }, pmSend.form);
	app.post<{ Querystring: PrivateMessageSendQuery; Body: FormBody }>(
		'/pms_send.php',
		{ preHandler: [authenticate, verifyCsrf] },
		pmSend.send,
	);

	const pmContacts = new PrivateContactController(deps);
	app.get<{ Querystring: PrivateContactQuery }>('/pms_contacts.php', { preHandler: authenticate }, (request, reply) =>
		pmContacts.contacts(request, reply),
	);
	app.post<{ Querystring: PrivateContactQuery; Body: FormBody }>(
		'/pms_contacts.php',
		{ preHandler: [authenticate, verifyCsrf] },
		pmContacts.updateContacts,
	);
	app.get<{ Querystring: PrivateContactQuery }>('/pms_sending_lists.php', { preHandler: authenticate }, (request, reply) =>
		pmContacts.sendingLists(request, reply),
	);
	app.post<{ Querystring: PrivateContactQuery; Body: FormBody }>(
		'/pms_sending_lists.php',
		{ preHandler: [authenticate, verifyCsrf] },
		pmContacts.updateSendingLists,
	);

	const post = new PostController({ ...deps, trackCookieName });
	app.get<{ Querystring: PostQuery }>('/post.php', { preHandler: authenticate }, post.show);
	app.post<{ Querystring: PostQuery; Body: FormBody }>('/post.php', { preHandler: [authenticate, verifyCsrf] }, (request, reply) =>
		request.query.brouillon !== undefined ? post.publishDraft(request, reply) : post.submit(request, reply),
	);

	const edit = new EditController(deps);
	app.get<{ Querystring: EditQuery }>('/edit.php', { preHandler: authenticate }, edit.show);
	app.post<{ Querystring: EditQuery; Body: FormBody }>('/edit.php', { preHandler: [authenticate, verifyCsrf] }, edit.submit);

	const drafts = new DraftController(deps);
	app.get<{ Querystring: DraftQuery }>('/draft_list.php', { preHandler: authenticate }, drafts.list);
	app.post<{ Body: FormBody }>('/draft_list.php', { preHandler: [authenticate, verifyCsrf] }, drafts.remove);
	app.get<{ Querystring: DraftQuery }>('/draft_edit.php', { preHandler: authenticate }, drafts.edit);
	app.post<{ Querystring: DraftQuery; Body: FormBody }>('/draft_edit.php', { preHandler: [authenticate, verifyCsrf] }, drafts.save);

	const deletion = new DeleteController(deps);
	app.get<{ Querystring: DeleteQuery }>('/delete.php', { preHandler: authenticate }, deletion.show);
	app.post<{ Querystring: DeleteQuery; Body: FormBody }>('/delete.php', { preHandler: [authenticate, verifyCsrf] }, deletion.confirm);

	const topics = new TopicController({ ...deps, topicViews: deps.topicWriter, trackCookieName });
	app.get<{ Querystring: TopicQuery }>('/viewtopic.php', { preHandler: authenticate }, topics.show);

	return app;
}

/**
 * Erreurs non prévues par les contrôleurs : page d'information avec un texte générique, détail
 * technique seulement dans le journal (ni SQL, ni chemin, ni pile d'appels vers le navigateur).
 */
async function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply, deps: LayoutDeps): Promise<FastifyReply> {
	const { lang } = deps.page;
	const status = error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
	const message = status === 500 ? lang.common.serverError : lang.common.badRequest;

	if (status === 500) request.log.error({ err: error }, 'Erreur pendant le traitement de la requête');
	else request.log.info({ err: error }, 'Requête refusée');

	// Les décorations valent null si l'erreur est survenue avant ou pendant l'authentification.
	const authenticated = (request.viewer as Viewer | null) !== null && (request.board as BoardConfig | null) !== null;

	if (authenticated) {
		try {
			return await renderMessage(request, reply, deps, status, message);
		} catch (renderError) {
			request.log.error({ err: renderError }, "Échec du rendu de la page d'erreur");
		}
	}

	return renderMinimalMessage(reply, lang, status, message);
}
