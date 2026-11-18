/*
 * Barre d'outils BBCode (mod FluxToolBar), en amélioration progressive : sans JavaScript, le champ
 * de message reste utilisable tel quel. La balise entoure la sélection ; pour les liens, images,
 * citations… les questions sont posées dans une fenêtre décrite par services/toolbar.ts.
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

	const looksLikeUrl = (text) => /^(?:https?:\/\/|www\.)\S+$/i.test(text);
	const looksLikeEmail = (text) => /^[^\s@]+@[^\s@]+$/.test(text);
	let dialogCount = 0;

	/** Valeurs de départ des champs : la sélection va au premier champ qui l'accepte. */
	function initialValues(fields, selection) {
		let used = false;
		return fields.map((field) => {
			if (used || field.kind === 'choice' || selection === '') return '';
			const fits =
				(field.fill === 'url' && looksLikeUrl(selection)) || (field.fill === 'email' && looksLikeEmail(selection)) || field.fill === 'text';
			if (!fits) return '';
			used = true;
			return selection;
		});
	}

	/** Adresse saisie sans protocole (« www.… ») : https:// est ajouté. */
	const withScheme = (value) => (/^www\./i.test(value) ? `https://${value}` : value);

	/** Champ de la fenêtre ; renvoie l'élément à placer et une fonction qui lit sa valeur. */
	function fieldElement(field, initial, id) {
		const wrapper = document.createElement(field.kind === 'choice' ? 'fieldset' : 'div');
		wrapper.className = 'form__field toolbar-dialog__field';
		const hintId = `${id}-hint`;
		const hint = () => {
			if (!field.hint) return null;
			const element = document.createElement('p');
			element.className = 'toolbar-dialog__hint';
			element.id = hintId;
			element.textContent = field.hint;
			return element;
		};

		if (field.kind === 'choice') {
			const legend = document.createElement('legend');
			legend.className = 'form__label';
			legend.textContent = field.label;
			wrapper.append(legend);
			const radios = field.choices.map((choice, i) => {
				const label = document.createElement('label');
				label.className = 'form__choice';
				const radio = document.createElement('input');
				radio.type = 'radio';
				radio.name = id;
				radio.value = choice.value;
				radio.checked = i === 0;
				label.append(radio, ` ${choice.label}`);
				wrapper.append(label);
				return radio;
			});
			const help = hint();
			if (help) {
				wrapper.setAttribute('aria-describedby', hintId);
				wrapper.append(help);
			}
			return { element: wrapper, focus: radios[0], read: () => radios.find((radio) => radio.checked)?.value ?? '' };
		}

		const label = document.createElement('label');
		label.className = 'form__label';
		label.htmlFor = id;
		label.textContent = field.label;
		const input = document.createElement('input');
		input.id = id;
		input.type = field.kind === 'url' ? 'url' : field.kind === 'email' ? 'email' : 'text';
		input.required = field.required;
		input.value = initial;
		input.autocomplete = 'off';
		input.spellcheck = field.kind === 'text';
		if (field.kind === 'member') input.dataset.memberList = 'single';
		wrapper.append(label, input);
		const help = hint();
		if (help) {
			input.setAttribute('aria-describedby', hintId);
			wrapper.append(help);
		}

		const check = () => {
			if (field.kind === 'url') input.value = withScheme(input.value.trim());
			const value = input.value.trim();
			const known = value === '' || field.patterns.length === 0 || field.patterns.some((source) => new RegExp(source).test(value));
			input.setCustomValidity(known ? '' : (field.invalid ?? ''));
		};
		input.addEventListener('input', () => input.setCustomValidity(''));

		if (field.preview) {
			const preview = document.createElement('img');
			preview.className = 'toolbar-dialog__preview';
			preview.alt = '';
			preview.hidden = true;
			preview.addEventListener('load', () => {
				preview.hidden = false;
			});
			preview.addEventListener('error', () => {
				preview.hidden = true;
			});
			const show = () => {
				const value = withScheme(input.value.trim());
				preview.hidden = true;
				if (/^https?:\/\/\S+$/i.test(value)) preview.src = value;
			};
			input.addEventListener('change', show);
			wrapper.append(preview);
			if (initial !== '') show();
		}
		return { element: wrapper, focus: input, check, read: () => input.value.trim() };
	}

	/**
	 * Questions d'un bouton dans une fenêtre <dialog> : tous les champs ensemble, vérifiés par le
	 * navigateur. Résout avec les réponses, ou null si on annule. Sans <dialog>, window.prompt().
	 */
	function ask(dialogSpec, selection) {
		const initial = initialValues(dialogSpec.fields, selection);
		if (typeof HTMLDialogElement !== 'function')
			return Promise.resolve(
				dialogSpec.fields.map((field, i) =>
					field.kind === 'choice' ? (field.choices[0]?.value ?? '') : (window.prompt(field.label, initial[i]) ?? ''),
				),
			);

		return new Promise((resolve) => {
			const prefix = `toolbar-dialog-${++dialogCount}`;
			const dialog = document.createElement('dialog');
			dialog.className = 'toolbar-dialog';
			dialog.setAttribute('aria-labelledby', `${prefix}-title`);
			const form = document.createElement('form');
			form.method = 'dialog';
			form.noValidate = true;
			const title = document.createElement('h2');
			title.className = 'toolbar-dialog__title';
			title.id = `${prefix}-title`;
			title.textContent = dialogSpec.title;
			const fields = dialogSpec.fields.map((field, i) => fieldElement(field, initial[i], `${prefix}-${i}`));
			const actions = document.createElement('div');
			actions.className = 'toolbar-dialog__actions';
			const cancel = document.createElement('button');
			cancel.type = 'button';
			cancel.className = 'button';
			cancel.textContent = dialogSpec.cancel;
			const submit = document.createElement('button');
			submit.type = 'submit';
			submit.className = 'button button--primary';
			submit.textContent = dialogSpec.submit;
			actions.append(cancel, submit);
			form.append(title, ...fields.map((field) => field.element), actions);
			dialog.append(form);
			document.body.append(dialog);

			let answers = null;
			form.addEventListener('submit', (event) => {
				for (const field of fields) field.check?.();
				if (!form.reportValidity()) {
					event.preventDefault();
					return;
				}
				answers = fields.map((field) => field.read());
			});
			cancel.addEventListener('click', () => dialog.close());
			dialog.addEventListener('close', () => {
				dialog.remove();
				resolve(answers);
			});
			dialog.showModal();
			// Premier champ vide, sinon le premier : on complète plutôt que de retaper.
			(fields.find((field, i) => initial[i] === '' && field.focus.type !== 'radio') ?? fields[0])?.focus.focus();
		});
	}

	/** Exécute l'action d'un bouton (voir services/toolbar.ts). */
	async function run(action, textarea) {
		const tag = action.tag;
		if (action.kind === 'wrap') return enclose(textarea, `[${tag}]`, `[/${tag}]`);

		// La fenêtre prend le focus : la sélection est remise en place avant d'écrire.
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const raw = textarea.value.substring(start, end);
		const selection = raw.trim();
		const answers = await ask(action.dialog, selection);
		textarea.focus();
		textarea.setSelectionRange(start, end);
		if (answers === null) return;
		const [first = '', second = ''] = answers;
		const consumed = initialValues(action.dialog.fields, selection).some((value) => value !== '');
		// Sélection reprise dans une réponse : les espaces autour restent hors de la balise.
		// Sinon, elle est gardée et la balise est insérée après elle.
		if (consumed) textarea.setSelectionRange(start + raw.length - raw.trimStart().length, end - raw.length + raw.trimEnd().length);
		else if (action.kind !== 'argument') textarea.setSelectionRange(end, end);
		switch (action.kind) {
			case 'argument':
				return first ? enclose(textarea, `[${tag}=${first}]`, `[/${tag}]`) : enclose(textarea, `[${tag}]`, `[/${tag}]`);
			case 'inside':
				return first ? enclose(textarea, `[${tag}]`, `[/${tag}]`, first) : undefined;
			case 'pair': {
				if (!first) return;
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
