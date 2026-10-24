/**
 * Textes de misc.php (règles, « marquer comme lu », abonnements). Source : lang/French/misc.php,
 * topic.php, forum.php et register.php.
 */

export const misc = {
	forumRules: "Conditions d'utilisation des forums",
	markRead: 'Marquer toutes les discussions comme lues',
	markForumRead: 'Marquer ce forum comme lu',
	/** Absent de FluxBB : confirmation d'un ancien lien GET (Node n'écrit pas sur un GET). */
	confirmMarkRead: 'Toutes les discussions seront marquées comme lues.',
	confirmMarkForumRead: 'Toutes les discussions de ce forum seront marquées comme lues.',
	confirm: 'Confirmer',

	// Abonnements
	alreadySubscribedTopic: 'Vous suivez déjà cette discussion.',
	alreadySubscribedForum: 'Vous suivez déjà ce forum.',
	notSubscribedTopic: 'Vous ne suivez pas cette discussion.',
	notSubscribedForum: 'Vous ne suivez pas ce forum.',
	subscribeTopic: 'Suivre cette discussion',
	subscribeForum: 'Suivre ce forum',
	unsubscribe: 'Ne plus suivre',
	/** Absents de FluxBB : confirmation d'un lien GET (anciennes pages PHP, e-mails de notification). */
	confirmSubscribeTopic: 'Vous serez prévenu(e) par e-mail des nouvelles réponses à cette discussion.',
	confirmSubscribeForum: 'Vous serez prévenu(e) par e-mail des nouvelles discussions de ce forum.',
	confirmUnsubscribeTopic: 'Vous ne serez plus prévenu(e) des nouvelles réponses à cette discussion.',
	confirmUnsubscribeForum: 'Vous ne serez plus prévenu(e) des nouvelles discussions de ce forum.',
};
