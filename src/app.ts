/**
 * Assemblage de l'application Fastify. Les dépendances (repositories…) sont passées en paramètre :
 * server.ts fournit les vraies, les tests des doublures en mémoire.
 */

import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import Fastify, { type FastifyInstance } from 'fastify';
import nunjucks from 'nunjucks';
import { TopicController } from './controllers/TopicController.ts';
import type { Viewer } from './domain/models.ts';
import type { PageContext } from './http/layout.ts';
import { resolveViewer } from './http/session.ts';
import type { ConfigReader } from './repositories/ConfigRepository.ts';
import type { PostReader } from './repositories/PostRepository.ts';
import type { TopicReader } from './repositories/TopicRepository.ts';
import type { UserReader } from './repositories/UserRepository.ts';
import type { AvatarLocator } from './services/avatars.ts';

declare module 'fastify' {
	interface FastifyRequest {
		viewer: Viewer;
	}
}

export interface AppDeps {
	config: ConfigReader;
	users: UserReader;
	topics: TopicReader;
	posts: PostReader;
	avatars: AvatarLocator;
	page: PageContext;
	legacyCookie: { name: string; seed: string };
	/** Dossier servi sous /style (feuilles de style FluxBB). */
	styleDir: string;
	/** URL de l'installation PHP : les liens vers les pages non portées y renvoient. */
	legacyBaseUrl: string;
	logger?: boolean;
}

/** Pages déjà servies par Node ; les autres liens partent vers l'installation PHP. */
const PORTED_PAGES = new Set(['viewtopic.php']);

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
	const app = Fastify({ logger: deps.logger ?? false });

	const viewsDir = path.join(import.meta.dirname, 'views');

	// url('profile.php?id=2') : lien local si la page est portée, sinon vers l'installation PHP.
	// Les URL absolues (http:, mailto:…) sont laissées telles quelles.
	const url = (target: string): string => {
		const page = target.split(/[?#]/)[0] ?? '';
		const keep = /^[a-z][a-z0-9+.-]*:/i.test(target) || PORTED_PAGES.has(page) || deps.legacyBaseUrl === '';
		return keep ? target : `${deps.legacyBaseUrl}/${target}`;
	};

	await app.register(fastifyCookie);
	await app.register(fastifyView, {
		engine: { nunjucks },
		root: viewsDir,
		options: {
			autoescape: true,
			throwOnUndefined: true,
			onConfigure: (env: nunjucks.Environment) => env.addGlobal('url', url),
		},
	});
	await app.register(fastifyStatic, { root: path.resolve(deps.styleDir), prefix: '/style/' });

	app.decorateRequest('viewer', null as unknown as Viewer);
	app.addHook('preHandler', async (request) => {
		request.viewer = await resolveViewer(
			request.cookies[deps.legacyCookie.name],
			deps.users,
			deps.legacyCookie.seed,
			deps.page.clock(),
		);
	});

	const topics = new TopicController(deps);
	app.get('/viewtopic.php', topics.show);

	return app;
}
