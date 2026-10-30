/*
 * Amélioration progressive des envois d'images (galerie, avatar, logo et bannière) : l'image choisie
 * est réduite dans le navigateur avant l'envoi, puisque le Worker n'a pas de bibliothèque d'images.
 * Le champ fichier porte la consigne (data-resize, services/imageResize.ts) :
 *   - contain : tenir dans data-resize-width × data-resize-height, sans agrandir ;
 *   - cover : remplir ce cadre, recadré au centre (avatar) ;
 *   - data-resize-variants « champ:côté … » : variantes réduites (galerie : mobile, vignette),
 *     envoyées dans des champs fichier cachés ajoutés au formulaire.
 * Orientation EXIF appliquée, WebP (JPEG si le navigateur ne sait pas encoder le WebP). Un GIF est
 * laissé tel quel (il serait figé). Sans JavaScript, ou si quelque chose échoue, le fichier
 * d'origine part tel quel : le serveur contrôle de toute façon type, dimensions et poids.
 */
(() => {
	const inputs = document.querySelectorAll('input[type="file"][data-resize]');
	if (
		inputs.length === 0 ||
		typeof createImageBitmap !== 'function' ||
		typeof DataTransfer !== 'function' ||
		typeof HTMLCanvasElement.prototype.toBlob !== 'function'
	)
		return;

	const QUALITY = 0.82;

	/** Taille de sortie et zone source d'après la consigne ; jamais d'agrandissement. */
	const geometry = (bitmap, mode, width, height) => {
		const { width: bw, height: bh } = bitmap;
		if (mode === 'cover') {
			const ratio = width / height;
			const sw = bw / bh > ratio ? bh * ratio : bw;
			const sh = sw / ratio;
			const outWidth = Math.max(1, Math.round(Math.min(width, sw)));
			return { sx: (bw - sw) / 2, sy: (bh - sh) / 2, sw, sh, width: outWidth, height: Math.max(1, Math.round(outWidth / ratio)) };
		}
		const scale = Math.min(1, width / bw, height / bh);
		return { sx: 0, sy: 0, sw: bw, sh: bh, width: Math.max(1, Math.round(bw * scale)), height: Math.max(1, Math.round(bh * scale)) };
	};

	const canvasOf = (width, height) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		return canvas;
	};

	/** Réduction par moitiés successives : une seule grande réduction crénelle l'image. */
	const draw = (bitmap, box) => {
		let source = bitmap;
		let { sx, sy, sw, sh } = box;
		while (sw / 2 > box.width && sh / 2 > box.height) {
			const half = canvasOf(Math.round(sw / 2), Math.round(sh / 2));
			const context = half.getContext('2d');
			context.imageSmoothingQuality = 'high';
			context.drawImage(source, sx, sy, sw, sh, 0, 0, half.width, half.height);
			source = half;
			sx = 0;
			sy = 0;
			sw = half.width;
			sh = half.height;
		}
		const canvas = canvasOf(box.width, box.height);
		const context = canvas.getContext('2d');
		context.imageSmoothingQuality = 'high';
		context.drawImage(source, sx, sy, sw, sh, 0, 0, box.width, box.height);
		return canvas;
	};

	const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));

	/** Encodage au type demandé ; un navigateur sans encodeur WebP renvoie du PNG : on repasse en JPEG. */
	const encode = async (canvas, type) => {
		const blob = await toBlob(canvas, type);
		if (blob !== null && blob.type === type) return blob;
		return toBlob(canvas, 'image/jpeg');
	};

	const EXTENSIONS = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

	const asFile = (blob, name) =>
		new File([blob], `${name.replace(/\.[^.]*$/, '') || 'image'}.${EXTENSIONS[blob.type] ?? 'img'}`, { type: blob.type });

	const setFile = (input, file) => {
		const transfer = new DataTransfer();
		if (file !== null) transfer.items.add(file);
		input.files = transfer.files;
	};

	/** Champ fichier caché d'une variante, créé au besoin dans le formulaire. */
	const variantInput = (form, name) => {
		let input = form.querySelector(`input[type="file"][name="${name}"]`);
		if (input === null) {
			input = document.createElement('input');
			input.type = 'file';
			input.name = name;
			input.hidden = true;
			form.append(input);
		}
		return input;
	};

	const variantsOf = (input) =>
		(input.dataset.resizeVariants ?? '')
			.split(' ')
			.filter((entry) => entry !== '')
			.map((entry) => {
				const [field, side] = entry.split(':');
				return { field, side: Number(side) };
			});

	const process = async (input) => {
		const variants = variantsOf(input);
		for (const variant of variants) setFile(variantInput(input.form, variant.field), null);
		const original = input.files?.[0];
		if (original === undefined || original.type === 'image/gif') return;

		let bitmap;
		try {
			bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' });
		} catch {
			return;
		}
		try {
			const mode = input.dataset.resize === 'cover' ? 'cover' : 'contain';
			const width = Number(input.dataset.resizeWidth);
			const height = Number(input.dataset.resizeHeight);
			const box = geometry(bitmap, mode, width, height);
			const blob = await encode(draw(bitmap, box), 'image/webp');
			// Image déjà dans le cadre et plus légère telle quelle : on la garde.
			const untouched = box.width === bitmap.width && box.height === bitmap.height && box.sx === 0 && box.sy === 0;
			const keep = untouched && original.size <= blob.size && original.type in EXTENSIONS;
			if (!keep) setFile(input, asFile(blob, original.name));
			// Variantes au même format que l'image envoyée (le serveur les range sous son extension).
			const type = keep ? original.type : blob.type;
			for (const variant of variants) {
				const variantBox = geometry(bitmap, 'contain', variant.side, variant.side);
				const variantBlob = await encode(draw(bitmap, variantBox), type);
				if (variantBlob.type === type) setFile(variantInput(input.form, variant.field), asFile(variantBlob, original.name));
			}
		} finally {
			bitmap.close();
		}
	};

	for (const input of inputs) {
		const form = input.form;
		if (form === null) continue;
		let pending = null;
		input.addEventListener('change', () => {
			const task = process(input).catch(() => undefined);
			pending = task;
			task.finally(() => {
				if (pending === task) pending = null;
			});
		});
		// Envoi demandé pendant la réduction : on attend qu'elle finisse, puis on renvoie le formulaire.
		form.addEventListener('submit', (event) => {
			if (pending === null) return;
			event.preventDefault();
			const submitter = event.submitter;
			pending.then(() => (submitter ? form.requestSubmit(submitter) : form.requestSubmit()));
		});
	}
})();
