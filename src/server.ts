import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/database.ts';
import { fr, frDateWords } from './lang/fr.ts';
import { ConfigRepository } from './repositories/ConfigRepository.ts';
import { PostRepository } from './repositories/PostRepository.ts';
import { TopicRepository } from './repositories/TopicRepository.ts';
import { UserRepository } from './repositories/UserRepository.ts';
import { FileAvatarLocator } from './services/avatars.ts';

const config = loadConfig();
const db = createDatabase(config.db);

const app = await buildApp({
	config: new ConfigRepository(db),
	users: new UserRepository(db),
	topics: new TopicRepository(db),
	posts: new PostRepository(db),
	avatars: new FileAvatarLocator(config.legacyRoot, config.legacyBaseUrl),
	page: { lang: fr, dateWords: frDateWords, clock: () => Math.floor(Date.now() / 1000) },
	legacyCookie: config.legacyCookie,
	styleDir: config.styleDir,
	legacyBaseUrl: config.legacyBaseUrl,
	logger: true,
});

app.addHook('onClose', async () => db.destroy());

await app.listen({ port: config.port, host: '127.0.0.1' });
