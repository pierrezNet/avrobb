/**
 * Tâches planifiées (Cron Trigger du Worker, voir wrangler.jsonc) : purge de la table online pour
 * un forum sans visite (chaque requête la fait déjà, comme update_users_online()), puis effacement
 * des fichiers orphelins de R2.
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
import { avatarOwner, orphanAvatarKeys, orphanGalleryKeys } from '../services/fileCleanup.ts';
import { planOnlinePurge } from '../services/presence.ts';

export interface ScheduledTasksDeps {
	config: ConfigReader;
	online: Pick<OnlineWriter, 'listStale' | 'applyPurge'>;
	files: FileStore;
	fileReferences: FileReferenceReader;
	clock: () => number;
	logger: Logger;
}

export class ScheduledTasks {
	constructor(private readonly deps: ScheduledTasksDeps) {}

	/** Toutes les tâches ; une tâche en échec n'empêche pas les suivantes. */
	async run(): Promise<void> {
		for (const [name, task] of [
			['online', () => this.purgeOnline()],
			['files', () => this.removeOrphanFiles()],
		] as const) {
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
