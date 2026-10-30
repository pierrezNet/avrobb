/**
 * Amélioration progressive : envoie automatiquement le formulaire marqué data-auto-submit (étapes de la
 * reconstruction de l'index de recherche). Sans JavaScript, le bouton « Continuer » reste disponible.
 */
document.addEventListener('DOMContentLoaded', () => {
	const form = document.querySelector('form[data-auto-submit]');
	if (form instanceof HTMLFormElement) form.submit();
});
