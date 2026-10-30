/**
 * Point d'entrée du Worker Cloudflare : câble les vraies dépendances à partir des liaisons (`env.DB`
 * pour D1, `env.FILES` pour R2, `env.ASSETS` pour les ressources statiques) et des variables, puis
 * sert l'application Hono. Les ressources de public/assets/ sont servies par Workers Static Assets
 * sans passer par ici.
 *
 * L'application est construite à la première requête de l'isolat, puis réutilisée : rien n'est
 * calculé au chargement du module.
 */

import { createAssetUrl } from './adapters/assetUrls.ts';
import { DohHostResolver } from './adapters/hostResolver.ts';
import { LogMailer } from './adapters/mailer.ts';
import { buildApp, type ForumApp } from './app.ts';
import { loadConfig } from './config.ts';
import { ScheduledTasks } from './controllers/ScheduledTasks.ts';
import type { D1Database } from './db/d1.ts';
import { createDatabase, type Db } from './db/database.ts';
import assetManifest from './generated/assets.js';
import templates from './generated/templates.js';
import { type EdgeCache, withEdgeCache } from './http/edgeCache.ts';
import { consoleLogger } from './http/log.ts';
import { fr, frDateWords } from './lang/fr/index.ts';
import { mail } from './lang/fr/mail.ts';
import { AdminStatsRepository } from './repositories/AdminStatsRepository.ts';
import { AvatarFiles } from './repositories/AvatarFiles.ts';
import { BanRepository } from './repositories/BanRepository.ts';
import { CensorRepository } from './repositories/CensorRepository.ts';
import { ConfigLoader } from './repositories/ConfigLoader.ts';
import { ConfigRepository } from './repositories/ConfigRepository.ts';
import { ContactRepository } from './repositories/ContactRepository.ts';
import { DraftRepository } from './repositories/DraftRepository.ts';
import { FeedRepository } from './repositories/FeedRepository.ts';
import { FileReferenceRepository } from './repositories/FileReferenceRepository.ts';
import { type R2BucketLike, R2FileStore } from './repositories/FileStore.ts';
import { ForumAdminRepository } from './repositories/ForumAdminRepository.ts';
import { ForumRepository } from './repositories/ForumRepository.ts';
import { GalleryFiles } from './repositories/GalleryFiles.ts';
import { GalleryRepository } from './repositories/GalleryRepository.ts';
import { GroupAdminRepository } from './repositories/GroupAdminRepository.ts';
import { HeaderImageFiles } from './repositories/HeaderImageFiles.ts';
import { HomeActivityRepository } from './repositories/HomeActivityRepository.ts';
import { MaintenanceRepository } from './repositories/MaintenanceRepository.ts';
import { MemberSuggestRepository } from './repositories/MemberSuggestRepository.ts';
import { ModerationRepository } from './repositories/ModerationRepository.ts';
import { OnlineRepository } from './repositories/OnlineRepository.ts';
import { PostEditRepository } from './repositories/PostEditRepository.ts';
import { PostingRepository } from './repositories/PostingRepository.ts';
import { PostRepository } from './repositories/PostRepository.ts';
import { PrivateMessageRepository } from './repositories/PrivateMessageRepository.ts';
import { ProfileRepository } from './repositories/ProfileRepository.ts';
import { ReportRepository } from './repositories/ReportRepository.ts';
import { ReputationRepository } from './repositories/ReputationRepository.ts';
import { SearchRepository } from './repositories/SearchRepository.ts';
import { SitemapRepository } from './repositories/SitemapRepository.ts';
import { StatsRepository } from './repositories/StatsRepository.ts';
import { BuiltinStopwords } from './repositories/StopwordsLoader.ts';
import { SubjectPrefixRepository } from './repositories/SubjectPrefixRepository.ts';
import { SubscriptionRepository } from './repositories/SubscriptionRepository.ts';
import { TopicRepository } from './repositories/TopicRepository.ts';
import { UserAdminRepository } from './repositories/UserAdminRepository.ts';
import { UserRepository } from './repositories/UserRepository.ts';
import { UsersInfoLoader } from './repositories/UsersInfoLoader.ts';

/** Liaison Static Assets (sous-ensemble de Fetcher). */
interface AssetsBinding {
	fetch(request: Request | string): Promise<Response>;
}

/** Liaisons et variables du Worker (wrangler.jsonc, secrets, .dev.vars). */
export interface Env {
	DB: D1Database;
	FILES: R2BucketLike;
	ASSETS: AssetsBinding;
	SESSION_SECRET?: string;
	COOKIE_SECURE?: string;
	DEV_LOGIN?: string;
}

/** Sous-ensemble d'ExecutionContext. */
interface ExecutionContextLike {
	waitUntil(promise: Promise<unknown>): void;
}

/** Cache par défaut de Cloudflare (absent des types de la bibliothèque standard). */
declare const caches: { default: EdgeCache };

