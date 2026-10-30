/*
 * Barre d'outils BBCode (mod FluxToolBar), en amélioration progressive : sans JavaScript, le champ
 * de message reste utilisable tel quel. Comportement des boutons repris de include/toolbar_func.js :
 * la balise entoure la sélection, des questions sont posées pour les liens, images, citations…
 *
 * Configuration : attribut data-toolbar (JSON préparé par presenters/postPage.ts), dossier des
 * icônes dans data-toolbar-images, champ visé dans data-toolbar-for.
 */
(() => {
	/** Remplace la sélection de `textarea` par prefix + (remplacement ou sélection) + suffix. */
	function enclose(textarea, prefix, suffix, replacement) {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selection = textarea.value.substring(start, end);
		const inner = replacement ?? selection;
		let text;
		if (prefix.startsWith('[list=')) {
			// Comme PV : chaque ligne sélectionnée devient un élément de la liste.
			text = `${prefix}\n${inner
				.split('\n')
				.map((line) => `[*]${line.trim()}[/*]\n`)
				.join('')}[/list]`;
		} else text = prefix + inner + suffix;

		const scroll = textarea.scrollTop;
		textarea.setRangeText(text, start, end, 'end');
		textarea.scrollTop = scroll;
		textarea.focus();
	}

	const selectionOf = (textarea) => textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);

	/** Exécute l'action d'un bouton (voir services/toolbar.ts). */
	function run(action, textarea) {
		const tag = action.tag;
		const ask = (i, initial = '') => window.prompt(action.prompts[i] ?? '', initial);
		switch (action.kind) {
			case 'wrap':
				return enclose(textarea, `[${tag}]`, `[/${tag}]`);
			case 'argument': {
				const value = ask(0);
				return value ? enclose(textarea, `[${tag}=${value}]`, `[/${tag}]`) : enclose(textarea, `[${tag}]`, `[/${tag}]`);
			}
			case 'inside': {
				const value = ask(0);
				if (value) enclose(textarea, `[${tag}]`, `[/${tag}]`, value);
				else textarea.focus();
				return;
			}
			case 'pair': {
				const first = ask(0);
				if (!first) return textarea.focus();
				const second = ask(1, selectionOf(textarea));
				if (!second) return enclose(textarea, `[${tag}]`, `[/${tag}]`, first);
				return action.reverse
					? enclose(textarea, `[${tag}=${second}]`, `[/${tag}]`, first)
					: enclose(textarea, `[${tag}=${first}]`, `[/${tag}]`, second);
			}
		}
	}

	function button(label, image, imageDir, text) {
		const element = document.createElement('button');
		element.type = 'button';
		element.className = 'bbcode-toolbar__button';
		element.title = label;
		element.setAttribute('aria-label', label);
		if (image) {
			// Icône en masque CSS : elle prend la couleur du texte, quel que soit le thème.
			const icon = document.createElement('span');
			icon.className = 'bbcode-toolbar__icon';
			icon.setAttribute('aria-hidden', 'true');
			icon.style.setProperty('--icon', `url("${imageDir}${image}")`);
			element.append(icon);
		} else element.textContent = text;
		return element;
	}

	/**
	 * Popin de la galerie (iframe gallery.php?info=pick&embed=1) : on coche une image, « Insérer et
	 * fermer » ajoute son BBCode à la place de la sélection (un double-clic sur la tuile aussi).
	 */
	function galleryDialog(textarea, chooser, returnFocus) {
		const dialog = document.createElement('dialog');
		dialog.className = 'picker-dialog';
		const title = document.createElement('h2');
		title.className = 'picker-dialog__title';
		title.id = `picker-title-${textarea.id}`;
		title.textContent = chooser.dialogTitle;
		dialog.setAttribute('aria-labelledby', title.id);
		const frame = document.createElement('iframe');
		frame.className = 'picker-dialog__frame';
		frame.title = chooser.dialogTitle;
		const actions = document.createElement('div');
		actions.className = 'picker-dialog__actions';
		const closeButton = document.createElement('button');
		closeButton.type = 'button';
		closeButton.className = 'button';
		closeButton.textContent = chooser.close;
		const insertButton = document.createElement('button');
		insertButton.type = 'button';
		insertButton.className = 'button button--primary';
		insertButton.textContent = chooser.insertAndClose;
		actions.append(closeButton, insertButton);
		dialog.append(title, frame, actions);
		document.body.append(dialog);

		const checked = () => frame.contentDocument?.querySelector('input[name="pick"]:checked') ?? null;
		const refresh = () => {
			insertButton.disabled = checked() === null;
		};
		const insert = () => {
			const choice = checked();
			if (choice === null) return;
			dialog.close();
			enclose(textarea, '', '', choice.value);
		};
		frame.addEventListener('load', () => {
			refresh();
			const doc = frame.contentDocument;
			if (doc === null) return;
			doc.addEventListener('change', refresh);
			doc.addEventListener('dblclick', (event) => {
				const tile = event.target instanceof Element ? event.target.closest('label') : null;
				const radio = tile?.querySelector('input[name="pick"]');
				if (radio) {
					radio.checked = true;
					insert();
				}
			});
		});
		closeButton.addEventListener('click', () => dialog.close());
		insertButton.addEventListener('click', insert);
		dialog.addEventListener('close', () => {
			if (document.activeElement === document.body || dialog.contains(document.activeElement)) returnFocus.focus();
		});

		return (url) => {
			insertButton.disabled = true;
			frame.src = url;
			dialog.showModal();
		};
	}

	/**
	 * Bouton image : petit menu « Adresse (URL) », « Mes images de la galerie », « Nouvelle image ».
	 * La galerie s'ouvre dans une popin (galleryDialog) ; sans <dialog>, dans une fenêtre qui insère
	 * le code dans ce message (insert-into-message.js).
	 */
	function imageChooser(element, action, textarea, chooser) {
		const anchor = document.createElement('span');
		anchor.className = 'bbcode-toolbar__anchor';
		const menu = document.createElement('div');
		menu.className = 'bbcode-toolbar__menu';
		menu.setAttribute('role', 'menu');
		menu.setAttribute('aria-label', chooser.label);
		menu.hidden = true;
		element.setAttribute('aria-haspopup', 'menu');
		element.setAttribute('aria-expanded', 'false');

		const close = (focusButton) => {
			menu.hidden = true;
			element.setAttribute('aria-expanded', 'false');
			if (focusButton) element.focus();
		};
		const open = () => {
			menu.hidden = false;
			element.setAttribute('aria-expanded', 'true');
			menu.querySelector('button')?.focus();
		};
		const entry = (label, onChoose) => {
			const item = document.createElement('button');
			item.type = 'button';
			item.setAttribute('role', 'menuitem');
			item.textContent = label;
			item.addEventListener('click', () => {
				close(false);
				onChoose();
			});
			menu.append(item);
		};
		let openDialog = null;
		const gallery = (url, windowUrl) => {
			if (typeof HTMLDialogElement !== 'function') {
				window.open(windowUrl, 'galerie', 'width=900,height=700,scrollbars=yes,resizable=yes');
				return;
			}
			openDialog ??= galleryDialog(textarea, chooser, element);
			openDialog(url);
		};
		entry(chooser.url, () => run(action, textarea));
		entry(chooser.gallery, () => gallery(chooser.galleryUrl, chooser.windowUrl));
		entry(chooser.upload, () => gallery(chooser.uploadUrl, `${chooser.windowUrl}#gallery-upload`));

		element.addEventListener('click', () => (menu.hidden ? open() : close(true)));
		menu.addEventListener('keydown', (event) => {
			const items = [...menu.querySelectorAll('button')];
			const index = items.indexOf(document.activeElement);
			if (event.key === 'Escape') {
				event.preventDefault();
				close(true);
			} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const step = event.key === 'ArrowDown' ? 1 : -1;
				items[(index + step + items.length) % items.length]?.focus();
			}
		});
		document.addEventListener('click', (event) => {
			if (!menu.hidden && event.target instanceof Node && !anchor.contains(event.target)) close(false);
		});
		anchor.append(element, menu);
		return anchor;
	}

	function init(holder) {
		const textarea = document.getElementById(holder.dataset.toolbarFor);
		if (textarea === null || typeof textarea.setRangeText !== 'function') return;
		let config;
		try {
			config = JSON.parse(holder.dataset.toolbar);
		} catch {
			return;
		}
		const imageDir = holder.dataset.toolbarImages ?? '';

		const bar = document.createElement('div');
		bar.className = 'bbcode-toolbar__buttons';
		bar.setAttribute('role', 'toolbar');
		bar.setAttribute('aria-label', config.label);
		bar.setAttribute('aria-controls', textarea.id);

		const smilies = document.createElement('div');
		smilies.className = 'bbcode-toolbar__smilies';
		smilies.hidden = true;
		for (const smiley of config.smilies) {
			const element = button(smiley.code, '', '', smiley.emoji);
			element.addEventListener('click', () => enclose(textarea, smiley.code, ''));
			smilies.append(element);
		}

		for (const item of config.buttons) {
			const element = button(item.label, item.image, imageDir, item.name);
			if (item.action.kind === 'color') {
				// Sélecteur de couleur natif à la place de jscolor.
				const picker = document.createElement('input');
				picker.type = 'color';
				picker.className = 'bbcode-toolbar__color';
				picker.tabIndex = -1;
				picker.setAttribute('aria-hidden', 'true');
				picker.addEventListener('change', () => enclose(textarea, `[color=${picker.value}]`, '[/color]'));
				element.addEventListener('click', () => picker.click());
				// Le sélecteur, invisible, est ancré sur son bouton pour que le navigateur l'ouvre là.
				const anchor = document.createElement('span');
				anchor.className = 'bbcode-toolbar__anchor';
				anchor.append(element, picker);
				bar.append(anchor);
				continue;
			}
			if (item.action.tag === 'img' && config.imageChooser) {
				bar.append(imageChooser(element, item.action, textarea, config.imageChooser));
				continue;
			}
			if (item.action.kind === 'smilies') {
				element.setAttribute('aria-expanded', 'false');
				element.addEventListener('click', () => {
					smilies.hidden = !smilies.hidden;
					element.setAttribute('aria-expanded', String(!smilies.hidden));
				});
			} else element.addEventListener('click', () => run(item.action, textarea));
			bar.append(element);
		}

		holder.append(bar, smilies);
		holder.hidden = false;
	}

	for (const holder of document.querySelectorAll('[data-toolbar]')) init(holder);
})();
