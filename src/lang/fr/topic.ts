/**
 * Textes de viewtopic. Source : lang/French/topic.php.
 */

export const topic = {
	postReply: 'Répondre',
	topicClosed: 'Discussion fermée',
	from: 'Lieu\u00a0:',
	ipAddressLogged: 'IP de connexion',
	note: 'Note\u00a0:',
	posts: 'Messages\u00a0:',
	registered: 'Inscription\u00a0:',
	website: 'Site Web',
	email: 'E-mail',
	online: 'En ligne',
	offline: 'Hors ligne',
	lastEdit: 'Dernière modification par',
	report: 'Signaler',
	delete: 'Supprimer',
	edit: 'Modifier',
	quote: 'Citer',
	re: 'Re\u00a0:',
	/** Absent de FluxBB : libellé accessible du numéro de message. */
	postNumber: (n: number) => `Message n°\u00a0${n}`,
	wrote: (author: string) => `${author} a écrit\u00a0:`,
};
