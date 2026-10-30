/**
 * Assemblage de l'application (Hono). Les dépendances (repositories, gabarits, fichiers…) sont
 * passées en paramètre : worker.ts fournit les vraies, à partir des liaisons du Worker (D1, R2),
 * les tests des doublures en mémoire. Rien ici ne dépend de Node.
 */

import { Hono } from 'hono';
import type { Mailer } from './adapters/mailer.ts';
import type { OAuthClient, OAuthCredentials } from './adapters/oauth.ts';
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
import { AuthController, type AuthQuery, type RateLimiter } from './controllers/AuthController.ts';
import { ContactController, type ContactQuery } from './controllers/ContactController.ts';
import { DeleteController, type DeleteQuery } from './controllers/DeleteController.ts';
import { DraftController, type DraftQuery } from './controllers/DraftController.ts';
import { EditController, type EditQuery } from './controllers/EditController.ts';
import { ExternController, type ExternQuery } from './controllers/ExternController.ts';
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
import type { AppReply, AppRequest, Logger } from './http/context.ts';
import { ensureCsrfToken, existingCsrfToken, isValidCsrf } from './http/csrf.ts';
import { type FormBody, FormError } from './http/forms.ts';
import { type LayoutDeps, renderBlock, renderMessage, renderMinimalMessage } from './http/layout.ts';
import { silentLogger } from './http/log.ts';
import { rateLimited } from './http/rateLimit.ts';
import { createRouter, type ForumApp, type Router, serveStoredFiles, useSecurityHeaders } from './http/server.ts';
import { checkAccess, purgeOnline, type SessionDeps, startSession, trackCookieName as trackCookieOf } from './http/session.ts';
import { createViews, type PrecompiledTemplates } from './http/views.ts';
import type { AccountStore } from './repositories/AccountRepository.ts';
import type { AdminStatsReader } from './repositories/AdminStatsRepository.ts';
import type { AvatarLocator, AvatarStore } from './repositories/AvatarFiles.ts';
import type { BanStore } from './repositories/BanRepository.ts';
import type { CensorStore } from './repositories/CensorRepository.ts';
import type { ConfigCache, ConfigReader } from './repositories/ConfigLoader.ts';
import type { ConfigStore } from './repositories/ConfigRepository.ts';
import type { ContactStore } from './repositories/ContactRepository.ts';
import type { DraftStore } from './repositories/DraftRepository.ts';
import type { FeedReader } from './repositories/FeedRepository.ts';
import type { FileStore } from './repositories/FileStore.ts';
import type { ForumAdminStore } from './repositories/ForumAdminRepository.ts';
import type { GalleryFileStore } from './repositories/GalleryFiles.ts';
import type { GalleryStore } from './repositories/GalleryRepository.ts';
import type { GroupAdminStore } from './repositories/GroupAdminRepository.ts';
import type { HeaderImageStore } from './repositories/HeaderImageFiles.ts';
import type { HomeActivityReader } from './repositories/HomeActivityRepository.ts';
import type { MaintenanceStore } from './repositories/MaintenanceRepository.ts';
import type { MemberSuggestReader } from './repositories/MemberSuggestRepository.ts';
import type { ModerationStore } from './repositories/ModerationRepository.ts';
import type { PostEditStore } from './repositories/PostEditRepository.ts';
import type { PostingStore } from './repositories/PostingRepository.ts';
import type { PostReader } from './repositories/PostRepository.ts';
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
import type { TopicReader, TopicWriter } from './repositories/TopicRepository.ts';
import type { UserAdminReader, UserAdminWriter } from './repositories/UserAdminRepository.ts';
import type { AccountLookup, MemberListReader, ProfileReader } from './repositories/UserRepository.ts';
import type { UsersInfoReader } from './repositories/UsersInfoLoader.ts';
import type { MailTemplateReader } from './services/mail.ts';
import type { OAuthProviderId } from './services/oauth.ts';
import { type BannedWriteQuery, canWriteWhileBanned, readOnlyViewer } from './services/permissions.ts';
import { CLEAN_STATIC_PATHS, idFromSegment, publicPath } from './services/routes.ts';

