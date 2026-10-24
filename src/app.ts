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
import { TopicController, type TopicQuery } from './controllers/TopicController.ts';
import type { BoardConfig, Viewer } from './domain/models.ts';
import { ASSETS_PREFIX, createAssetUrl } from './http/assets.ts';
import { type LayoutDeps, renderMessage, renderMinimalMessage } from './http/layout.ts';
import { resolveViewer } from './http/session.ts';
import type { ConfigReader } from './repositories/ConfigLoader.ts';
import type { PostReader } from './repositories/PostRepository.ts';
import type { TopicReader } from './repositories/TopicRepository.ts';
import type { UserReader } from './repositories/UserRepository.ts';
import type { AvatarLocator } from './services/avatars.ts';

declare module 'fastify' {
	interface FastifyRequest {
		/** Utilisateur courant ; null tant que le hook d'authentification n'a pas abouti. */
		viewer: Viewer;
		/** Réglages du forum chargés pour cette requête. */
		board: BoardConfig;
	}
}

export interface AppDeps extends LayoutDeps {
	config: ConfigReader;
	users: UserReader;
	topics: TopicReader;
	posts: PostReader;
	avatars: AvatarLocator;
	legacyCookie: { name: string; seed: string };
	/** URL de l'installation PHP : les liens vers les pages non portées y renvoient. */
	legacyBaseUrl: string;
	/** Derrière un reverse proxy : l'IP du client est lue dans X-Forwarded-For. */
	trustProxy?: boolean;
	logger?: boolean;
}

/** Pages déjà servies par Node ; les autres liens partent vers l'installation PHP. */
const PORTED_PAGES = new Set(['viewtopic.php']);

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

	// Équivalent de common.php : réglages du forum puis utilisateur courant. Déclaré par route
	// (et non globalement) pour que les fichiers statiques ne coûtent aucune requête SQL.
	const authenticate = async (request: FastifyRequest): Promise<void> => {
		request.board = await deps.config.load();
		request.viewer = await resolveViewer(request.cookies[deps.legacyCookie.name], deps.users, deps.legacyCookie.seed, deps.page.clock());
	};

	app.setErrorHandler((error: FastifyError, request, reply) => handleError(error, request, reply, deps));
	app.setNotFoundHandler({ preHandler: authenticate }, (request, reply) =>
		renderMessage(request, reply, deps, 404, deps.page.lang.common.badRequest),
	);

	const topics = new TopicController(deps);
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
