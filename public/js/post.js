/*
 * Amélioration progressive du formulaire de rédaction (post.php) : boutons de préfixe du sujet
 * propres à PV (« [MSFS] », « [Résolu] »…). Sans JavaScript, le formulaire fonctionne à l'identique
 * et les boutons restent masqués.
 */
(() => {
	const prefixes = document.querySelector('[data-subject-prefixes]');
	const subject = document.getElementById('req_subject');
	if (prefixes === null || subject === null) return;

	prefixes.hidden = false;
	prefixes.addEventListener('click', (event) => {
		const button = event.target instanceof Element ? event.target.closest('[data-prefix]') : null;
		if (button === null) return;
		// Comme le PHP : le préfixe s'ajoute devant le sujet déjà saisi.
		subject.value = button.getAttribute('data-prefix') + subject.value;
		subject.focus();
	});
})();