export type { ForumApp } from './http/server.ts';

export interface AppDeps extends Omit<LayoutDeps, 'views'>, SessionDeps {
	config: ConfigReader;
	members: MemberListReader;
	accounts: AccountLookup;
	/** Connexion de développement (DEV_LOGIN=1), depuis la machine seulement, jamais en production. */
	devLogin: boolean;
	/** Connexion SSO : appels aux fournisseurs, applications OAuth configurées, administrateurs initiaux. */
	oauthClient: OAuthClient;
	oauthProviders: Partial<Record<OAuthProviderId, OAuthCredentials>>;
	adminAccounts: ReadonlySet<string>;
	/** Comptes SSO : création, sessions, suppression par le membre. */
	accountStore: AccountStore;
	/** Liaisons Rate Limiting de Workers ; absentes dans les tests. Connexion (/auth/*), écritures, recherche. */
	authRateLimiter?: RateLimiter;
	writeRateLimiter?: RateLimiter;
	searchRateLimiter?: RateLimiter;
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
	/** Messagerie privée (mod APMS, simplifié) : conversations. */
	privateMessageStore: PrivateMessageStore;
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
	/** Options du forum (admin_options.php) : table config et invalidation des caches. */
	configStore: ConfigStore;
	configCache: ConfigCache;
	/** Catégories et forums (admin_categories.php, admin_forums.php). */
	forumAdmin: ForumAdminStore;
	/** Reconstruction de l'index et élagage (admin_maintenance.php). */
	maintenance: MaintenanceStore;
	/** Préfixes du sujet (topic_prefixes.php, page propre à Node). */
	subjectPrefixes: SubjectPrefixStore;
	/** Complètement des noms de membres (member_suggest.php, propre à Node). */
	memberSuggest: MemberSuggestReader;
	/** Groupes d'utilisateurs (admin_groups.php). */
	groupAdmin: GroupAdminStore;
	/** Recherche d'utilisateurs et d'adresses IP (admin_users.php). */
	userAdmin: UserAdminReader & UserAdminWriter;
	avatars: AvatarLocator;
	avatarStore: AvatarStore;
	censorship: CensorStore;
	stats: StatsReader;
	search: SearchReader;
	searchWriter: SearchWriter;
	feeds: FeedReader;
	gallery: GalleryStore;
	/** Plan du site (sitemap.xml) : forums et discussions lisibles par un invité. */
	sitemap: SitemapReader;
	/** Activité de la semaine affichée à l'accueil (discussions, nouveaux membres, projets). */
	homeActivity: HomeActivityReader;
	/** Logo et bannière de l’en-tête (R2), page Apparence. */
	headerImages: HeaderImageStore;
	/** Fichiers de la galerie (img/gallery/ dans R2). */
	galleryFiles: GalleryFileStore;
	stopwords: StopwordsReader;
	usersInfo: UsersInfoReader;
	/** Gabarits Nunjucks précompilés (src/generated/templates.js). */
	templates: PrecompiledTemplates;
	/** Adresse versionnée d'une ressource de public/assets/ (« css/base.css » → « /assets/css/base.css?v=… »), manifeste du build. */
	assetUrl: (file: string) => string;
	/** Fichiers envoyés (R2) : galerie, avatars, logo, bannière, servis sous /img/. */
	files?: FileStore;
	logger?: Logger;
}

