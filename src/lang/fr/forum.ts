/**
 * Textes de viewforum. Source : lang/French/forum.php (et entrées de common.php).
 */

export const forum = {
	postTopic: 'Nouvelle discussion',
	replies: 'Réponses',
	views: 'Vues',
	lastPost: 'Dernier message',
	moved: 'Déplacée :',
	sticky: 'Épinglée :',
	closed: 'Fermée :',
	emptyForum: 'Le forum ne contient aucune discussion.',
	// Discussions récentes et anciennes (AvroBB, réglées dans Maintenance)
	oldTopics: (count: number) => `Anciennes discussions (${count})`,
	recentTopics: (count: number) => `Discussions récentes (${count})`,
	oldTopicsTitle: 'Anciennes discussions',
	oldTopicsInfo: (days: number) => `Discussions sans nouveau message depuis plus de ${days} jours.`,
	noRecentTopics: 'Aucune discussion récente : voir les anciennes discussions.',
	noOldTopics: 'Aucune ancienne discussion dans ce forum.',
	isSubscribed: 'Vous suivez ce forum',
	unsubscribe: 'Ne plus suivre',
	subscribe: 'Suivre ce forum',
	markForumRead: 'Marquer ce forum comme lu',
	newPosts: 'Nouveaux messages',
	newPostsInfo: 'Atteindre le premier nouveau message de cette discussion.',
	by: 'par',
	/** Absent de FluxBB : marque « vous avez écrit dans ce sujet » (o_show_dot). */
	posted: 'Vous avez participé',
	topicPages: 'Pages de la discussion',
};
