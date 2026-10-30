/*
 * « Citer » ne reprend que le passage sélectionné (AvroBB) : si du texte est sélectionné dans le
 * message, le lien post.php?tid=…&qid=… reçoit ce passage (qtext=…), remis en BBCode d'après le
 * HTML produit par services/bbcode.ts (gras, italique, liens, images, listes, code…). Sans
 * sélection, ou sans JavaScript, le message est cité en entier comme dans FluxBB.
 */
(() => {
	const MAX_LENGTH = 1500;
	const quoteLink = (target) => (target instanceof Element ? target.closest('.postquote a') : null);

	/** Balises en ligne : élément HTML → BBCode qui l'entoure. */
	function inlineTags(element) {
		const tag = element.tagName.toLowerCase();
		const classes = element.classList;
		if (tag === 'strong' || tag === 'b') return ['[b]', '[/b]'];
		if (tag === 'em' || tag === 'i') return ['[i]', '[/i]'];
		if (tag === 'del') return ['[del]', '[/del]'];
		if (tag === 'ins') return ['[ins]', '[/ins]'];
		if (tag === 'sup') return ['[sup]', '[/sup]'];
		if (tag === 'sub') return ['[sub]', '[/sub]'];
		if (tag === 'q') return ['[q]', '[/q]'];
		if (tag === 'abbr') return element.title ? [`[acronym=${element.title}]`, '[/acronym]'] : ['[acronym]', '[/acronym]'];
		if (tag === 'span' && classes.contains('bbu')) return ['[u]', '[/u]'];
		if (tag === 'span' && classes.contains('bbs')) return ['[s]', '[/s]'];
		if (tag === 'span' && element.style.color)
			return [
				`[color=${element
					.getAttribute('style')
					.replace(/^color:\s*/, '')
					.replace(/;$/, '')}]`,
				'[/color]',
			];
		return null;
	}

	/** Paragraphes alignés ([center]…) : classe bbcode-<alignement>. */
	function alignment(element) {
		const match = [...element.classList].find((name) => /^bbcode-(left|right|center|justify)$/.test(name));
		return match ? match.slice('bbcode-'.length) : null;
	}

	/** HTML du message → BBCode, récursivement. */
	function toBBCode(node) {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent;
		if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return '';
		const inner = () => [...node.childNodes].map(toBBCode).join('');
		if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return inner();

		const tag = node.tagName.toLowerCase();
		const classes = node.classList;
		if (classes.contains('bbcode-gap')) return '';
		if (tag === 'br') return '\n';
		if (tag === 'img') return node.getAttribute('src') ? `[img]${node.getAttribute('src')}[/img]` : '';
		if (tag === 'iframe') return node.src ? `[video]${node.src}[/video]` : '';
		if (tag === 'summary') return '';
		if (tag === 'cite') return '';

		const wrap = inlineTags(node);
		if (wrap) return wrap[0] + inner() + wrap[1];
		if (tag === 'a') {
			const href = node.getAttribute('href') ?? '';
			const text = inner();
			if (href.startsWith('mailto:')) return href.slice(7) === text ? `[email]${text}[/email]` : `[email=${href.slice(7)}]${text}[/email]`;
			return href === text ? `[url]${href}[/url]` : `[url=${href}]${text}[/url]`;
		}
		if (tag === 'h5') return `[h]${inner()}[/h]\n`;
		if (tag === 'p') {
			const align = alignment(node);
			return align ? `[${align}]${inner()}[/${align}]\n` : `${inner()}\n`;
		}
		if (tag === 'li') return `[*]${inner().trim()}[/*]\n`;
		if (tag === 'ul') return `[list=*]\n${inner()}[/list]\n`;
		if (tag === 'ol') return `[list=${classes.contains('alpha') ? 'a' : '1'}]\n${inner()}[/list]\n`;
		if (tag === 'pre') return `[code]${node.textContent}[/code]\n`;
		if (tag === 'details') return `[spoiler]${inner().trim()}[/spoiler]\n`;
		if (tag === 'div' && classes.contains('quotebox')) return `[quote]${inner().trim()}[/quote]\n`;
		return inner();
	}

	/**
	 * Contenu de la sélection avec les éléments qui l'entourent dans le message (une sélection au
	 * milieu d'un passage en gras garde son [b]).
	 */
	function selectedFragment(range, message) {
		let fragment = range.cloneContents();
		let ancestor = range.commonAncestorContainer;
		if (ancestor.nodeType !== Node.ELEMENT_NODE) ancestor = ancestor.parentElement;
		while (ancestor && ancestor !== message && message.contains(ancestor)) {
			const shell = ancestor.cloneNode(false);
			shell.append(fragment);
			fragment = shell;
			ancestor = ancestor.parentElement;
		}
		return fragment;
	}

	/** Passage sélectionné dans le message du lien, en BBCode, ou '' (rien ou hors du message). */
	function selectedPassage(link) {
		const message = link.closest('article')?.querySelector('.post__message');
		const selection = window.getSelection();
		if (!message || selection === null || selection.isCollapsed || selection.rangeCount === 0) return '';
		if (!message.contains(selection.anchorNode) || !message.contains(selection.focusNode)) return '';
		const bbcode = toBBCode(selectedFragment(selection.getRangeAt(0), message))
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		return bbcode.slice(0, MAX_LENGTH);
	}

	// L'appui sur le lien peut effacer la sélection avant le clic : elle est lue dès l'appui.
	let pending = null;
	document.addEventListener('pointerdown', (event) => {
		const link = quoteLink(event.target);
		pending = link !== null ? { link, text: selectedPassage(link) } : null;
	});

	document.addEventListener('click', (event) => {
		const link = quoteLink(event.target);
		if (link === null) return;
		const text = pending?.link === link && pending.text !== '' ? pending.text : selectedPassage(link);
		pending = null;
		const url = new URL(link.href, location.href);
		if (text !== '') url.searchParams.set('qtext', text);
		else url.searchParams.delete('qtext');
		link.href = url.toString();
	});
})();
