/**
 * Point d'entrée du Worker Cloudflare : câble les vraies dépendances à partir des liaisons (`env.DB`
 * pour D1, `env.FILES` pour R2, `env.ASSETS` pour les ressources statiques) et des variables, puis
 * sert l'application Hono. Les ressources de public/assets/ sont servies par Workers Static Assets
 * sans passer par ici.
 *
 * L'application est construite à la première requête de l'isolat, puis réutilisée : rien n'est
 * calculé au chargement du module.
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { ExecutionContext } from 'hono';
import { createAssetUrl } from './adapters/assetUrls.ts';
import { DohHostResolver } from './adapters/hostResolver.ts';
import { LogMailer, type Mailer, ResendMailer } from './adapters/mailer.ts';
import { FetchOAuthClient } from './adapters/oauth.ts';
import { type AiBinding, WorkersAiTextModel } from './adapters/textModel.ts';
import { buildApp, type ForumApp } from './app.ts';
import { loadConfig } from './config.ts';
import { AppFeedbackController, type AppFeedbackResult } from './controllers/AppFeedbackController.ts';
import type { RateLimiter } from './controllers/AuthController.ts';
import { ScheduledTasks, type ScheduledTasksDeps } from './controllers/ScheduledTasks.ts';
import type { D1Database } from './db/d1.ts';
import { createDatabase, type Db } from './db/database.ts';
import type { FeedbackSourceId } from './domain/models.ts';
import assetManifest from './generated/assets.js';
import templates from './generated/templates.js';
import { type EdgeCache, withEdgeCache } from './http/edgeCache.ts';
import { consoleLogger } from './http/log.ts';
import { en, enDateWords } from './lang/en/index.ts';
import { fr, frDateWords } from './lang/fr/index.ts';
import { mail } from './lang/fr/mail.ts';
import { AccountRepository } from './repositories/AccountRepository.ts';
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
import { TranslationRepository } from './repositories/TranslationRepository.ts';
import { UserAdminRepository } from './repositories/UserAdminRepository.ts';
import { UserRepository } from './repositories/UserRepository.ts';
import { UsersInfoLoader } from './repositories/UsersInfoLoader.ts';
import { delocalizePath, type Locale, localizePath } from './services/routes.ts';

/** Liaison Static Assets (sous-ensemble de Fetcher). */
interface AssetsBinding {
	fetch(request: Request | string): Promise<Response>;
}

/** Liaisons et variables du Worker (wrangler.jsonc, secrets, .dev.vars). */
export interface Env {
	DB: D1Database;
	FILES: R2BucketLike;
	ASSETS: AssetsBinding;
	/** Limite de tentatives de connexion SSO (liaison Rate Limiting). */
	AUTH_LIMITER?: RateLimiter;
	/** Écritures (messages, fichiers, profil, MP) et recherche. */
	WRITE_LIMITER?: RateLimiter;
	SEARCH_LIMITER?: RateLimiter;
	SESSION_SECRET?: string;
	COOKIE_SECURE?: string;
	DEV_LOGIN?: string;
	ENVIRONMENT?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	ADMIN_ACCOUNTS?: string;
	/** Workers AI (wrangler.jsonc, « ai ») : traduction automatique du contenu ; absente, rien n'est traduit. */
	AI?: AiBinding;
	RESEND_API_KEY?: string;
	MAIL_FROM?: string;
}

/** Sous-ensemble d'ExecutionContext (celui de Hono : waitUntil, passThroughOnException). */
type ExecutionContextLike = ExecutionContext;

/** Cache par défaut de Cloudflare (absent des types de la bibliothèque standard). */
declare const caches: { default: EdgeCache };

const clock = (): number => Math.floor(Date.now() / 1000);
/** Déclencheur horaire de wrangler.jsonc (traductions) ; l'autre est celui de la nuit. */
const HOURLY_CRON = '7 * * * *';
/** Préfixe des cookies du forum (config.ts, CookieConfig.name) : un visiteur qui en porte un n'est pas servi par le cache. */
const COOKIE_PREFIX = 'avrobb';

/** Dépendances partagées par les requêtes d'un isolat (caches courts de la configuration, des avatars…). */
interface Services {
	db: Db;
	files: R2FileStore;
	configLoader: ConfigLoader;
	online: OnlineRepository;
}

/** Envoi d'e-mails : Resend si la clé est configurée, sinon le journal. */
function createMailer(config: ReturnType<typeof loadConfig>): Mailer {
	return config.mail !== null ? new ResendMailer(config.mail.apiKey, config.mail.from) : new LogMailer(consoleLogger);
}

