/**
 * Envoi et suppression de fichiers Uploadile, communs au plugile « Mes uploads » du profil et au
 * gestionnaire de fichiers (gestionnaire.php) : contrôles, nom de fichier, espace occupé.
 * Les images (reconnues à leur contenu) sont converties en WebP, plus grand côté 1024 px, avec une
 * variante mobile et, si les miniatures sont activées, une vignette ; les autres fichiers sont gardés tels quels.
 */

import type { FastifyRequest } from 'fastify';
import type { ImageProcessor } from '../adapters/imageProcessor.ts';
import type { FormBody } from '../http/forms.ts';
import type { PageContext } from '../http/layout.ts';
import type { UploadStore } from '../repositories/MemberUploadFiles.ts';
import type { ProfileStore } from '../repositories/ProfileRepository.ts';
import { readImageInfo } from '../services/images.ts';
import { FULL_MAX_SIDE, MOBILE_MAX_SIDE, MOBILE_PREFIX, webpName } from '../services/imageVariants.ts';
import { checkUpload, datedFileName, isListedUpload, uploadLimits } from '../services/uploads.ts';

export interface UploadActionsDeps {
	uploads: UploadStore;
	profileStore: Pick<ProfileStore, 'setUploadedBytes'>;
	imageProcessor: ImageProcessor;
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
		// Image : convertie avant les contrôles, qui portent sur ce qui sera enregistré.
		const image =
			file !== undefined && readImageInfo(file.data) !== null ? await this.deps.imageProcessor.toWebp(file.data, FULL_MAX_SIDE) : null;
		const data = image?.data ?? file?.data;
		const checked = checkUpload(
			{ name: file?.name ?? '', size: data?.length ?? 0 },
			owner.uploadedBytes,
			uploadLimits(owner.groupId, settings),
			settings,
		);
		if ('error' in checked || file === undefined || data === undefined)
			return { error: lang.profile.uploadError('error' in checked ? checked.error : 'noFile') };

		const wanted = image !== null ? webpName(checked.fileName) : checked.fileName;
		const fileName = (await this.deps.uploads.exists(owner.id, wanted)) ? datedFileName(wanted, this.deps.page.clock()) : wanted;
		await this.deps.uploads.save(owner.id, fileName, data);
		if (image !== null) {
			const mobile = await this.deps.imageProcessor.toWebp(file.data, MOBILE_MAX_SIDE);
			if (mobile !== null) await this.deps.uploads.save(owner.id, `${MOBILE_PREFIX}${fileName}`, mobile.data);
		}
		await this.deps.profileStore.setUploadedBytes(owner.id, owner.uploadedBytes + data.length);
		return { notice: 'uploaded' };
	}

	private async remove(request: FastifyRequest, owner: UploadOwner, selected: readonly string[]): Promise<UploadOutcome> {
		const settings = request.board.uploads;
		if (selected.length === 0) return { error: this.deps.page.lang.profile.noFilesSelected };

		let failures = 0;
		for (const name of selected) {
			// Seuls les fichiers listés se suppriment (ni fichier caché, ni sous-dossier, ni miniature seule).
			if (!isListedUpload(name, settings) || !(await this.deps.uploads.remove(owner.id, name))) failures += 1;
			else {
				// Variante mobile et ancienne miniature (Uploadile) éventuelles partent avec le fichier.
				await this.deps.uploads.remove(owner.id, `mini_${name}`);
				await this.deps.uploads.remove(owner.id, `${MOBILE_PREFIX}${name}`);
			}
		}

		// Espace occupé recalculé d'après le dossier, comme le PHP.
		const files = (await this.deps.uploads.list(owner.id)) ?? [];
		const used = files.filter((file) => isListedUpload(file.name, settings)).reduce((total, file) => total + file.size, 0);
		await this.deps.profileStore.setUploadedBytes(owner.id, used);
		return { notice: failures === 0 ? 'deleted' : 'deleteFailed' };
	}
}
