/*
 * « Partager » sous un message : l'adresse du message est copiée dans le presse-papiers, et un court
 * message le confirme. Sans JavaScript ou sans accès au presse-papiers, le lien mène au message.
 */
(() => {
	let toast = null;
	let timer = 0;

	function notify(text) {
		if (toast === null) {
			toast = document.createElement('div');
			toast.className = 'toast';
			toast.setAttribute('role', 'status');
			document.body.append(toast);
		}
		toast.textContent = text;
		toast.classList.add('toast--visible');
		clearTimeout(timer);
		timer = setTimeout(() => toast.classList.remove('toast--visible'), 3000);
	}

	document.addEventListener('click', async (event) => {
		const link = event.target instanceof Element ? event.target.closest('a[data-share]') : null;
		if (link === null || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || !navigator.clipboard) return;
		event.preventDefault();
		try {
			await navigator.clipboard.writeText(link.href);
			notify(link.dataset.copied ?? '');
		} catch {
			location.href = link.href;
		}
	});
})();
