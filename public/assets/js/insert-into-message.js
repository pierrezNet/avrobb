/**
 * Sélecteur d'images de la galerie (gallery.php?info=pick) : bouton « Insérer » qui ajoute un BBCode au message en cours de
 * rédaction dans la fenêtre d'origine (champ req_message), à la position du curseur. Sans fenêtre
 * d'origine ni JavaScript, les boutons restent masqués : le texte se copie.
 */
(() => {
	const opener = window.opener;
	let target = null;
	try {
		target = opener?.document.getElementById('req_message') ?? null;
	} catch {
		// Fenêtre d'origine d'un autre site : pas d'accès.
	}

	const close = document.querySelector('[data-close-window]');
	if (close instanceof HTMLButtonElement && opener) {
		close.hidden = false;
		close.addEventListener('click', () => window.close());
	}
	if (target === null) return;

	const status = document.querySelector('[data-insert-status]');
	for (const button of document.querySelectorAll('button[data-insert]')) {
		button.hidden = false;
		button.addEventListener('click', () => {
			const code = button.getAttribute('data-insert') ?? '';
			const start = target.selectionStart ?? target.value.length;
			const end = target.selectionEnd ?? start;
			target.value = target.value.slice(0, start) + code + target.value.slice(end);
			target.focus();
			target.selectionStart = target.selectionEnd = start + code.length;
			if (status instanceof HTMLElement) status.textContent = status.dataset.message ?? '';
		});
	}
})();
