/**
 * Envoi dans la galerie : la vignette (150 px au plus, JPEG) est calculée par le navigateur dans un
 * canvas et jointe au formulaire (champ « thumbnail »), le serveur n'ayant pas de bibliothèque
 * d'images. Amélioration progressive : sans JavaScript, ou si l'image ne se lit pas, le formulaire
 * part tel quel et l'image sert de vignette.
 */
(() => {
	const MAX_SIDE = 150;

	/** Vignette JPEG de l'image, ou null. */
	async function thumbnailOf(file) {
		try {
			const bitmap = await createImageBitmap(file);
			const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
			canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
			const context = canvas.getContext('2d');
			if (context === null) return null;
			// Fond blanc : le JPEG n'a pas de transparence (PNG, GIF).
			context.fillStyle = '#fff';
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
			return blob instanceof Blob ? new File([blob], 'mini.jpg', { type: 'image/jpeg' }) : null;
		} catch {
			return null;
		}
	}

	for (const form of document.querySelectorAll('form[data-gallery-upload]')) {
		const image = form.querySelector('input[name="req_file"]');
		const thumbnail = form.querySelector('input[name="thumbnail"]');
		if (!(image instanceof HTMLInputElement) || !(thumbnail instanceof HTMLInputElement) || typeof DataTransfer === 'undefined') continue;

		let ready = false;
		form.addEventListener('submit', async (event) => {
			const file = image.files?.[0];
			if (ready || file === undefined) return;
			event.preventDefault();
			const mini = await thumbnailOf(file);
			if (mini !== null) {
				const transfer = new DataTransfer();
				transfer.items.add(mini);
				thumbnail.files = transfer.files;
			}
			ready = true;
			form.requestSubmit(event.submitter ?? undefined);
		});
	}
})();
