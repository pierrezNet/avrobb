/**
 * Textes d'admin_maintenance.php (lang/French/admin_maintenance.php).
 */

export const adminMaintenance = {
	title: 'Maintenance du forum',
	rebuildSubhead: "Reconstruire l'index de recherche",
	rebuildInfo:
		"Si vous avez ajouté, modifié ou supprimé des messages manuellement dans la base de données ou si vous rencontrez des problèmes lors des recherches, vous devriez reconstruire l'index de recherche. Pour une performance optimale, vous devriez passer le forum en mode maintenance pendant la reconstruction.",
	perCycle: 'Messages par cycle',
	perCycleHelp:
		'Le nombre de messages à traiter à chaque étape. Ex. : si vous indiquez 300, trois cents messages seront traités, puis l’étape suivante sera lancée. Ceci évite que le traitement ne s’interrompe en cours de route.',
	startingPost: 'ID du message de départ',
	startingPostHelp:
		"L'ID du message de départ pour la reconstruction. La valeur par défaut est le premier ID disponible dans la base de données. En principe, vous ne devriez pas avoir à changer cela.",
	emptyIndex: "Effacer l'index",
	emptyIndexHelp: "Choisissez cela si vous souhaitez que l'index soit vidé avant de débuter la reconstruction.",
	rebuildCompletedInfo:
		"Une fois le processus achevé, vous serez ramené à cette page. Avec JavaScript, chaque étape s'enchaîne automatiquement ; sinon, cliquez sur « Continuer » à chaque étape.",
	rebuild: "Reconstruire l'index",
	rebuilding: "Reconstruction de l'index de recherche",
	rebuildingInfo: "Reconstruction de l'index. Il serait bon de se servir un café en attendant :-)",
	processed: (first: number, last: number) => `Messages ${first} à ${last} traités.`,
	continue: 'Continuer',
	rebuilt: 'Index de recherche reconstruit.',
	perCycleNotInteger: 'Le nombre de messages par cycle doit être une valeur entière positive.',
	daysNotInteger: 'Le nombre de jours à prendre en compte pour élaguer doit être indiqué sous forme de nombre entier positif.',
	noOldTopics: (days: string) =>
		`Aucune discussion ne date de plus de ${days} jours. Veuillez réduire la valeur de « Ancienneté en jours » et essayer à nouveau.`,
	pruned: 'Messages élagués.',
	pruneHead: 'Élaguer',
	pruneSubhead: "Supprimer d'anciens messages",
	daysOld: 'Ancienneté en jours',
	daysOldHelp:
		"L'ancienneté d'une discussion pour qu'elle puisse être supprimée. Ex. : si vous indiquez le nombre 30, toute discussion qui ne contient pas de message datant de moins de 30 jours sera supprimée.",
	pruneSticky: 'Supprimer les discussions épinglées',
	pruneStickyHelp: "Si activé, les discussions épinglées seront également prises en compte lors de l'élagage.",
	pruneFrom: 'Élaguer dans le forum',
	allForums: 'Tous les forums',
	pruneFromHelp: 'Le forum dans lequel vous souhaitez élaguer les messages.',
	pruneInfo:
		'Utilisez cette fonctionnalité avec prudence. Les messages supprimés ne peuvent plus être récupérés. Pour une performance optimale, vous devriez passer le forum en mode maintenance pendant l’élagage.',
	prune: 'Élaguer',
	confirmPruneSubhead: "Confirmer l'élagage des messages",
	confirmPruneInfo: (days: string, forum: string, count: number) =>
		`Souhaitez-vous vraiment supprimer toutes les discussions datant de plus de ${days} jours de ${forum} (${count} discussions) ?`,
	confirmPruneWarn: "ATTENTION ! La suppression des messages est irréversible lors de l'élagage.",
	cacheSubhead: 'Vider les caches',
	cacheInfo:
		'Supprime les fichiers de cache du forum (réglages, bannissements, censure, listes « Atteindre », flux…). Ils sont recréés automatiquement à la visite suivante. Utile après une modification faite directement dans la base de données.',
	clearCache: 'Vider les caches',
	cacheCleared: 'Caches vidés.',
	yes: 'Oui',
	no: 'Non',
	goBack: 'Retour',
};
