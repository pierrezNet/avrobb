/**
 * Textes de viewtopic. Source : lang/French/topic.php.
 */

export const topic = {
	quickPost: 'Réponse',
	/** Message traduit par Workers AI (texte d'origine dans une autre langue), avec le texte d'origine dépliable. */
	machineTranslated: 'Traduit automatiquement',
	showOriginal: 'Voir l’original',
	isSubscribed: 'Vous suivez cette discussion',
	unsubscribe: 'Ne plus suivre',
	subscribe: 'Suivre cette discussion',
	/** Retour d'une application source, dans son forum privé « à trier » (administrateurs). */
	acceptAppFeedback: {
		phraseo: 'Accepter : publier dans le forum de la phraséologie',
		donneTonPoint: 'Accepter : publier dans le forum Donne ton point',
		horlogeUtc: "Accepter : publier dans le forum de l'horloge UTC",
		selcal: 'Accepter : publier dans le forum SELCAL',
		reglages: "Accepter : publier dans le forum de l'Atelier réglages",
	},
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
	share: 'Partager',
	linkCopied: 'Lien du message copié dans le presse-papiers.',
	re: 'Re\u00a0:',
	/** lang/French/reputation.php */
	reputation: 'Renommée',
	reputationPlus: 'Augmentation de renommée',
	reputationMinus: 'Réduction de renommée',
	/** Réactions sous un message (👍 « J'aime » compris). */
	reactionsLabel: 'Réactions au message',
	reactions: { like: 'J’aime', heart: 'J’adore', laugh: 'Drôle', wow: 'Étonnant', sad: 'Triste', thanks: 'Merci', party: 'Bravo' },
	react: 'Réagir',
	you: 'Vous',
	/** « A, B, C et 5 autres » : noms des membres ayant réagi, lien vers la liste. */
	reactorsSummary: (names: readonly string[], others: number): string => {
		if (others > 0) return `${names.join(', ')} et ${others === 1 ? '1 autre' : `${others} autres`}`;
		return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : (names[0] ?? '');
	},

	/** Préfixes du sujet (PV) : page propre à Node, ouverte depuis viewtopic. */
	subjectPrefixes: 'Balises du sujet',
	subjectPrefixesInfo:
		'Cochez les balises à afficher devant le sujet de la discussion. Vous pouvez les changer à tout moment, même après le délai de modification de votre message.',
	projects: 'Projet',
	otherPrefixes: 'Autre',
	currentSubject: 'Sujet actuel',
	newSubject: 'Nouveau sujet',
	savePrefixes: 'Enregistrer',
	prefixesTooLong: 'Le sujet ne peut pas dépasser 70 caractères avec ces balises.',
	cancel: 'Annuler',
};
