/**
 * Point d'entrée : câble les vraies dépendances (base MariaDB partagée avec le PHP, fichiers de
 * l'installation PHP) et démarre le serveur.
 */

import path from 'node:path';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { fr, frDateWords } from './lang/fr/index.ts';
import { BanRepository } from './repositories/BanRepository.ts';
import { CensorRepository } from './repositories/CensorRepository.ts';
import { ConfigLoader } from './repositories/ConfigLoader.ts';
import { ConfigRepository } from './repositories/ConfigRepository.ts';
import { FeedRepository } from './repositories/FeedRepository.ts';
import { ForumRepository } from './repositories/ForumRepository.ts';
import { GalleryRepository } from './repositories/GalleryRepository.ts';
import { OnlineRepository } from './repositories/OnlineRepository.ts';
import { PhpCacheFiles } from './repositories/PhpCacheFiles.ts';
import { PostRepository } from './repositories/PostRepository.ts';
import { PrivateMessageRepository } from './repositories/PrivateMessageRepository.ts';
import { ReportRepository } from './repositories/ReportRepository.ts';
import { SearchRepository } from './repositories/SearchRepository.ts';
import { StatsRepository } from './repositories/StatsRepository.ts';
import { StopwordsLoader } from './repositories/StopwordsLoader.ts';
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

const app = await buildApp({
	config: new ConfigLoader(new ConfigRepository(db), phpCache, clock),
	users,
	members: users,
	profiles: users,
	topics: new TopicRepository(db),
	posts: new PostRepository(db),
	forums: new ForumRepository(db),
	reports: new ReportRepository(db),
	privateMessages: new PrivateMessageRepository(db),
	bans: new BanRepository(db),
	online: new OnlineRepository(db),
	phpCache,
	censorship: new CensorRepository(db),
	topicLabels: new TopicLabelRepository(db),
	stats,
	search: new SearchRepository(db),
	feeds: new FeedRepository(db),
	gallery: new GalleryRepository(db),
	stopwords: new StopwordsLoader(config.legacyRoot),
	usersInfo: new UsersInfoLoader(stats, phpCache, clock),
	avatars: new FileAvatarLocator(config.legacyRoot, config.legacyBaseUrl),
	page: { lang: fr, dateWords: frDateWords, clock },
	legacyCookie: config.legacyCookie,
	legacyBaseUrl: config.legacyBaseUrl,
	trustProxy: config.trustProxy,
	logger: true,
});

app.addHook('onClose', async () => db.destroy());

await app.listen({ port: config.port, host: '127.0.0.1' });
