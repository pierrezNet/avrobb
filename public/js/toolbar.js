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
			const icon = document.createElement('img');
			icon.src = imageDir + image;
			icon.alt = '';
			icon.width = 16;
			icon.height = 16;
			element.append(icon);
		} else element.textContent = text;
		return element;
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
