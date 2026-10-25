/**
 * pms_send.php : choix d'une liste d'envoi qui remplit le champ « Envoyer à ». Amélioration
 * progressive : sans JavaScript, la liste reste masquée et les destinataires se saisissent à la main.
 */
(() => {
	const block = document.getElementById('sending-list');
	const select = document.getElementById('sending_list');
	if (block === null || !(select instanceof HTMLSelectElement)) return;
	const target = document.getElementById(select.dataset.target ?? '');
	if (!(target instanceof HTMLInputElement)) return;

	block.hidden = false;
	select.addEventListener('change', () => {
		if (select.value !== '') target.value = select.value;
	});
})();
