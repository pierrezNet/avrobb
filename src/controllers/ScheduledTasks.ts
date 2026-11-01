/**
 * Tâches planifiées (Cron Triggers du Worker, voir wrangler.jsonc).
 * - Chaque nuit : purge de la table online pour un forum sans visite (chaque requête la fait déjà,
 *   comme update_users_online()), effacement des fichiers orphelins de R2, ménage des traductions
 *   périmées.
 * - Chaque heure : traduction automatique de ce qui ne l'a pas été à l'écriture (modèle indisponible,
 *   texte modifié par une page qui ne traduit pas elle-même, contenu antérieur).
 *
 * Les brouillons ne sont pas purgés : ce sont des textes des membres, qu'ils effacent eux-mêmes.
 */

import type { Logger } from '../http/context.ts';
import { avatarsDirectory } from '../repositories/AvatarFiles.ts';
import type { ConfigReader } from '../repositories/ConfigLoader.ts';
import type { FileReferenceReader } from '../repositories/FileReferenceRepository.ts';
import type { FileStore } from '../repositories/FileStore.ts';
import { GALLERY_DIR } from '../repositories/GalleryFiles.ts';
import type { OnlineWriter } from '../repositories/OnlineRepository.ts';
import type { TranslationWriter } from '../repositories/TranslationRepository.ts';
import { avatarOwner, orphanAvatarKeys, orphanGalleryKeys } from '../services/fileCleanup.ts';
import { planOnlinePurge } from '../services/presence.ts';
import { type TranslationJobDeps, translateSources } from './translationJob.ts';

export interface ScheduledTasksDeps {
	config: ConfigReader;
	online: Pick<OnlineWriter, 'listStale' | 'applyPurge'>;
	files: FileStore;
	fileReferences: FileReferenceReader;
	/** Null sans liaison Workers AI (développement, tests) : rien n'est traduit. */
	translation: (TranslationJobDeps & { translations: TranslationWriter }) | null;
	clock: () => number;
	logger: Logger;
}

/** Textes traduits par passage horaire : de quoi rattraper vite, sans entamer le quota du jour. */
const TRANSLATIONS_PER_RUN = 40;

export class ScheduledTasks {
	constructor(private readonly deps: ScheduledTasksDeps) {}

	/** Tâches de la nuit ; une tâche en échec n'empêche pas les suivantes. */
	async run(): Promise<void> {
		await this.#all([
			['online', () => this.purgeOnline()],
			['files', () => this.removeOrphanFiles()],
			['translations', async () => this.deps.translation?.translations.purgeStale()],
		]);
	}

	/** Tâche de chaque heure. */
	async runHourly(): Promise<void> {
		await this.#all([['translate', () => this.translatePending()]]);
	}

	/** Traduit ce qui attend ; renvoie le nombre de textes traités. */
	async translatePending(): Promise<number> {
		const translation = this.deps.translation;
		if (translation === null) return 0;
		const done = await translateSources(translation, await translation.translations.listPending(TRANSLATIONS_PER_RUN));
		if (done > 0) this.deps.logger.info({ count: done }, 'Textes traduits');
		return done;
	}

	async #all(tasks: readonly (readonly [string, () => Promise<unknown>])[]): Promise<void> {
		for (const [name, task] of tasks) {
			try {
				await task();
			} catch (error) {
				this.deps.logger.error({ err: error, task: name }, 'Échec d’une tâche planifiée');
			}
		}
	}

	async purgeOnline(): Promise<void> {
		const config = await this.deps.config.load();
		const now = this.deps.clock();
		const stale = await this.deps.online.listStale(now - config.timeoutOnline);
		await this.deps.online.applyPurge(planOnlinePurge(stale, now, config.timeoutOnline, config.timeoutVisit));
	}

	/** Efface les fichiers sans référence en base ; renvoie le nombre de fichiers effacés. */
	async removeOrphanFiles(): Promise<number> {
		const { files, fileReferences } = this.deps;
		const now = this.deps.clock();
		const config = await this.deps.config.load();

		const gallery = await files.list(`${GALLERY_DIR}/`);
		const galleryOrphans = orphanGalleryKeys(gallery, GALLERY_DIR, await fileReferences.galleryFileNames(), now);

		const avatars = await files.list(`${avatarsDirectory(config.avatarsDir)}/`);
		const owners = avatars.map((file) => avatarOwner(file.key)).filter((id) => id !== null);
		const avatarOrphans = orphanAvatarKeys(avatars, await fileReferences.existingUserIds(owners), now);

		const orphans = [...galleryOrphans, ...avatarOrphans];
		if (orphans.length > 0) {
			await files.delete(orphans);
			this.deps.logger.info({ count: orphans.length }, 'Fichiers orphelins effacés');
		}
		return orphans.length;
	}
}
