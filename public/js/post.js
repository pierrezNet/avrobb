/*
 * Amélioration progressive du formulaire de rédaction (post.php) : boutons de balise du sujet propres
 * à PV (« [MSFS] », « [Résolu] »…). Un clic ajoute la balise devant le sujet, ou la retire si elle y
 * est déjà (jamais deux fois la même). Le serveur nettoie de toute façon le sujet (balises inventées,
 * doublons). Sans JavaScript, le formulaire fonctionne à l'identique et les boutons restent masqués.
 */
(() => {
	const tags = document.querySelector('[data-subject-prefixes]');
	const subject = document.getElementById('req_subject');
	if (tags === null || subject === null) return;

	/** Balises entre crochets en tête du sujet, et le reste. */
	const split = (value) => {
		const found = [];
		let rest = value.trimStart();
		for (let match = /^\[([^[\]]{1,20})\]\s*/.exec(rest); match !== null; match = /^\[([^[\]]{1,20})\]\s*/.exec(rest)) {
			found.push(match[1]);
			rest = rest.slice(match[0].length);
		}
		return { found, rest };
	};

	const refresh = () => {
		const present = split(subject.value).found.map((name) => name.toLowerCase());
		for (const button of tags.querySelectorAll('[data-prefix]')) {
			const name = (button.getAttribute('data-prefix') ?? '').slice(1, -1).toLowerCase();
			button.setAttribute('aria-pressed', present.includes(name) ? 'true' : 'false');
		}
	};

	tags.hidden = false;
	refresh();
	subject.addEventListener('input', refresh);
	tags.addEventListener('click', (event) => {
		const button = event.target instanceof Element ? event.target.closest('[data-prefix]') : null;
		if (button === null) return;
		const tag = button.getAttribute('data-prefix') ?? '';
		const name = tag.slice(1, -1).toLowerCase();
		const { found, rest } = split(subject.value);
		const kept = found.filter((other) => other.toLowerCase() !== name);
		const next = kept.length === found.length ? [...found, tag.slice(1, -1)] : kept;
		subject.value = next.length > 0 ? `${next.map((other) => `[${other}]`).join('')} ${rest}` : rest;
		refresh();
		subject.focus();
	});
})();
