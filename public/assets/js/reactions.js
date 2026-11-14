/*
 * Réactions sans recharger la page : le formulaire part en arrière-plan et la barre
 * renvoyée par react.php (presenters/reactions.ts) remplace l'état affiché. La liste des membres
 * ayant réagi s'ouvre dans une fenêtre, avec le contenu de la page reactions.php. Sans JavaScript,
 * ou en cas d'échec, formulaire et lien fonctionnent normalement.
 */
(() => {
	function update(bar, view) {
		const summary = bar.querySelector('[data-reactors]');
		summary.hidden = view?.summary == null;
		summary.querySelector('.reaction-summary__emojis').textContent = view?.summary?.emojis ?? '';
		summary.querySelector('.reaction-summary__names').textContent = view?.summary?.text ?? '';
		const picker = bar.querySelector('.reaction-picker');
		if (picker && view?.picker) {
			picker.open = false;
			picker.querySelector('summary').dataset.pressed = String(view.picker.pressed);
			picker.querySelector('.reaction-picker__current').textContent = view.picker.emoji;
			picker.querySelector('.reaction-picker__label').textContent = view.picker.label;
			for (const choice of view.picker.choices)
				picker.querySelector(`button[value="${choice.value}"]`)?.setAttribute('aria-pressed', String(choice.pressed));
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
			update(form.closest('[data-reaction-bar]'), await response.json());
		} catch {
			form.dataset.fallback = '1';
			form.requestSubmit(button);
		} finally {
			form.removeAttribute('aria-busy');
		}
	});

	// Palette ouverte : un clic ailleurs ou Échap la referme.
	document.addEventListener('click', (event) => {
		for (const picker of document.querySelectorAll('.reaction-picker[open]')) if (!picker.contains(event.target)) picker.open = false;
	});
	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape') return;
		for (const picker of document.querySelectorAll('.reaction-picker[open]')) {
			picker.open = false;
			picker.querySelector('summary').focus();
		}
	});

	let dialog = null;

	async function showReactors(href, closeLabel) {
		const response = await fetch(href, { credentials: 'same-origin' });
		if (!response.ok) throw new Error(String(response.status));
		const content = new DOMParser().parseFromString(await response.text(), 'text/html').getElementById('reactors');
		if (content === null) throw new Error('liste absente');
		if (dialog === null) {
			dialog = document.createElement('dialog');
			dialog.className = 'reactors-dialog';
			dialog.addEventListener('click', (event) => {
				if (event.target === dialog) dialog.close();
				const tab = event.target instanceof Element ? event.target.closest('.reactors__tab, .pagination a') : null;
				if (tab === null) return;
				event.preventDefault();
				showReactors(tab.href, closeLabel).catch(() => {
					location.href = tab.href;
				});
			});
			document.body.append(dialog);
		}
		const close = document.createElement('button');
		close.type = 'button';
		close.className = 'reactors-dialog__close';
		close.setAttribute('aria-label', closeLabel);
		close.textContent = '×';
		close.addEventListener('click', () => dialog.close());
		dialog.replaceChildren(close, content);
		dialog.setAttribute('aria-labelledby', 'reactors-dialog-title');
		content.querySelector('.reactors__title')?.setAttribute('id', 'reactors-dialog-title');
		if (!dialog.open) dialog.showModal();
	}

	document.addEventListener('click', (event) => {
		const link = event.target instanceof Element ? event.target.closest('a[data-reactors]') : null;
		if (link === null || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || typeof HTMLDialogElement !== 'function')
			return;
		event.preventDefault();
		showReactors(link.href, link.dataset.close ?? '×').catch(() => {
			location.href = link.href;
		});
	});
})();
