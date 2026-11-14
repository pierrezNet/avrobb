/*
 * « J'aime » et réactions sans recharger la page : le formulaire part en arrière-plan et les
 * compteurs renvoyés par react.php remplacent ceux du message. Sans JavaScript, ou en cas
 * d'échec, le formulaire est envoyé normalement.
 */
(() => {
	function update(form, counts) {
		for (const button of form.querySelectorAll('button[name="value"]')) {
			const like = button.value === 'like';
			const count = like ? counts.likes : (counts.reactions[button.value] ?? 0);
			const pressed = like ? counts.liked : counts.reaction === button.value;
			button.setAttribute('aria-pressed', String(pressed));
			button.querySelector('.reaction__count').textContent = count > 0 ? String(count) : '';
		}
	}

	document.addEventListener('submit', async (event) => {
		const form = event.target;
		const button = event.submitter;
		if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-reactions') || !(button instanceof HTMLButtonElement)) return;
		if (form.dataset.fallback) return;
		event.preventDefault();
		const body = new URLSearchParams(new FormData(form));
		body.set('value', button.value);
		form.setAttribute('aria-busy', 'true');
		try {
			const response = await fetch(form.action, {
				method: 'POST',
				body,
				headers: { accept: 'application/json' },
				credentials: 'same-origin',
			});
			if (!response.ok) throw new Error(String(response.status));
			update(form, await response.json());
		} catch {
			form.dataset.fallback = '1';
			form.requestSubmit(button);
		} finally {
			form.removeAttribute('aria-busy');
		}
	});
})();
