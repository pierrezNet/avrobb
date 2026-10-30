/**
 * Point d'entrée : câble les vraies dépendances (base MariaDB, stockage local des fichiers) et
 * démarre le serveur. Remplacé par un Worker Cloudflare au lot 3.
 */

import path from 'node:path';
import { DnsHostResolver } from './adapters/hostResolver.ts';
import { SharpImageProcessor } from './adapters/imageProcessor.ts';
import { NodeMailer } from './adapters/mailer.ts';
import { NodeServerInfo } from './adapters/serverInfo.ts';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { fr, frDateWords } from './lang/fr/index.ts';
import { mail } from './lang/fr/mail.ts';
import { AdminStatsRepository } from './repositories/AdminStatsRepository.ts';
import { BanRepository } from './repositories/BanRepository.ts';
import { CensorRepository } from './repositories/CensorRepository.ts';
import { ConfigLoader } from './repositories/ConfigLoader.ts';
import { ConfigRepository } from './repositories/ConfigRepository.ts';
import { ContactRepository } from './repositories/ContactRepository.ts';
import { DraftRepository } from './repositories/DraftRepository.ts';
import { FeedRepository } from './repositories/FeedRepository.ts';
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
import { FileAvatarLocator } from './services/avatars.ts';

const config = loadConfig();
const db = createDatabase(config.db);
const clock = (): number => Math.floor(Date.now() / 1000);

const stats = new StatsRepository(db);
const users = new UserRepository(db);
const topics = new TopicRepository(db);
const reports = new ReportRepository(db);
const search = new SearchRepository(db);
const avatars = new FileAvatarLocator(config.storageDir);
const privateMessages = new PrivateMessageRepository(db);

const bans = new BanRepository(db);
const configStore = new ConfigRepository(db);
const configLoader = new ConfigLoader(configStore, clock);
const headerImages = new HeaderImageFiles(config.storageDir);
await headerImages.installDefaults(path.join(import.meta.dirname, '..', 'public'));

const app = await buildApp({
	config: configLoader,
	configStore,
	configCache: configLoader,
	forumAdmin: new ForumAdminRepository(db),
	maintenance: new MaintenanceRepository(db),
	imageProcessor: new SharpImageProcessor(),
	subjectPrefixes: new SubjectPrefixRepository(db),
	memberSuggest: new MemberSuggestRepository(db),
	groupAdmin: new GroupAdminRepository(db),
	userAdmin: new UserAdminRepository(db),
	users,
	members: users,
	accounts: users,
	devLogin: config.devLogin,
	mailTemplates: { load: async (name) => mail[name] },
	mailer: new NodeMailer(config.mailOutbox),
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
	hostResolver: new DnsHostResolver(),
	contacts: new ContactRepository(db),
	reportWriter: reports,
	reportStore: reports,
	adminStats: new AdminStatsRepository(db, config.db.tablePrefix),
	serverInfo: new NodeServerInfo(),
	forums: new ForumRepository(db),
	reports,
	privateMessages,
	privateMessageStore: privateMessages,
	bans,
	banStore: bans,
	online: new OnlineRepository(db),
	censorship: new CensorRepository(db),
	stats,
	search,
	searchWriter: search,
	feeds: new FeedRepository(db),
	gallery: new GalleryRepository(db),
	galleryFiles: new GalleryFiles(config.storageDir),
	headerImages,
	homeActivity: new HomeActivityRepository(db),
	sitemap: new SitemapRepository(db),
	stopwords: new BuiltinStopwords(),
	usersInfo: new UsersInfoLoader(stats, clock),
	avatars,
	avatarStore: avatars,
	page: { lang: fr, dateWords: frDateWords, clock },
	cookie: config.cookie,
	imagesRoot: path.join(config.storageDir, 'img'),
	trustProxy: config.trustProxy,
	logger: true,
});

app.addHook('onClose', async () => db.destroy());

await app.listen({ port: config.port, host: '127.0.0.1' });