export async function buildApp(input: AppDeps): Promise<ForumApp> {
	const logger = input.logger ?? silentLogger;

	// url('profile.php?id=2') dans les vues : point de passage unique des liens internes, traduits
	// en adresses publiques (« /membre/2 ») par services/routes.ts.
	const url = publicPath;
	const asset = input.assetUrl;
	const deps = { ...input, views: createViews(input.templates, { url, asset }) };

	const app: ForumApp = new Hono();
	useSecurityHeaders(app);
	// Les ressources de public/assets/ sont servies par Workers Static Assets, sans passer par ici.
	// Fichiers envoyés : une semaine (avatars et en-tête changent d'adresse quand ils changent).
	if (deps.files !== undefined) serveStoredFiles(app, '/img/', deps.files, 'public, max-age=604800');
	const router = withCleanPaths(
		createRouter(app, { logger, onError: (error, request, reply) => handleError(error, request, reply, deps) }),
	);

	// Équivalent de common.php : réglages, visiteur et présence, maintenance, bannissements. Déclaré
	// par route (et non globalement) pour que les fichiers statiques ne coûtent aucune requête SQL.
	const session =
		(
			options: {
				quiet?: boolean | ((request: AppRequest) => boolean);
				allowDuringMaintenance?: boolean;
				/** La page présente un formulaire POST à un invité (connexion, rédaction) : cookie CSRF posé. */
				guestForms?: boolean;
			} = {},
		) =>
		async (request: AppRequest, reply: AppReply): Promise<AppReply | undefined> => {
			const now = deps.page.clock();
			request.board = await deps.config.load();
			const quiet = typeof options.quiet === 'function' ? options.quiet(request) : (options.quiet ?? false);
			request.viewer = await startSession(request, reply, deps, request.board, now, { quiet });
			// Un invité ne reçoit le cookie CSRF que là où il peut envoyer un formulaire : les autres pages
			// publiques ne posent aucun cookie et peuvent être mises en cache en bordure (worker.ts).
			request.csrfToken =
				!request.viewer.isGuest || options.guestForms === true
					? ensureCsrfToken(request, reply, deps.cookie, request.viewer.id)
					: existingCsrfToken(request, deps.cookie, request.viewer.id);

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
	const verifyCsrf = async (request: AppRequest, reply: AppReply): Promise<AppReply | undefined> => {
		if (!isValidCsrf(request, deps.cookie, request.viewer.id))
			return renderMessage(request, reply, deps, 403, deps.page.lang.common.badCsrf);
		const { ban } = request.viewer;
		if (ban !== null && !canWriteWhileBanned(request.url.split('?')[0] ?? '', request.query as BannedWriteQuery))
			return renderBlock(request, reply, deps, { kind: 'banned', ...ban });
		return undefined;
	};
	const quietSession = session({ quiet: true });
	// Limitation de débit (liaisons Rate Limiting) : écritures (messages, fichiers, profil, MP) et recherche.
	const writeLimit = rateLimited(deps.writeRateLimiter, 'write', deps);
	const searchLimit = rateLimited(deps.searchRateLimiter, 'search', deps);

	router.notFound([authenticate], async (request, reply) => renderMessage(request, reply, deps, 404, deps.page.lang.common.badRequest));

	// Les navigateurs et les robots demandent /favicon.ico d'office : icône AvroBB (sans session).
	router.get('/favicon.ico', [], async (_request, reply) => reply.redirect(asset('icons/favicon-32.png'), 301));
	const seo = new SeoController(deps);
	router.get('/robots.txt', [], seo.robots);
	router.get('/sitemap.xml', [], seo.sitemap);

	const trackCookieName = trackCookieOf(deps.cookie);
	const index = new IndexController({ ...deps, trackCookieName });
	router.get('/', [authenticate], index.show);
	router.get('/index.php', [authenticate], index.show);

	const forums = new ForumController({ ...deps, trackCookieName });
	router.get<{ Querystring: ForumQuery }>('/viewforum.php', [authenticate], forums.show);

	const search = new SearchController({ ...deps, trackCookieName });
	router.get<{ Querystring: SearchQuery }>('/search.php', [authenticate, searchLimit], search.show);

	const userlist = new UserlistController(deps);
	router.get<{ Querystring: UserlistParams }>('/userlist.php', [authenticate], userlist.show);

	const extern = new ExternController(deps);
	router.get<{ Querystring: ExternQuery }>('/extern.php', [quietSession], extern.show);

	const gallery = new GalleryController(deps);
	router.get<{ Querystring: GalleryQuery }>('/gallery.php', [authenticate], gallery.show);
	router.post<{ Querystring: GalleryQuery; Body: FormBody }>('/gallery.php', [authenticate, verifyCsrf, writeLimit], gallery.submit);

	// login.php : visite discrète dès qu'une action est demandée (PUN_QUIET_VISIT), et accessible en
	// maintenance pour qu'un administrateur puisse se connecter.
	const loginSession = session({
		quiet: (request) => (request.query as LoginQuery).action !== undefined,
		allowDuringMaintenance: true,
		guestForms: true,
	});
	const login = new LoginController(deps);
	router.get<{ Querystring: LoginQuery }>('/login.php', [loginSession], login.show);
	router.post<{ Querystring: LoginQuery; Body: FormBody }>('/login.php', [loginSession, verifyCsrf], (request, reply) => {
		if (request.query.action === 'in') return login.login(request, reply);
		if (request.query.action === 'out') return login.logout(request, reply);
		if (request.query.action === 'out_all') return login.logoutEverywhere(request, reply);
		return renderMessage(request, reply, deps, 400, deps.page.lang.common.badRequest);
	});

	// Connexion SSO : départ vers le fournisseur et retour. Accessible en maintenance, comme login.php.
	const auth = new AuthController(deps);
	const authSession = session({ quiet: true, allowDuringMaintenance: true });
	for (const provider of ['github', 'google'] as const) {
		router.get<{ Querystring: AuthQuery }>(`/auth/${provider}`, [authSession], (request, reply) => auth.start(request, reply, provider));
		router.get<{ Querystring: AuthQuery }>(`/auth/${provider}/callback`, [authSession], (request, reply) =>
			auth.callback(request, reply, provider),
		);
	}

	// misc.php : visite discrète dès qu'une action est demandée (PUN_QUIET_VISIT).
	const miscSession = session({ quiet: (request) => (request.query as MiscQuery).action !== undefined });
	const misc = new MiscController({ ...deps, trackCookieName });
	const contact = new ContactController(deps);
	router.get<{ Querystring: MiscQuery & ContactQuery }>('/misc.php', [miscSession], (request, reply) => {
		if (request.query.email !== undefined) return contact.emailForm(request, reply);
		if (request.query.report !== undefined) return contact.reportForm(request, reply);
		return misc.show(request, reply);
	});
	router.post<{ Querystring: MiscQuery & ContactQuery; Body: FormBody }>('/misc.php', [miscSession, verifyCsrf], (request, reply) => {
		if (request.query.email !== undefined) return contact.sendEmail(request, reply);
		if (request.query.report !== undefined) return contact.sendReport(request, reply);
		if (request.query.action === 'subscribe' || request.query.action === 'unsubscribe') return misc.subscription(request, reply);
		return misc.markRead(request, reply);
	});

	const help = new HelpController(deps);
	router.get('/help.php', [authenticate], help.show);

	const profiles = new ProfileController(deps);
	router.get<{ Querystring: ProfileQuery }>('/profile.php', [authenticate], profiles.show);
	router.post<{ Querystring: ProfileQuery; Body: FormBody }>('/profile.php', [authenticate, verifyCsrf, writeLimit], profiles.submit);

	const moderate = new ModerateController({ ...deps, trackCookieName });
	router.get<{ Querystring: ModerateQuery }>('/moderate.php', [authenticate], moderate.show);
	router.post<{ Querystring: ModerateQuery; Body: FormBody }>('/moderate.php', [authenticate, verifyCsrf], moderate.submit);

	const adminIndex = new AdminIndexController(deps);
	router.get('/admin_index.php', [authenticate], adminIndex.index);
	router.get('/admin_statistics.php', [authenticate], adminIndex.statistics);

	const adminOptions = new AdminOptionsController(deps);
	router.get<{ Querystring: AdminOptionsQuery }>('/admin_options.php', [authenticate], adminOptions.show);
	router.post<{ Body: FormBody }>('/admin_options.php', [authenticate, verifyCsrf], adminOptions.save);

	const adminPermissions = new AdminPermissionsController(deps);
	router.get<{ Querystring: AdminPermissionsQuery }>('/admin_permissions.php', [authenticate], adminPermissions.show);
	router.post<{ Body: FormBody }>('/admin_permissions.php', [authenticate, verifyCsrf], adminPermissions.save);

	const forumAdmin = new ForumAdminController(deps);
	router.get<{ Querystring: AdminCategoriesQuery }>('/admin_categories.php', [authenticate], forumAdmin.showCategories);
	router.post<{ Body: FormBody }>('/admin_categories.php', [authenticate, verifyCsrf], forumAdmin.submitCategories);
	router.get<{ Querystring: AdminForumsQuery }>('/admin_forums.php', [authenticate], forumAdmin.showForums);
	router.post<{ Querystring: AdminForumsQuery; Body: FormBody }>('/admin_forums.php', [authenticate, verifyCsrf], forumAdmin.submitForums);

	const adminGroups = new AdminGroupsController(deps);
	router.get<{ Querystring: AdminGroupsQuery }>('/admin_groups.php', [authenticate], adminGroups.show);
	router.post<{ Querystring: AdminGroupsQuery; Body: FormBody }>('/admin_groups.php', [authenticate, verifyCsrf], adminGroups.submit);

	const adminUsers = new AdminUsersController(deps);
	router.get<{ Querystring: AdminUsersQuery }>('/admin_users.php', [authenticate], adminUsers.show);
	router.post<{ Body: FormBody }>('/admin_users.php', [authenticate, verifyCsrf], adminUsers.submit);

	const adminLoader = new AdminLoaderController(deps);
	router.get<{ Querystring: AdminLoaderQuery }>('/admin_loader.php', [authenticate], adminLoader.show);
	router.post<{ Querystring: AdminLoaderQuery; Body: FormBody }>('/admin_loader.php', [authenticate, verifyCsrf], adminLoader.submit);

	// Pages d'information : même en mode maintenance ou sans droit de lecture du forum.
	const staticPages = new StaticPageController(deps);
	const infoSession = session({ allowDuringMaintenance: true });
	router.get('/terms.php', [infoSession], staticPages.show('terms'));
	router.get('/privacy.php', [infoSession], staticPages.show('privacy'));
	router.get('/faq.php', [infoSession], staticPages.show('faq'));
	router.get('/stats.php', [authenticate], new StatsPageController(deps).show);

	const adminPages = new AdminPagesController(deps);
	router.get<{ Querystring: AdminPagesQuery }>('/admin_pages.php', [authenticate], adminPages.show);
	router.post<{ Body: FormBody }>('/admin_pages.php', [authenticate, verifyCsrf], adminPages.submit);

	const adminAppearance = new AdminAppearanceController(deps);
	router.get<{ Querystring: AdminAppearanceQuery }>('/admin_appearance.php', [authenticate], adminAppearance.show);
	router.post<{ Body: FormBody }>('/admin_appearance.php', [authenticate, verifyCsrf], adminAppearance.submit);

	const adminCensoring = new AdminCensoringController(deps);
	router.get<{ Querystring: AdminCensoringQuery }>('/admin_censoring.php', [authenticate], adminCensoring.show);
	router.post<{ Body: FormBody }>('/admin_censoring.php', [authenticate, verifyCsrf], adminCensoring.submit);

	const adminBans = new AdminBansController(deps);
	router.get<{ Querystring: AdminBansQuery }>('/admin_bans.php', [authenticate], adminBans.show);
	router.post<{ Querystring: AdminBansQuery; Body: FormBody }>('/admin_bans.php', [authenticate, verifyCsrf], adminBans.submit);

	const adminMaintenance = new AdminMaintenanceController(deps);
	router.get<{ Querystring: AdminMaintenanceQuery }>('/admin_maintenance.php', [authenticate], adminMaintenance.show);
	router.post<{ Body: FormBody }>('/admin_maintenance.php', [authenticate, verifyCsrf], adminMaintenance.submit);

	const subjectPrefixes = new SubjectPrefixController(deps);
	router.get<{ Querystring: SubjectPrefixQuery }>('/topic_prefixes.php', [authenticate], subjectPrefixes.show);
	router.post<{ Querystring: SubjectPrefixQuery; Body: FormBody }>(
		'/topic_prefixes.php',
		[authenticate, verifyCsrf],
		subjectPrefixes.submit,
	);

	const memberSuggest = new MemberSuggestController(deps);
	router.get<{ Querystring: MemberSuggestQuery }>('/member_suggest.php', [authenticate], memberSuggest.suggest);

	const adminReports = new AdminReportsController(deps);
	router.get<{ Querystring: AdminReportsQuery }>('/admin_reports.php', [authenticate], adminReports.show);
	router.post<{ Body: FormBody }>('/admin_reports.php', [authenticate, verifyCsrf], adminReports.zap);

	const reputation = new ReputationController(deps);
	router.get<{ Querystring: ReputationQuery }>('/reputation.php', [authenticate], reputation.show);
	router.post<{ Querystring: ReputationQuery; Body: FormBody }>('/reputation.php', [authenticate, verifyCsrf], reputation.submit);

	const pms = new PrivateMessageController(deps);
	router.get<{ Querystring: PrivateMessageQuery }>('/pms_inbox.php', [authenticate], (request, reply) => pms.inbox(request, reply));
	router.post<{ Querystring: PrivateMessageQuery; Body: FormBody }>('/pms_inbox.php', [authenticate, verifyCsrf], pms.inboxAction);
	router.get<{ Querystring: PrivateMessageQuery }>('/pms_view.php', [authenticate], pms.view);
	router.post<{ Querystring: PrivateMessageQuery; Body: FormBody }>('/pms_view.php', [authenticate, verifyCsrf], pms.delete);

	const pmSend = new PrivateMessageSendController(deps);
	router.get<{ Querystring: PrivateMessageSendQuery }>('/pms_send.php', [authenticate], pmSend.form);
	router.post<{ Querystring: PrivateMessageSendQuery; Body: FormBody }>(
		'/pms_send.php',
		[authenticate, verifyCsrf, writeLimit],
		pmSend.send,
	);

	const post = new PostController({ ...deps, trackCookieName });
	// Rédaction : formulaire présenté à un invité si son groupe peut écrire (désactivé dans AvroBB).
	router.get<{ Querystring: PostQuery }>('/post.php', [session({ guestForms: true })], post.show);
	router.post<{ Querystring: PostQuery; Body: FormBody }>('/post.php', [authenticate, verifyCsrf, writeLimit], (request, reply) =>
		request.query.brouillon !== undefined ? post.publishDraft(request, reply) : post.submit(request, reply),
	);

	const edit = new EditController(deps);
	router.get<{ Querystring: EditQuery }>('/edit.php', [authenticate], edit.show);
	router.post<{ Querystring: EditQuery; Body: FormBody }>('/edit.php', [authenticate, verifyCsrf, writeLimit], edit.submit);

	const drafts = new DraftController(deps);
	router.get<{ Querystring: DraftQuery }>('/draft_list.php', [authenticate], drafts.list);
	router.post<{ Body: FormBody }>('/draft_list.php', [authenticate, verifyCsrf], drafts.remove);
	router.get<{ Querystring: DraftQuery }>('/draft_edit.php', [authenticate], drafts.edit);
	router.post<{ Querystring: DraftQuery; Body: FormBody }>('/draft_edit.php', [authenticate, verifyCsrf], drafts.save);

	const deletion = new DeleteController(deps);
	router.get<{ Querystring: DeleteQuery }>('/delete.php', [authenticate], deletion.show);
	router.post<{ Querystring: DeleteQuery; Body: FormBody }>('/delete.php', [authenticate, verifyCsrf], deletion.confirm);

	const topics = new TopicController({ ...deps, topicViews: deps.topicWriter, trackCookieName });
	router.get<{ Querystring: TopicQuery }>('/viewtopic.php', [authenticate], topics.show);

	// Adresses propres à numéro (services/routes.ts) : le numéro et la page deviennent `id`/`pid` et
	// `p`, comme dans les anciennes adresses ; le slug n'est pas vérifié (seul le numéro compte).
	const byId =
		(name: 'id' | 'pid') =>
		(params: Readonly<Record<string, string>>): Record<string, string> | null => {
			const id = idFromSegment(params.ref);
			if (id === null) return null;
			if (params.page === undefined) return { [name]: String(id) };
			return /^\d{1,6}$/.test(params.page) ? { [name]: String(id), p: params.page } : null;
		};
	router.get<{ Querystring: ForumQuery }>('/forum/:ref', [authenticate], forums.show, byId('id'));
	router.get<{ Querystring: ForumQuery }>('/forum/:ref/page/:page', [authenticate], forums.show, byId('id'));
	router.get<{ Querystring: TopicQuery }>('/sujet/:ref', [authenticate], topics.show, byId('id'));
	router.get<{ Querystring: TopicQuery }>('/sujet/:ref/page/:page', [authenticate], topics.show, byId('id'));
	router.get<{ Querystring: TopicQuery }>('/message/:ref', [authenticate], topics.show, byId('pid'));
	router.get<{ Querystring: ProfileQuery }>('/membre/:ref', [authenticate], profiles.show, byId('id'));

	return app;
}

/**
 * Routeur qui enregistre aussi l'adresse propre d'une page sans paramètre (« /aide » pour
 * help.php, services/routes.ts). L'ancienne adresse reste servie, sans redirection : plus aucun
 * lien ne la produit, et l'URL canonique désigne la nouvelle.
 */
function withCleanPaths(router: Router): Router {
	const clean = new Map(CLEAN_STATIC_PATHS.map(([path, legacy]) => [`/${legacy}`, path]));
	return {
		get: (path, preHandlers, handler, params) => {
			router.get(path, preHandlers, handler, params);
			const alias = clean.get(path);
			if (alias !== undefined) router.get(alias, preHandlers, handler, params);
		},
		post: (path, preHandlers, handler, params) => {
			router.post(path, preHandlers, handler, params);
			const alias = clean.get(path);
			if (alias !== undefined) router.post(alias, preHandlers, handler, params);
		},
		notFound: (preHandlers, handler) => router.notFound(preHandlers, handler),
	};
}

/**
 * Erreurs non prévues par les contrôleurs : page d'information avec un texte générique, détail
 * technique seulement dans le journal (ni SQL, ni chemin, ni pile d'appels vers le navigateur).
 */
async function handleError(
	error: unknown,
	request: AppRequest,
	reply: AppReply,
	deps: Omit<LayoutDeps, 'views'> & Pick<LayoutDeps, 'views'>,
): Promise<AppReply> {
	const { lang } = deps.page;
	// Formulaire trop gros, illisible ou d'un type inconnu : refus du client (4xx) ; tout le reste est un incident.
	const status = error instanceof FormError ? error.statusCode : 500;
	const message = status === 500 ? lang.common.serverError : lang.common.badRequest;

	if (status === 500) request.log.error({ err: error }, 'Erreur pendant le traitement de la requête');
	else request.log.info({ err: error }, 'Requête refusée');

	// viewer et board valent null si l'erreur est survenue avant ou pendant l'authentification.
	const authenticated = (request.viewer as Viewer | null) !== null && (request.board as BoardConfig | null) !== null;

	if (authenticated) {
		try {
			return await renderMessage(request, reply, deps, status, message);
		} catch (renderError) {
			request.log.error({ err: renderError }, "Échec du rendu de la page d'erreur");
		}
	}

	return renderMinimalMessage(deps.views, reply, lang, status, message);
}
