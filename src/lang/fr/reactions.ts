/**
 * Textes de la liste des membres ayant réagi à un message (reactions.php).
 */

export const reactions = {
	title: (number: number) => `Membres ayant réagi au message #${number}`,
	all: 'Tous',
	/** Onglet : émoji, libellé caché et nombre. */
	tabLabel: (label: string, count: number) => `${label} (${count})`,
	backToPost: 'Retour au message',
	nobody: 'Personne n’a encore réagi à ce message.',
	close: 'Fermer',
};
