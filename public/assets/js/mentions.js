/**
 * Amélioration progressive : complètement des noms de membres.
 * - Zones de message [data-mentions] : « @ » suivi du début d'un nom propose des membres ; le choix
 *   insère [url=<profil>]@Nom[/url], lien que le PHP comme Node affichent déjà.
 * - Champs de destinataires [data-member-list] (noms séparés par des virgules) : le dernier nom saisi
 *   est complété.
 * Clavier : flèches pour parcourir, Entrée ou Tab pour choisir, Échap pour fermer.
 * Sans JavaScript, les champs restent de simples zones de saisie.
 */
(() => {
	const body = document.body;
	const profileBase = body.dataset.profileBase;
	if (!profileBase) return;
	const label = body.dataset.membersLabel || '';
	let counter = 0;

	/** Texte à compléter avant le curseur, ou null. */
	function pendingQuery(field, mode) {
		const before = field.value.slice(0, field.selectionStart ?? field.value.length);
		if (mode === 'mention') {
			const match = /(^|\s)@([^\s@[\]]{1,25})$/.exec(before);
			return match ? { text: match[2], start: before.length - match[2].length - 1 } : null;
		}
		const start = before.lastIndexOf(',') + 1;
		// Un « @ » de tête est toléré : on complète le nom qui suit.
		const text = before.slice(start).trim().replace(/^@/, '');
		return text !== '' && text.length <= 25 ? { text, start } : null;
	}

	function attach(field, mode) {
		const list = document.createElement('ul');
		list.id = `member-suggest-${++counter}`;
		list.className = 'member-suggest';
		list.setAttribute('role', 'listbox');
		list.setAttribute('aria-label', label);
		list.hidden = true;
		field.after(list);
		field.setAttribute('aria-autocomplete', 'list');
		field.setAttribute('aria-controls', list.id);
		field.setAttribute('aria-expanded', 'false');

		let members = [];
		let active = -1;
		let query = null;
		let timer = 0;
		let requestId = 0;

		const close = () => {
			list.hidden = true;
			list.replaceChildren();
			members = [];
			active = -1;
			field.setAttribute('aria-expanded', 'false');
			field.removeAttribute('aria-activedescendant');
		};

		const highlight = (index) => {
			active = index;
			for (const [i, item] of [...list.children].entries()) item.setAttribute('aria-selected', i === index ? 'true' : 'false');
			const item = list.children[index];
			if (item) field.setAttribute('aria-activedescendant', item.id);
		};

		const choose = (member) => {
			if (!query) return;
			const value = field.value;
			const end = field.selectionStart ?? value.length;
			let insert;
			if (mode === 'mention') insert = `[url=${profileBase}${member.id}]@${member.username}[/url] `;
			else insert = `${query.start > 0 ? ' ' : ''}${member.username}, `;
			field.value = value.slice(0, query.start) + insert + value.slice(end);
			const caret = query.start + insert.length;
			field.setSelectionRange(caret, caret);
			field.dispatchEvent(new Event('input', { bubbles: true }));
			close();
			field.focus();
		};

		const show = (found) => {
			members = found;
			list.replaceChildren(
				...found.map((member, index) => {
					const item = document.createElement('li');
					item.id = `${list.id}-${index}`;
					item.setAttribute('role', 'option');
					item.textContent = member.username;
					item.addEventListener('mousedown', (event) => {
						event.preventDefault();
						choose(member);
					});
					return item;
				}),
			);
			list.hidden = found.length === 0;
			field.setAttribute('aria-expanded', found.length > 0 ? 'true' : 'false');
			highlight(found.length > 0 ? 0 : -1);
		};

		field.addEventListener('input', () => {
			query = pendingQuery(field, mode);
			clearTimeout(timer);
			if (!query) return close();
			const text = query.text;
			timer = setTimeout(async () => {
				const id = ++requestId;
				try {
					const response = await fetch(`/member_suggest.php?q=${encodeURIComponent(text)}`, { headers: { Accept: 'application/json' } });
					if (!response.ok || id !== requestId) return;
					const data = await response.json();
					show(Array.isArray(data.members) ? data.members : []);
				} catch {
					close();
				}
			}, 150);
		});

		field.addEventListener('keydown', (event) => {
			if (list.hidden || members.length === 0) return;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const step = event.key === 'ArrowDown' ? 1 : -1;
				highlight((active + step + members.length) % members.length);
			} else if (event.key === 'Enter' || event.key === 'Tab') {
				const member = members[active];
				if (member) {
					event.preventDefault();
					choose(member);
				}
			} else if (event.key === 'Escape') {
				event.preventDefault();
				close();
			}
		});

		field.addEventListener('blur', () => setTimeout(close, 100));
	}

	document.addEventListener('DOMContentLoaded', () => {
		for (const field of document.querySelectorAll('textarea[data-mentions]')) attach(field, 'mention');
		for (const field of document.querySelectorAll('input[data-member-list]')) attach(field, 'list');
	});
})();