const clock = (): number => Math.floor(Date.now() / 1000);

/** Dépendances partagées par les requêtes d'un isolat (caches courts de la configuration, des avatars…). */
interface Services {
	db: Db;
	files: R2FileStore;
	configLoader: ConfigLoader;
	online: OnlineRepository;
}

function createServices(env: Env): Services {
	const db = createDatabase(env.DB);
	const configStore = new ConfigRepository(db);
	return { db, files: new R2FileStore(env.FILES), configLoader: new ConfigLoader(configStore, clock), online: new OnlineRepository(db) };
}

/** Image d'AvroBB de public/assets/, lue dans Static Assets (image précédente du premier envoi). */
function defaultImageLoader(env: Env) {
	return async (assetPath: string): Promise<{ data: Uint8Array; contentType: string } | null> => {
		const response = await env.ASSETS.fetch(`https://assets.invalid/assets/${assetPath}`);
		if (!response.ok) return null;
		return { data: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'image/png' };
	};
}

async function createApp(env: Env, services: Services): Promise<ForumApp> {
	const config = loadConfig(env as unknown as Readonly<Record<string, unknown>>);
	const { db, files, configLoader } = services;

	const stats = new StatsRepository(db);
	const users = new UserRepository(db);
	const topics = new TopicRepository(db);
	const reports = new ReportRepository(db);
	const search = new SearchRepository(db);
	const avatars = new AvatarFiles(files, clock);
	const privateMessages = new PrivateMessageRepository(db);
	const bans = new BanRepository(db);
	const configStore = new ConfigRepository(db);

	return buildApp({
		config: configLoader,
		configStore,
		configCache: configLoader,
		forumAdmin: new ForumAdminRepository(db),
		maintenance: new MaintenanceRepository(db),
		subjectPrefixes: new SubjectPrefixRepository(db),
		memberSuggest: new MemberSuggestRepository(db),
		groupAdmin: new GroupAdminRepository(db),
		userAdmin: new UserAdminRepository(db),
		users,
		members: users,
		accounts: users,
		devLogin: config.devLogin,
		mailTemplates: { load: async (name) => mail[name] },
		mailer: new LogMailer(consoleLogger),
		profiles: users,
		profileStore: new ProfileRepository(db),
		topics,
		topicWriter: topics,
		posts: new PostRepository(db),
		posting: new PostingRepository(db),
		postEdits: new PostEditRepository(db),
		drafts: new DraftRepository(db),
		subscriptions: new SubscriptionRepository(db),
		reputation: new ReputationRepository(db),
		moderation: new ModerationRepository(db),
		hostResolver: new DohHostResolver(),
		contacts: new ContactRepository(db),
		reportWriter: reports,
		reportStore: reports,
		adminStats: new AdminStatsRepository(db),
		forums: new ForumRepository(db),
		reports,
		privateMessages,
		privateMessageStore: privateMessages,
		bans,
		banStore: bans,
		online: services.online,
		censorship: new CensorRepository(db),
		stats,
		search,
		searchWriter: search,
		feeds: new FeedRepository(db),
		gallery: new GalleryRepository(db),
		galleryFiles: new GalleryFiles(files),
		headerImages: new HeaderImageFiles(files, defaultImageLoader(env)),
		homeActivity: new HomeActivityRepository(db),
		sitemap: new SitemapRepository(db),
		stopwords: new BuiltinStopwords(),
		usersInfo: new UsersInfoLoader(stats, clock),
		avatars,
		avatarStore: avatars,
		page: { lang: fr, dateWords: frDateWords, clock },
		cookie: config.cookie,
		templates,
		assetUrl: createAssetUrl(assetManifest),
		files,
		logger: consoleLogger,
	});
}

let services: Services | undefined;
let app: Promise<ForumApp> | undefined;

function isolateServices(env: Env): Services {
	services ??= createServices(env);
	return services;
}

function forumApp(env: Env): Promise<ForumApp> {
	if (app === undefined) {
		const created = createApp(env, isolateServices(env));
		app = created;
		// Une erreur de configuration (secret manquant…) ne reste pas en mémoire : on réessaiera.
		created.catch(() => {
			if (app === created) app = undefined;
		});
	}
	return app;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
		const forum = await forumApp(env);
		return withEdgeCache(
			request,
			caches.default,
			(promise) => ctx.waitUntil(promise),
			async () => forum.fetch(request, {}),
		);
	},

	async scheduled(_controller: unknown, env: Env, ctx: ExecutionContextLike): Promise<void> {
		const { db, files, configLoader, online } = isolateServices(env);
		const tasks = new ScheduledTasks({
			config: configLoader,
			online,
			files,
			fileReferences: new FileReferenceRepository(db),
			clock,
			logger: consoleLogger,
		});
		ctx.waitUntil(tasks.run());
	},
};
