/**
 * Textes d'admin_censoring.php (lang/French/admin_censoring.php).
 */

export const adminCensoring = {
	title: 'Censure',
	mustEnterWord: 'Vous devez indiquer un mot à censurer.',
	wordAdded: 'Mot censuré ajouté.',
	wordUpdated: 'Mot censuré mis à jour.',
	wordRemoved: 'Mot censuré supprimé.',
	addWordSubhead: 'Ajouter le mot',
	addWordInfo:
		"Indiquer un mot que vous souhaitez censurer et le texte de remplacement pour ce mot. Les jokers sont acceptés (ex. : *certain* correspond à « incertain » et à « certainement »). Les noms d'utilisateurs sont également concernés par la censure. Les nouveaux utilisateurs ne pourront pas s'inscrire en utilisant des noms d'utilisateurs contenant un mot censuré. La recherche est insensible à la casse.",
	enabled: 'La censure est activée dans les',
	disabled: 'La censure est désactivée dans les',
	options: 'Options',
	censoredWord: 'Mot censuré',
	replacement: 'Mot(s) de remplacement',
	add: 'Ajouter',
	update: 'Mettre à jour',
	remove: 'Supprimer',
	editRemoveSubhead: 'Modifier ou supprimer des mots',
	noWords: 'Aucun mot censuré pour le moment.',
	wordLabel: (word: string) => `Mot censuré « ${word} »`,
	replacementLabel: (word: string) => `Remplacement de « ${word} »`,
};
