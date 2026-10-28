/*
 * « Citer » ne reprend que le passage sélectionné (AvroBB) : si du texte est sélectionné dans le
 * message, le lien post.php?tid=…&qid=… reçoit ce passage (qtext=…). Sans sélection, ou sans
 * JavaScript, le message est cité en entier comme dans FluxBB.
 */
(() => {
	const MAX_LENGTH = 1500;
	const quoteLink = (target) => (target instanceof Element ? target.closest('.postquote a') : null);

	/** Passage sélectionné dans le message du lien, ou '' (sélection vide ou hors du message). */
	function selectedPassage(link) {
		const message = link.closest('article')?.querySelector('.post__message');
		const selection = window.getSelection();
		if (!message || selection === null || selection.isCollapsed) return '';
		if (!message.contains(selection.anchorNode) || !message.contains(selection.focusNode)) return '';
		return selection.toString().trim().slice(0, MAX_LENGTH);
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
