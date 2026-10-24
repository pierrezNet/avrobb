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
import type { Mailer } from './adapters/mailer.ts';
import { DeleteController, type DeleteQuery } from './controllers/DeleteController.ts';
import { EditController, type EditQuery } from './controllers/EditController.ts';
import { ExternController, type ExternQuery } from './controllers/ExternController.ts';
import { ForumController, type ForumQuery } from './controllers/ForumController.ts';
import { GalleryController, type GalleryQuery } from './controllers/GalleryController.ts';
import { HelpController } from './controllers/HelpController.ts';
import { IndexController } from './controllers/IndexController.ts';
import { LoginController, type LoginQuery } from './controllers/LoginController.ts';
import { MiscController, type MiscQuery } from './controllers/MiscController.ts';
import { PasswordResetController } from './controllers/PasswordResetController.ts';
import { PostController, type PostQuery } from './controllers/PostController.ts';
import { ProfileController, type ProfileQuery } from './controllers/ProfileController.ts';
import { RegisterController, type RegisterQuery } from './controllers/RegisterController.ts';
import { SearchController, type SearchQuery } from './controllers/SearchController.ts';
import { TopicController, type TopicQuery } from './controllers/TopicController.ts';
import { UserlistController, type UserlistParams } from './controllers/UserlistController.ts';
import type { BoardConfig, Viewer } from './domain/models.ts';
import { ASSETS_PREFIX, createAssetUrl } from './http/assets.ts';
import { ensureCsrfToken, isValidCsrf } from './http/csrf.ts';
import { type FormBody, registerFormParser } from './http/forms.ts';
import { type LayoutDeps, renderBlock, renderMessage, renderMinimalMessage } from './http/layout.ts';
import { checkAccess, purgeOnline, type SessionDeps, startSession } from './http/session.ts';
import type { CensorReader } from './repositories/CensorRepository.ts';
import type { ConfigReader } from './repositories/ConfigLoader.ts';
import type { FeedReader } from './repositories/FeedRepository.ts';
import type { GalleryReader } from './repositories/GalleryRepository.ts';
import type { MailTemplateReader } from './repositories/MailTemplateFiles.ts';
import type { PostEditStore } from './repositories/PostEditRepository.ts';
import type { PostingStore } from './repositories/PostingRepository.ts';
import type { PostReader } from './repositories/PostRepository.ts';
import type { RegistrationStore } from './repositories/RegistrationRepository.ts';
import type { SearchReader } from './repositories/SearchRepository.ts';
import type { StatsReader } from './repositories/StatsRepository.ts';
import type { StopwordsReader } from './repositories/StopwordsLoader.ts';
import type { ToolbarReader } from './repositories/ToolbarRepository.ts';
import type { TopicLabelReader } from './repositories/TopicLabelRepository.ts';
import type { TopicReader, TopicWriter } from './repositories/TopicRepository.ts';
import type { CredentialsStore, MemberListReader, PasswordResetStore, ProfileReader } from './repositories/UserRepository.ts';
import type { UsersInfoReader } from './repositories/UsersInfoLoader.ts';
import type { AvatarLocator } from './services/avatars.ts';

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
	credentials: CredentialsStore;
	passwordResets: PasswordResetStore;
	mailTemplates: MailTemplateReader;
	mailer: Mailer;
	registrations: RegistrationStore;
	profiles: ProfileReader;
	topics: TopicReader;
	topicWriter: TopicWriter;
	posts: PostReader;
	posting: PostingStore;
	postEdits: PostEditStore;
	toolbar: ToolbarReader;
	avatars: AvatarLocator;
	censorship: CensorReader;
	topicLabels: TopicLabelReader;
	stats: StatsReader;
	search: SearchReader;
	feeds: FeedReader;
	gallery: GalleryReader;
	stopwords: StopwordsReader;
	usersInfo: UsersInfoReader;
	/** URL de l'installation PHP : les liens vers les pages non portées y renvoient. */
	legacyBaseUrl: string;
	/** Derrière un reverse proxy : l'IP du client est lue dans X-Forwarded-For. */
	trustProxy?: boolean;
	logger?: boolean;
}

