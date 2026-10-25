/**
 * Envoi et suppression de fichiers Uploadile, communs au plugile « Mes uploads » du profil et au
 * gestionnaire de fichiers (gestionnaire.php) : contrôles, nom de fichier, espace occupé.
 */

import type { FastifyRequest } from 'fastify';
import type { FormBody } from '../http/forms.ts';
import type { PageContext } from '../http/layout.ts';
import type { UploadStore } from '../repositories/MemberUploadFiles.ts';
import type { ProfileStore } from '../repositories/ProfileRepository.ts';
import { checkUpload, datedFileName, isListedUpload, uploadLimits } from '../services/uploads.ts';

export interface UploadActionsDeps {
	uploads: UploadStore;
	profileStore: Pick<ProfileStore, 'setUploadedBytes'>;
	page: PageContext;
}

/** Propriétaire du dossier : son groupe fixe l'espace alloué. */
export interface UploadOwner {
	id: number;
	groupId: number;
	uploadedBytes: number;
}

/** Résultat : avis à afficher après redirection, ou erreur à réafficher dans la page. */
export type UploadOutcome = { notice: 'uploaded' | 'deleted' | 'deleteFailed' } | { error: string };

/** Valeurs d'un champ répété (cases à cocher). */
function values(body: FormBody | undefined, name: string): string[] {
	const value = body?.[name];
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export class UploadActions {
	constructor(private readonly deps: UploadActionsDeps) {}

	/** Formulaire d'envoi (champ fichier « fichier ») ou de suppression (bouton « supprimer »). */
	handle(request: FastifyRequest<{ Body?: FormBody }>, owner: UploadOwner): Promise<UploadOutcome> {
		const body = request.body;
		return body?.supprimer !== undefined ? this.remove(request, owner, values(body, 'delete')) : this.add(request, owner);
	}

	private async add(request: FastifyRequest, owner: UploadOwner): Promise<UploadOutcome> {
		const { lang } = this.deps.page;
		const settings = request.board.uploads;
		const file = request.uploads.get('fichier');
		const checked = checkUpload(
			{ name: file?.name ?? '', size: file?.data.length ?? 0 },
			owner.uploadedBytes,
			uploadLimits(owner.groupId, settings),
			settings,
		);
		if ('error' in checked || file === undefined) return { error: lang.profile.uploadError('error' in checked ? checked.error : 'noFile') };

		const fileName = (await this.deps.uploads.exists(owner.id, checked.fileName))
			? datedFileName(checked.fileName, this.deps.page.clock())
			: checked.fileName;
		await this.deps.uploads.save(owner.id, fileName, file.data);
		await this.deps.profileStore.setUploadedBytes(owner.id, owner.uploadedBytes + file.data.length);
		return { notice: 'uploaded' };
	}

	private async remove(request: FastifyRequest, owner: UploadOwner, selected: readonly string[]): Promise<UploadOutcome> {
		const settings = request.board.uploads;
		if (selected.length === 0) return { error: this.deps.page.lang.profile.noFilesSelected };

		let failures = 0;
		for (const name of selected) {
			// Seuls les fichiers listés se suppriment (ni fichier caché, ni sous-dossier, ni miniature seule).
			if (!isListedUpload(name, settings) || !(await this.deps.uploads.remove(owner.id, name))) failures += 1;
			else if (settings.thumbnails) await this.deps.uploads.remove(owner.id, `mini_${name}`);
		}

		// Espace occupé recalculé d'après le dossier, comme le PHP.
		const files = (await this.deps.uploads.list(owner.id)) ?? [];
		const used = files.filter((file) => isListedUpload(file.name, settings)).reduce((total, file) => total + file.size, 0);
		await this.deps.profileStore.setUploadedBytes(owner.id, used);
		return { notice: failures === 0 ? 'deleted' : 'deleteFailed' };
	}
}