/** Traduction automatique : modèle de Workers AI et table translations, ou null sans liaison AI. */
function createTranslation(env: Env, db: Db): ScheduledTasksDeps['translation'] {
	if (env.AI === undefined) return null;
	const { configLoader } = isolateServices(env);
	return {
		model: new WorkersAiTextModel(env.AI, consoleLogger),
		translations: new TranslationRepository(db),
		// Nom du forum et projets (balises de sujet) : des noms propres, jamais traduits.
		keepNames: async () => {
			const config = await configLoader.load();
			return [config.boardTitle, 'AvroBB', ...config.subjectTags.filter((tag) => tag.group === 'project').map((tag) => tag.name)];
		},
		clock,
		logger: consoleLogger,
	};
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

async function createApp(env: Env, services: Services, locale: Locale): Promise<ForumApp> {
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
		oauthClient: new FetchOAuthClient(),
		oauthProviders: config.oauth,
		adminAccounts: config.adminAccounts,
		accountStore: new AccountRepository(db),
		...(env.AUTH_LIMITER !== undefined ? { authRateLimiter: env.AUTH_LIMITER } : {}),
		...(env.WRITE_LIMITER !== undefined ? { writeRateLimiter: env.WRITE_LIMITER } : {}),
		...(env.SEARCH_LIMITER !== undefined ? { searchRateLimiter: env.SEARCH_LIMITER } : {}),
		mailTemplates: { load: async (name) => mail[name] },
		mailer: createMailer(config),
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
		translations: new TranslationRepository(db),
		manualTranslations: new TranslationRepository(db),
		translationJob: createTranslation(env, db),
		usersInfo: new UsersInfoLoader(stats, clock),
		avatars,
		avatarStore: avatars,
		page: locale === 'en' ? { locale, lang: en, dateWords: enDateWords, clock } : { locale, lang: fr, dateWords: frDateWords, clock },
		cookie: config.cookie,
		templates,
		assetUrl: createAssetUrl(assetManifest),
		files,
		logger: consoleLogger,
	});
}

let services: Services | undefined;
/** Une instance de l'application par langue, avec ses textes et ses adresses (services/routes.ts). */
const apps: Partial<Record<Locale, Promise<ForumApp>>> = {};

function isolateServices(env: Env): Services {
	services ??= createServices(env);
	return services;
}

function forumApp(env: Env, locale: Locale): Promise<ForumApp> {
	const existing = apps[locale];
	if (existing !== undefined) return existing;
	const created = createApp(env, isolateServices(env), locale);
	apps[locale] = created;
	// Une erreur de configuration (secret manquant…) ne reste pas en mémoire : on réessaiera.
	created.catch(() => {
		if (apps[locale] === created) delete apps[locale];
	});
	return created;
}

/**
 * Requête d'une page anglaise (/en/…) : l'instance anglaise la reçoit à son adresse française, qu'elle
 * route comme l'instance française ; ses redirections repartent en anglais. Le cache en bordure
 * travaille sur l'adresse d'origine (une entrée par langue).
 */
async function serveEnglish(request: Request, frPath: string, env: Env, ctx: ExecutionContextLike): Promise<Response> {
	const url = new URL(request.url);
	url.pathname = frPath;
	const response = await (await forumApp(env, 'en')).fetch(new Request(url, request), {}, ctx);
	const location = response.headers.get('location');
	if (location === null || !location.startsWith('/')) return response;
	const localized = new Response(response.body, response);
	localized.headers.set('location', localizePath(location, 'en'));
	return localized;
}

/** Crée le sujet d'un retour reçu du relais d'une application source (AppFeedbackController). */
function submitAppFeedback(env: Env, source: FeedbackSourceId, input: unknown): Promise<AppFeedbackResult> {
	const config = loadConfig(env as unknown as Readonly<Record<string, unknown>>);
	const { db, configLoader } = isolateServices(env);
	const controller = new AppFeedbackController(source, {
		config: configLoader,
		posting: new PostingRepository(db),
		stopwords: new BuiltinStopwords(),
		mailer: createMailer(config),
		mailTemplates: { load: async (name) => mail[name] },
		texts: fr.appFeedback,
		clock,
		logger: consoleLogger,
	});
	return controller.submit(input);
}

/**
 * Retours de l'application Phraséo, appelés par le relais de Phraséo (même compte Cloudflare) via une
 * liaison de service : `"entrypoint": "PhraseoFeedback"` côté relais. Cette classe n'a pas d'adresse
 * publique : seul un Worker lié peut l'appeler, sans secret à partager.
 */
export class PhraseoFeedback extends WorkerEntrypoint<Env> {
	async submit(input: unknown): Promise<AppFeedbackResult> {
		return submitAppFeedback(this.env, 'phraseo', input);
	}
}

/**
 * Retours de l'application Donne Ton Point (donnetonpoint.fr), appelés par sa Pages Function via une
 * liaison de service : `"entrypoint": "DonneTonPointFeedback"` côté appelant. Même contrat que
 * PhraseoFeedback, sans adresse publique.
 */
export class DonneTonPointFeedback extends WorkerEntrypoint<Env> {
	async submit(input: unknown): Promise<AppFeedbackResult> {
		return submitAppFeedback(this.env, 'donneTonPoint', input);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
		const frPath = delocalizePath(new URL(request.url).pathname);
		if (frPath !== null)
			return withEdgeCache(
				request,
				caches.default,
				COOKIE_PREFIX,
				(promise) => ctx.waitUntil(promise),
				() => serveEnglish(request, frPath, env, ctx),
			);
		const forum = await forumApp(env, 'fr');
		return withEdgeCache(
			request,
			caches.default,
			COOKIE_PREFIX,
			(promise) => ctx.waitUntil(promise),
			// Le contexte d'exécution passe à Hono : request.waitUntil (envoi des e-mails après la réponse).
			async () => forum.fetch(request, {}, ctx),
		);
	},

	async scheduled(controller: { cron: string }, env: Env, ctx: ExecutionContextLike): Promise<void> {
		const { db, files, configLoader, online } = isolateServices(env);
		const tasks = new ScheduledTasks({
			config: configLoader,
			online,
			files,
			fileReferences: new FileReferenceRepository(db),
			translation: createTranslation(env, db),
			clock,
			logger: consoleLogger,
		});
		// Deux déclencheurs (wrangler.jsonc) : la nuit, le ménage ; chaque heure, les traductions.
		ctx.waitUntil(controller.cron === HOURLY_CRON ? tasks.runHourly() : tasks.run());
	},
};
