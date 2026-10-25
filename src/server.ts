/**
 * Point d'entrée : câble les vraies dépendances (base MariaDB partagée avec le PHP, fichiers de
 * l'installation PHP) et démarre le serveur.
 */

import path from 'node:path';
import { NodeMailer } from './adapters/mailer.ts';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { fr, frDateWords } from './lang/fr/index.ts';
import { BanRepository } from './repositories/BanRepository.ts';
import { CensorRepository } from './repositories/CensorRepository.ts';
import { ConfigLoader } from './repositories/ConfigLoader.ts';
import { ConfigRepository } from './repositories/ConfigRepository.ts';
import { ContactRepository } from './repositories/ContactRepository.ts';
import { DraftRepository } from './repositories/DraftRepository.ts';
import { FeedRepository } from './repositories/FeedRepository.ts';
import { ForumRepository } from './repositories/ForumRepository.ts';
import { GalleryRepository } from './repositories/GalleryRepository.ts';
import { MailTemplateFiles } from './repositories/MailTemplateFiles.ts';
import { MemberUploadFiles } from './repositories/MemberUploadFiles.ts';
import { OnlineRepository } from './repositories/OnlineRepository.ts';
import { PhpCacheFiles } from './repositories/PhpCacheFiles.ts';
import { PostEditRepository } from './repositories/PostEditRepository.ts';
import { PostingRepository } from './repositories/PostingRepository.ts';
import { PostRepository } from './repositories/PostRepository.ts';
import { PrivateContactRepository } from './repositories/PrivateContactRepository.ts';
import { PrivateMessageRepository } from './repositories/PrivateMessageRepository.ts';
import { ProfileRepository } from './repositories/ProfileRepository.ts';
import { RegistrationRepository } from './repositories/RegistrationRepository.ts';
import { ReportRepository } from './repositories/ReportRepository.ts';
import { ReputationRepository } from './repositories/ReputationRepository.ts';
import { SearchRepository } from './repositories/SearchRepository.ts';
import { StatsRepository } from './repositories/StatsRepository.ts';
import { StopwordsLoader } from './repositories/StopwordsLoader.ts';
import { SubscriptionRepository } from './repositories/SubscriptionRepository.ts';
import { ToolbarRepository } from './repositories/ToolbarRepository.ts';
import { TopicLabelRepository } from './repositories/TopicLabelRepository.ts';
import { TopicRepository } from './repositories/TopicRepository.ts';
import { UserRepository } from './repositories/UserRepository.ts';
import { UsersInfoLoader } from './repositories/UsersInfoLoader.ts';
import { FileAvatarLocator } from './services/avatars.ts';

const config = loadConfig();
const db = createDatabase(config.db);
const clock = (): number => Math.floor(Date.now() / 1000);
const phpCache = config.legacyRoot !== '' ? new PhpCacheFiles(path.join(config.legacyRoot, 'cache')) : null;

const stats = new StatsRepository(db);
const users = new UserRepository(db);
const topics = new TopicRepository(db);
const reports = new ReportRepository(db);
const search = new SearchRepository(db);
const avatars = new FileAvatarLocator(config.legacyRoot, config.legacyBaseUrl);
const privateMessages = new PrivateMessageRepository(db);
const privateContacts = new PrivateContactRepository(db);

const app = await buildApp({
	config: new ConfigLoader(new ConfigRepository(db), phpCache, clock),
	users,
	members: users,
	credentials: users,
	passwordResets: users,
	mailTemplates: new MailTemplateFiles(config.legacyRoot),
	mailer: new NodeMailer(config.mailOutbox),
	registrations: new RegistrationRepository(db),
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
	contacts: new ContactRepository(db),
	reportWriter: reports,
	toolbar: new ToolbarRepository(db),
	forums: new ForumRepository(db),
	reports,
	privateMessages,
	privateMessageStore: privateMessages,
	privateContacts,
	sendingLists: privateContacts,
	bans: new BanRepository(db),
	online: new OnlineRepository(db),
	phpCache,
	censorship: new CensorRepository(db),
	topicLabels: new TopicLabelRepository(db),
	stats,
	search,
	searchWriter: search,
	feeds: new FeedRepository(db),
	gallery: new GalleryRepository(db),
	stopwords: new StopwordsLoader(config.legacyRoot),
	usersInfo: new UsersInfoLoader(stats, phpCache, clock),
	avatars,
	avatarStore: avatars,
	uploads: new MemberUploadFiles(config.legacyRoot, config.legacyBaseUrl),
	page: { lang: fr, dateWords: frDateWords, clock },
	legacyCookie: config.legacyCookie,
	legacyBaseUrl: config.legacyBaseUrl,
	trustProxy: config.trustProxy,
	logger: true,
});

app.addHook('onClose', async () => db.destroy());

await app.listen({ port: config.port, host: '127.0.0.1' });