/** Pages déjà servies par Node ; les autres liens partent vers l'installation PHP. */
const PORTED_PAGES = new Set([
	'delete.php',
	'edit.php',
	'extern.php',
	'gallery.php',
	'help.php',
	'index.php',
	'login.php',
	'misc.php',
	'post.php',
	'profile.php',
	'register.php',
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
			request.csrfToken = ensureCsrfToken(request, reply, deps.legacyCookie, request.viewer.id);

			const block = await checkAccess(request, deps, request.viewer, request.board, now, options.allowDuringMaintenance ?? false);
			if (block !== null) return renderBlock(request, reply, deps, block);

			await purgeOnline(deps, request.board, now);
			return undefined;
		};
	const authenticate = session();
	/** Formulaires POST : session puis jeton CSRF (403 sinon), avant toute écriture. */
	const verifyCsrf = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> =>
		isValidCsrf(request, deps.legacyCookie, request.viewer.id)
			? undefined
			: renderMessage(request, reply, deps, 403, deps.page.lang.common.badCsrf);
	const quietSession = session({ quiet: true });

	app.setErrorHandler((error: FastifyError, request, reply) => handleError(error, request, reply, deps));
	app.setNotFoundHandler({ preHandler: authenticate }, (request, reply) =>
		renderMessage(request, reply, deps, 404, deps.page.lang.common.badRequest),
	);

	const trackCookieName = `${deps.legacyCookie.name}_track`;
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

	// login.php : visite discrète dès qu'une action est demandée (PUN_QUIET_VISIT), et accessible en
	// maintenance pour qu'un administrateur puisse se connecter (le PHP le bloquait aussi).
	const loginSession = session({ quiet: (request) => (request.query as LoginQuery).action !== undefined, allowDuringMaintenance: true });
	const login = new LoginController(deps);
	const passwordReset = new PasswordResetController(deps);
	const isForget = (action: string | undefined): boolean => action === 'forget' || action === 'forget_2';
	app.get<{ Querystring: LoginQuery }>('/login.php', { preHandler: loginSession }, (request, reply) =>
		isForget(request.query.action) ? passwordReset.form(request, reply) : login.show(request, reply),
	);
	app.post<{ Querystring: LoginQuery; Body: FormBody }>('/login.php', { preHandler: [loginSession, verifyCsrf] }, (request, reply) => {
		if (request.query.action === 'in') return login.login(request, reply);
		if (isForget(request.query.action)) return passwordReset.submit(request, reply);
		return renderMessage(request, reply, deps, 400, deps.page.lang.common.badRequest);
	});

	// misc.php : visite discrète dès qu'une action est demandée (PUN_QUIET_VISIT).
	const miscSession = session({ quiet: (request) => (request.query as MiscQuery).action !== undefined });
	const misc = new MiscController({ ...deps, trackCookieName });
	app.get<{ Querystring: MiscQuery }>('/misc.php', { preHandler: miscSession }, misc.show);
	app.post<{ Querystring: MiscQuery; Body: FormBody }>('/misc.php', { preHandler: [miscSession, verifyCsrf] }, misc.markRead);

	const register = new RegisterController(deps);
	app.get<{ Querystring: RegisterQuery }>('/register.php', { preHandler: authenticate }, register.show);
	app.post<{ Querystring: RegisterQuery; Body: FormBody }>('/register.php', { preHandler: [authenticate, verifyCsrf] }, register.submit);

	const help = new HelpController(deps);
	app.get('/help.php', { preHandler: authenticate }, help.show);

	const profiles = new ProfileController(deps);
	app.get<{ Querystring: ProfileQuery }>('/profile.php', { preHandler: authenticate }, profiles.show);

	const post = new PostController({ ...deps, trackCookieName });
	app.get<{ Querystring: PostQuery }>('/post.php', { preHandler: authenticate }, post.show);
	app.post<{ Querystring: PostQuery; Body: FormBody }>('/post.php', { preHandler: [authenticate, verifyCsrf] }, post.submit);

	const edit = new EditController(deps);
	app.get<{ Querystring: EditQuery }>('/edit.php', { preHandler: authenticate }, edit.show);
	app.post<{ Querystring: EditQuery; Body: FormBody }>('/edit.php', { preHandler: [authenticate, verifyCsrf] }, edit.submit);

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
