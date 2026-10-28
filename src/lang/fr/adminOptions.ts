/**
 * Textes d'admin_options.php (lang/French/admin_options.php) : sections, libellés et aides des
 * options, erreurs de validation. Les balises HTML des aides PHP sont retirées.
 */

export const adminOptions = {
	title: 'Options',
	sections: {
		essentials: 'Principal',
		timeouts: 'Délais',
		display: 'Affichage',
		features: 'Fonctionnalités',
		feed: 'Syndication',
		reports: 'Signalements',
		avatars: 'Avatars',
		email: 'E-mail',
		registration: 'Inscription',
		announcement: 'Annonces',
		maintenance: 'Maintenance',
	},
	fields: {
		board_title: {
			label: 'Titre du forum',
			help: 'Le titre de ce forum (affiché en haut de chaque page). Ce champ ne doit pas contenir de code HTML.',
		},
		board_desc: {
			label: 'Description du forum',
			help: 'Une courte description de ce forum (affichée en haut de chaque page). Ce champ peut contenir du code HTML.',
		},
		base_url: {
			label: 'URL de base',
			help: "L'URL complète du forum sans barre oblique finale (ex. : http://www.mondomaine.com/forums). Ceci doit être correct pour que les fonctionnalités dédiées aux administrateurs et aux modérateurs puissent être conservées. Si vous obtenez des erreurs « Bad referer », elle est sûrement incorrecte.",
		},
		default_timezone: {
			label: 'Fuseau horaire par défaut',
			help: "Le fuseau horaire par défaut pour les invités et les utilisateurs qui s'inscrivent sur le forum.",
		},
		default_dst: { label: "Ajustement pour l'heure d'été", help: "Pour activer l'heure d'été (avance d'une heure)." },
		default_style: {
			label: 'Style par défaut',
			help: "Ceci est le style par défaut utilisé si le visiteur est un invité ou si un utilisateur n'a pas modifié ce paramètre dans son profil.",
		},
		timeout_visit: {
			label: "Délai d'interruption de visite",
			help: "Délai en secondes d'inactivité d'un utilisateur avant de mettre à jour ses données de dernière visite (touche principalement les indicateurs de nouveau message).",
		},
		timeout_online: {
			label: 'Délai de déconnexion',
			help: "Délai en secondes d'inactivité d'un utilisateur avant d'être retiré de la liste des utilisateurs en ligne.",
		},
		redirect_delay: {
			label: 'Délai de redirection',
			help: 'Délai en secondes avant redirection. Si défini à 0, la page de redirection ne sera pas affichée (non recommandé).',
		},
		show_user_info: {
			label: "Infos sur l'utilisateur dans les messages",
			help: "Afficher les informations à propos de l'utilisateur ayant créé le  message sous son nom d'utilisateur dans la discussion. Les informations données sont : le lieu, la date d'inscription, le nombre de messages publiés et les liens de contact (e-mail et URL).",
		},
		show_post_count: {
			label: 'Nombre de messages',
			help: "Affiche le nombre de messages publiés par un utilisateur (indiqué dans les discussions, le profil et la liste d'utilisateurs).",
		},
		smilies: { label: 'Émoticônes dans les messages', help: 'Convertit les émoticônes en petites icônes graphiques.' },
		smilies_sig: {
			label: 'Émoticônes dans les signatures',
			help: "Convertit les émoticônes en petites icônes graphiques dans les signatures d'utilisateurs.",
		},
		make_links: {
			label: 'Rendre les liens cliquables',
			help: 'Si activée, AvroBB détectera automatiquement les URL dans les messages et les convertira en hyperliens cliquables.',
		},
		topic_review: {
			label: 'Résumé de discussion',
			help: 'Nombre maximal de sujets à afficher lors de la composition de message (le plus récent en premier). 0 pour désactiver.',
		},
		disp_topics_default: {
			label: 'Discussions par page',
			help: 'Le nombre de discussions à afficher par défaut par page dans un forum. Les utilisateurs peuvent personnaliser ce paramètre.',
		},
		disp_posts_default: {
			label: 'Messages par page',
			help: 'Le nombre de messages à afficher par défaut par page dans une discussion. Les utilisateurs peuvent personnaliser ce paramètre.',
		},
		indent_num_spaces: {
			label: 'Tabulation',
			help: "Si définie à 8, une indentation normale sera utilisée lors de l'affichage du texte contenu dans une balise [code][/code]. Sinon, le nombre d'espaces indiqué sera utilisé pour l'indentation du texte.",
		},
		quote_depth: {
			label: 'Niveau maximum de citations imbriquées',
			help: "Le nombre de fois qu'une balise [quote] peut apparaîre à l'intérieure d'une autre balise [quote], toute balise de niveau supérieur sera ignorée.",
		},
		quickpost: {
			label: 'Réponse rapide',
			help: 'Si activée, AvroBB ajoutera un formulaire de réponse rapide au bas des sujets. Ainsi, les utilisateurs pourront répondre directement à partir du sujet.',
		},
		users_online: {
			label: 'Utilisateurs en ligne',
			help: "Affiche des informations sur la page d'accueil indiquant le nombre d'invités et d'inscrits visitant actuellement les forums.",
		},
		censoring: {
			label: 'Mots censurés',
			help: "Activez ceci pour censurer des mots spécifiques dans le forum. Rendez-vous à la rubrique « Censure » pour davantage d'informations.",
		},
		signatures: { label: 'Signatures', help: 'Autoriser les utilisateurs à ajouter une signature en bas de message.' },
		show_dot: {
			label: 'Indication de message antérieur',
			help: "Cette fonctionnalité affiche un point devant les sujets dans viewforum.php si l'utilisateur actuellement connecté a déjà écrit un message dans le sujet. Désactivez cette fonction si vous constatez des problèmes de surcharge du serveur.",
		},
		topic_views: {
			label: 'Affichages de sujet',
			help: "Conserver le nombre de fois qu'un sujet a été visionné. Désactivez cette option si vous constatez une surcharge du serveur dans un forum très fréquenté.",
		},
		quickjump: { label: 'Basculement rapide', help: 'Activer la liste déroulante de basculement rapide (basculer vers un forum).' },
		search_all_forums: {
			label: 'Rechercher dans tous les forums',
			help: "Si désactivée, les recherches ne pourront être effectuées que dans un forum à la fois. Désactivez ceci si la charge du serveur est trop élevée à cause d'un nombre de recherches trop important.",
		},
		additional_navlinks: {
			label: 'Éléments de menu supplémentaires',
			help: "En ajoutant des hyperliens HTML dans cette boîte, un nombre illimité d'éléments peuvent être ajoutés au menu de navigation situé en haut de chaque page. Le format pour ajouter de nouveaux liens est le suivant : X = <a href=\"URL\">INTITULE DU LIEN</a> où X est la position à laquelle le lien devra être inséré (ex. : 0 pour insérer au début et 2 pour insérer après l'élément « Liste d'utilisateurs »). Chaque élément devra se trouver dans une nouvelle ligne.",
		},
		feed_type: {
			label: 'Type de flux par défaut',
			help: "Type d'abonnement de flux devant être affiché. Remarque : le choix « Aucun » ne désactive pas le flux mais le masque simplement par défaut.",
		},
		feed_ttl: {
			label: 'Temps de mise en cache des flux',
			help: "Les flux peuvent être placés dans le cache afin de réduire l'utilisation des ressources.",
		},
		report_method: {
			label: 'Méthode de signalement',
			help: "Choisissez la méthode pour traiter les signalements de discussion/message. Vous pouvez opter pour le système de signalement interne, l'envoi d'un e-mail à la liste de diffusion (voir ci-dessous) ou effectuer les deux opérations.",
		},
		mailing_list: {
			label: 'Liste de diffusion',
			help: "Une liste d'abonnés séparés par une virgule. Les personnes dans cette liste sont les destinataires des signalements.",
		},
		avatars: {
			label: 'Utiliser des avatars',
			help: 'Si activée, les utilisateurs pourront envoyer vers le serveur un avatar qui sera affiché sous leur titre/rang.',
		},
		avatars_dir: {
			label: "Répertoire d'envoi",
			help: "Le répertoire vers lequel les avatars seront envoyés (relatif à la racine du forum). PHP doit avoir les permissions d'écriture dans ce répertoire.",
		},
		avatars_width: { label: 'Largeur max', help: 'La largeur maximale autorisée pour les avatars en pixels (60 recommandés).' },
		avatars_height: { label: 'Hauteur max', help: 'La hauteur maximale autorisée pour les avatars en pixels (60 recommandés).' },
		avatars_size: { label: 'Taille max', help: 'La taille maximale autorisée pour les avatars en octets (10240 recommandés).' },
		admin_email: { label: "E-mail de l'administrateur", help: "L'adresse électronique de l'administrateur du forum." },
		webmaster_email: {
			label: 'E-mail du webmaster',
			help: "Ceci est l'adresse indiquée comme adresse de provenance dans les e-mails envoyés par le forum.",
		},
		forum_subscriptions: {
			label: 'Suivi de forum',
			help: "Autorise les utilisateurs à suivre des forums (reçoivent un e-mail lorsque quelqu'un créé une nouvelle discussion).",
		},
		topic_subscriptions: {
			label: 'Suivi de discussion',
			help: "Autorise les utilisateurs à suivre des discussions (reçoivent un e-mail lorsque quelqu'un répond).",
		},
		smtp_host: {
			label: 'Adresse du serveur SMTP',
			help: "L'adresse d'un serveur SMTP externe à utiliser pour envoyer les e-mails. Vous pouvez spécifier un numéro de port personnalisé si le serveur SMTP n'utilise pas le port par défaut 25 (exemple : mail.monhôte.com:3580). Laisser vide pour utiliser le programme d'envoi d'e-mail local.",
		},
		smtp_user: {
			label: "Nom d'utilisateur SMTP",
			help: "Nom d'utilisateur pour serveur SMTP. Indiquez un nom d'utilisateur uniquement si cela est demandé par le serveur SMTP (la plupart des serveurs ne nécessitent pas d'authentification).",
		},
		smtp_pass: {
			label: 'Mot de passe SMTP',
			help: "Mot de passe pour serveur SMTP. Indiquez un mot de passe uniquement si cela est demandé par le serveur SMTP (la plupart des serveurs ne nécessitent pas d'authentification). Veuillez indiquer deux fois votre mot de passe pour confirmation.",
		},
		smtp_ssl: {
			label: 'Chiffrage du SMTP par SSL',
			help: 'Chiffre la connexion vers le serveur SMTP en utilisant SSL. Ne devrait être utilisé que si votre serveur SMTP le demande et que votre version de PHP prend en charge SSL.',
		},
		regs_allow: {
			label: 'Autoriser de nouvelles inscriptions',
			help: 'Indique si ce forum accepte de nouvelles inscriptions. Ne désactiver que sous certaines conditions.',
		},
		regs_verify: {
			label: 'Vérifier les inscriptions',
			help: "Si activée, les utilisateurs obtiendront par e-mail un mot de passe aléatoire lors de leur inscription. Ils pourront alors se connecter et modifier leur mot de passe dans leur profil s'ils le souhaitent. Cette fonctionnalité demande également une vérification de leur adresse électronique s'ils choisissent d'en changer. Ceci est un moyen efficace d'éviter l'inscription abusive et de vérifier que les utilisateurs ont une adresse électronique correcte associée à leur profil.",
		},
		regs_report: {
			label: 'Signaler les nouvelles inscriptions',
			help: "Si activée, AvroBB notifiera les utilisateurs dans la liste de diffusion (voir ci-dessus) lorsqu'un nouvel utilisateur s'inscrit sur les forums.",
		},
		rules: {
			label: 'Règles du forum pour les utilisateurs',
			help: "Si activée, les utilisateurs devront accepter les règles lorsqu'ils s'inscriront (indiquez le texte ci-dessous). Ces règles seront toujours disponibles sous forme de lien dans le menu de navigation en haut de chaque page.",
		},
		rules_message: {
			label: "Indiquez vos règles d'utilisation ici",
			help: "Ici vous pouvez indiquer toute règle ou autre information que l'utilisateur doit considérer et accepter avant de s'inscrire. Si vous avez activé les règles ci-dessus vous devez saisir quelque chose ici, sinon, elles seront désactivées. Ce texte ne sera pas traité comme les messages ordinaires et peut contenir du code HTML.",
		},
		default_email_setting: {
			label: 'Paramètre e-mail par défaut',
			help: "Choisissez le paramètre de vie privée pour les nouvelles inscriptions d'utilisateurs.",
		},
		announcement: { label: "Afficher l'annonce", help: 'Activez ceci pour afficher le message ci-dessous sur chaque page des forums.' },
		announcement_message: {
			label: "Message d'annonce",
			help: 'Ce texte ne sera pas traité comme les messages ordinaires et peut contenir du code HTML.',
		},
		maintenance: {
			label: 'Mode maintenance',
			help: "Si activé, le forum ne sera disponible qu'aux administrateurs. Ceci devra être utilisé si le forum doit être indisponible temporairement pour maintenance. ATTENTION ! Ne vous déconnectez pas lorsque le forum est en mode maintenance. Vous ne seriez plus en mesure de vous connecter.",
		},
		maintenance_message: {
			label: 'Message de maintenance',
			help: "Le message qui s'affichera pour les utilisateurs lorsque le forum sera en mode maintenance. Si laissé vide, un message par défaut sera utilisé. Ce texte ne sera pas traité comme les messages ordinaires et peut contenir du code HTML.",
		},
	} as Record<string, { label: string; help: string | null }>,
	smtpChangePass: 'Cocher ceci si vous souhaitez modifier ou supprimer le mot de passe stocké actuellement.',
	smtpPassConfirm: 'Confirmer le mot de passe SMTP',
	feedTypes: ['Aucun', 'RSS', 'Atom'],
	feedTtlNone: 'Ne pas placer dans le cache',
	feedTtlMinutes: (minutes: number) => `${minutes} minutes`,
	reportMethods: ['Interne', 'E-mail', 'Les deux'],
	emailSettings: [
		"Divulguer l'adresse électronique aux autres utilisateurs.",
		"Masquer l'adresse électronique mais autoriser l'utilisation du formulaire d'envoi d'e-mail.",
		"Masquer l'adresse électronique et ne pas autoriser l'utilisation du formulaire d'envoi d'e-mail.",
	],
	yes: 'Oui',
	no: 'Non',
	save: 'Enregistrer les modifications',
	updated: 'Options mises à jour.',
	errors: {
		missingTitle: 'Vous devez spécifier un nom pour le forum.',
		invalidAdminEmail: "L'adresse électronique d'administrateur que vous avez indiquée est invalide.",
		invalidWebmasterEmail: "L'adresse électronique de Webmestre que vous avez indiquée est invalide.",
		smtpMismatch: 'Vous devez indiquer le mot de passe SMTP deux fois exactement de la même manière pour le modifier.',
		timeout: 'La valeur pour « Délai avant déconnexion » doit être inférieure à celle du champ « Délai de fin de visite ».',
		invalidBaseUrl: "L'URL de base n'est pas une adresse valide.",
	},
	defaults: {
		announcement: 'Veuillez saisir votre annonce ici.',
		rules: 'Veuillez saisir vos règles ici.',
		maintenance: 'Les forums sont temporairement fermés pour maintenance. Veuillez essayer à nouveau dans quelques minutes.',
	},
};
