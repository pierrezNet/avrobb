/**
 * Adresse de retour après connexion (login.php). Le PHP reprenait redirect_url du formulaire sans
 * contrôle (redirection ouverte) : seules les pages .php du forum sont acceptées ici.
 */

/**
 * Chemin relatif sûr (« viewtopic.php?pid=12#p12 ») tiré d'une adresse absolue ou relative, s'il
 * désigne une page .php de ce site ; sinon index.php.
 */
export function safeRedirect(target: string, host: string | undefined): string {
	try {
		const url = new URL(target, `http://${host ?? 'localhost'}/`);
		if (host !== undefined && url.host !== host) return 'index.php';

		const page = /^\/(?:[\w-]+\/)*([\w-]+\.php)$/.exec(url.pathname)?.[1];
		if (page === undefined || page === 'login.php' || page === 'register.php') return 'index.php';

		// viewtopic.php?pid=N : on ajoute l'ancre du message, comme login.php.
		const pid = page === 'viewtopic.php' ? url.searchParams.get('pid') : null;
		const hash = url.hash !== '' ? url.hash : pid !== null && /^\d+$/.test(pid) ? `#p${pid}` : '';
		return `${page}${url.search}${hash}`;
	} catch {
		return 'index.php';
	}
}
