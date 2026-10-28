/**
 * Textes d'admin_maintenance.php (lang/French/admin_maintenance.php).
 */

export const adminMaintenance = {
	title: 'Maintenance du forum',
	coldSubhead: 'Discussions anciennes',
	coldInfo:
		'Pour distinguer le contenu récent du contenu ancien sans rien supprimer : une discussion sans nouveau message depuis ce nombre de jours quitte la liste de son forum et rejoint sa page « Anciennes discussions » (bouton en haut de la liste). Les discussions épinglées restent toujours dans la liste. La recherche et les liens continuent de les trouver.',
	coldDays: 'Ancienneté en jours',
	coldDaysHelp: '0 : toutes les discussions restent dans la liste.',
	coldDaysInvalid: "L'ancienneté doit être un nombre entier de jours.",
	coldSaved: 'Seuil des discussions anciennes enregistré.',
	modeSubhead: 'Mode maintenance',
	modeInfo:
		'En mode maintenance, seuls les administrateurs peuvent utiliser le forum ; les autres visiteurs voient la page de maintenance avec le message ci-dessous. Les administrateurs peuvent toujours se connecter.',
	modeLabel: 'Mode maintenance',
	modeOn: 'Activé',
	modeOff: 'Désactivé',
	modeMessage: 'Message de maintenance',
	modeMessageHelp: 'Peut contenir du code HTML. Si laissé vide, un message par défaut est utilisé.',
	modeSave: 'Enregistrer',
	modePreview: 'Aperçu de la page de maintenance',
	modeEnabled: 'Le mode maintenance est activé : seuls les administrateurs ont accès au forum.',
	modeDisabled: 'Le mode maintenance est désactivé.',
	previewNotice: 'Aperçu : voici la page que voient les membres et les invités pendant la maintenance.',
	backToMaintenance: 'Retour à la maintenance',
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
	cacheSubhead: 'Vider les caches',
	cacheInfo:
		'Supprime les fichiers de cache du forum (réglages, bannissements, censure, listes « Atteindre », flux…). Ils sont recréés automatiquement à la visite suivante. Utile après une modification faite directement dans la base de données.',
	clearCache: 'Vider les caches',
	cacheCleared: 'Caches vidés.',
	goBack: 'Retour',
};
