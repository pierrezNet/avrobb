/**
 * Textes de l'index. Source : lang/French/index.php (et quelques entrées de common.php).
 */

export const indexPage = {
	topics: 'Discussions',
	posts: 'Messages',
	lastPost: 'Dernier message',
	linkTo: 'Lien vers :',
	emptyBoard: 'Les forums ne contiennent rien pour le moment.',
	newestUser: 'Dernier utilisateur inscrit :',
	usersOnline: 'Membres en ligne :',
	guestsOnline: 'Invités en ligne :',
	totalUsers: 'Nombre total de membres :',
	totalTopics: 'Nombre total de discussions :',
	totalPosts: 'Nombre total de messages :',
	online: 'Actuellement en ligne :',
	boardStats: 'Statistiques des forums',
	userInfo: "Informations sur l'utilisateur",
	newPosts: 'Nouveaux messages',
	moderatedBy: 'Modéré par',
	by: 'par',
	never: 'Jamais',
	markAllAsRead: 'Marquer toutes les discussions comme lues',

	// Activité de la semaine (AvroBB), à la place de « Informations sur les forums »
	nowOnline: 'En ce moment',
	nobodyOnline: 'Personne pour le moment… à vous de lancer la discussion !',
	guestsOnlineCount: (n: number) => (n === 1 ? '+ 1 invité' : `+ ${n} invités`),
	hotTopics: 'Ça discute cette semaine',
	weekPosts: (n: number) => (n === 1 ? '1 message cette semaine' : `${n} messages cette semaine`),
	noHotTopics: 'Pas encore de discussion cette semaine.',
	newMembers: 'Bienvenue à',
	newMembersInfo: 'Inscrits cette semaine : un petit mot d’accueil fait toujours plaisir.',
	simulators: 'Simulateurs de la semaine',
	simulatorShare: (name: string, count: number) => (count === 1 ? `${name} : 1 discussion` : `${name} : ${count} discussions`),
};
