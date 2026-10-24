/**
 * Point d'entrée : câble les vraies dépendances (base MariaDB partagée avec le PHP, fichiers de
 * l'installation PHP) et démarre le serveur.
 */

import path from 'node:path';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { fr, frDateWords } from './lang/fr/index.ts';
import { ConfigLoader } from './repositories/ConfigLoader.ts';
import { ConfigRepository } from './repositories/ConfigRepository.ts';
import { ForumRepository } from './repositories/ForumRepository.ts';
import { PhpCacheFiles } from './repositories/PhpCacheFiles.ts';
import { PostRepository } from './repositories/PostRepository.ts';
import { PrivateMessageRepository } from './repositories/PrivateMessageRepository.ts';
import { ReportRepository } from './repositories/ReportRepository.ts';
import { TopicRepository } from './repositories/TopicRepository.ts';
import { UserRepository } from './repositories/UserRepository.ts';
import { FileAvatarLocator } from './services/avatars.ts';

const config = loadConfig();
const db = createDatabase(config.db);
const clock = (): number => Math.floor(Date.now() / 1000);
const phpCache = config.legacyRoot !== '' ? new PhpCacheFiles(path.join(config.legacyRoot, 'cache')) : null;

const app = await buildApp({
	config: new ConfigLoader(new ConfigRepository(db), phpCache, clock),
	users: new UserRepository(db),
	topics: new TopicRepository(db),
	posts: new PostRepository(db),
	forums: new ForumRepository(db),
	reports: new ReportRepository(db),
	privateMessages: new PrivateMessageRepository(db),
	avatars: new FileAvatarLocator(config.legacyRoot, config.legacyBaseUrl),
	page: { lang: fr, dateWords: frDateWords, clock },
	legacyCookie: config.legacyCookie,
	legacyBaseUrl: config.legacyBaseUrl,
	trustProxy: config.trustProxy,
	logger: true,
});

app.addHook('onClose', async () => db.destroy());

await app.listen({ port: config.port, host: '127.0.0.1' });
