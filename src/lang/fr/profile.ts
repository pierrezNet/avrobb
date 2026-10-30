/**
 * Textes du profil (consultation et modification). Source : lang/French/profile.php, prof_reg.php,
 * pms.php et reputation.php de FluxBB. Les « Redirection… » du PHP disparaissent : on redirige aussitôt.
 */

import type { AvatarError } from '../../services/images.ts';
import type { LimitedField, ProfileError } from '../../services/profileForms.ts';
import { account } from './account.ts';
import { preparseErrorText } from './post.ts';

const FIELD_LABELS: Record<LimitedField, string> = {
	realname: 'Nom',
	title: 'Titre',
	location: 'Lieu',
	url: 'Site Web',
	jabber: 'Jabber',
	icq: 'ICQ',
	msn: 'Compte Microsoft',
	aim: 'AOL IM',
	yahoo: 'Yahoo! Messenger',
	adminNote: "Note de l'administrateur",
	email: 'E-mail',
};

function profileErrorText(error: ProfileError): string {
	switch (error.kind) {
		case 'tooLong':
			return `Le champ « ${FIELD_LABELS[error.field]} » ne doit pas dépasser ${error.max} caractères.`;
		case 'username':
			return account.errors[error.error];
		case 'usernameDupe':
			return `Il existe déjà une personne inscrite avec ce nom d'utilisateur. ${error.existing}. Ce nom d'utilisateur est trop ressemblant. Il doit différer par au moins un caractère alpha-numérique (a-z ou 0-9). Veuillez essayer un autre nom d'utilisateur.`;
		case 'invalidEmail':
			return "L'adresse électronique que vous avez saisie est invalide.";
		case 'bannedEmail':
			return "L'adresse électronique saisie est bannie de ces forums. Veuillez en choisir une autre.";
		case 'dupeEmail':
			return 'Cette adresse électronique est déjà utilisée. Veuillez en choisir une autre.';
		case 'invalidWebsite':
			return "L'URL de site Web saisie est invalide.";
		case 'websiteNotAllowed':
			return "Vous n'êtes pas autorisé à ajouter un site à votre profil pour le moment";
		case 'forbiddenTitle':
			return 'Votre titre contient un mot interdit. Choisissez un autre titre.';
		case 'badIcq':
			return 'Vous avez saisi un UIN ICQ invalide. Merci de corriger.';
		case 'signatureTooLong':
			return `Les signatures ne peuvent pas contenir plus de ${error.max} caractères. Veuillez raccourcir votre signature de ${error.excess} caractères.`;
		case 'signatureTooManyLines':
			return `Les signatures ne peuvent pas comporter plus de ${error.max} lignes.`;
		case 'bbcode':
			return preparseErrorText(error.error);
	}
}

function avatarErrorText(error: AvatarError, formatNumber: (n: number) => string): string {
	switch (error.kind) {
		case 'noFile':
			return "Vous n'avez pas sélectionné de fichier à envoyer.";
		case 'badType':
			return "Ce type de fichier n'est pas autorisé. Voici les formats pris en charge\u00a0: *.gif, *.jpeg et *.png.";
		case 'tooLarge':
			return `La taille du fichier dépasse le maximum autorisé ${formatNumber(error.max)} octets.`;
		case 'tooWideOrHigh':
			return `L'image est plus large et/ou plus haute que le maximum autorisé ${error.width}x${error.height} pixels.`;
	}
}

export const profile = {
	usersProfile: (username: string) => `Profil de ${username}`,
	profile: 'Profil',
	sectionPersonal: 'Personnel',
	sectionMessaging: 'Messagerie',
	sectionPersonality: 'Personnalité',
	userActivity: "Activité de l'utilisateur",
	username: "Nom d'utilisateur",
	title: "Titre de l'utilisateur",
	realname: 'Nom',
	location: 'Lieu',
	website: 'Site Web',
	email: 'E-mail',
	sendEmail: 'Envoyer un e-mail',
	pm: 'MP',
	pmTitle: 'Messages privés',
	quickMessage: 'Envoyer un message privé',
	jabber: 'Jabber',
	icq: 'ICQ',
	msn: 'Compte Microsoft',
	aim: 'AOL IM',
	yahoo: 'Yahoo! Messenger',
	avatar: 'Avatar',
	signature: 'Signature',
	posts: 'Messages',
	showTopics: 'Afficher toutes les discussions',
	showPosts: 'Voir les messages de cet utilisateur',
	showSubscriptions: 'Afficher toutes les discussions suivies',
	lastPost: 'Dernier message',
	registered: "Date d'inscription",

	// ——— Modification (profile.php, branche « edit ») ———
	profileMenu: 'Menu profil',
	sectionEssentials: 'Principal',
	sectionDisplay: 'Affichage',
	sectionPrivacy: 'Vie privée',
	sectionHeading: (username: string, section: string) => `${username} - ${section}`,
	profileError: profileErrorText,
	formErrors: 'Erreurs dans le profil',
	formErrorsInfo: 'Les erreurs suivantes doivent être corrigées pour que le profil soit enregistré\u00a0:',
	updated: 'Profil mis à jour.',
	instructions: 'Après avoir mis à jour le profil vous serez redirigé(e) vers cette page.',
	submit: 'Valider',
	required: '(obligatoire)',

	usernameAndPassLegend: "Nom d'utilisateur",
	usernameInfo: (username: string) => `Nom d'utilisateur\u00a0: ${username}`,
	emailLegend: 'Indiquez une adresse électronique valide',
	localisationLegend: 'Définissez vos options géographiques',
	timeZone: 'Fuseau horaire',
	timeZoneInfo: "Afin que le forum affiche correctement l'heure, vous devez sélectionner votre fuseau horaire.",
	dst: "Ajustement pour l'heure d'été\u00a0: cochez cette case si nécessaire pour que les forums affichent correctement l'heure.",
	registeredInfo: (date: string) => `Inscription\u00a0: ${date}`,
	lastPostInfo: (date: string) => `Dernier message\u00a0: ${date}`,
	lastVisitInfo: (date: string) => `Dernière visite\u00a0: ${date}`,
	postsInfo: (count: string) => `Messages\u00a0: ${count}`,
	adminNote: "Note de l'administrateur",

	personalDetailsLegend: 'Informations personnelles',
	leaveBlank: 'Laisser vide pour utiliser la valeur par défaut du forum.',
	titleLeaveBlank: '(laisser vide pour le titre par défaut)',

	contactDetailsLegend: 'Informations sur les messageries instantanées',

	avatarLegend: "Définissez vos options d'affichage d'avatar",
	avatarInfo:
		'Un avatar est une petite image qui sera affichée avec chacun de vos messages. Vous pouvez envoyer un avatar en cliquant sur le lien ci-dessous.',
	changeAvatar: "Changer d'avatar",
	deleteAvatar: "Effacer l'avatar",
	uploadAvatar: 'Envoyer un avatar',
	signatureLegend: 'Rédigez votre signature',
	signatureInfo:
		"Une signature est un petit texte ajouté à la suite de vos messages. Vous pouvez y inclure ce que vous voulez et y utiliser des balises BBCode, selon la configuration du forum. Les fonctionnalités actives apparaissent dans la marge lors de l'édition de votre signature.",
	sigMaxSize: (length: string, lines: number) => `${length} caractères et ${lines} lignes autorisés`,
	sigPreview: 'Aperçu de la signature actuelle\u00a0:',
	noSig: 'Pas de signature dans le profil.',

	styleLegend: 'Choisissez votre style favori',
	styles: 'Styles',
	postDisplayLegend: 'Définissez vos options de visualisation des messages',
	postDisplayInfo:
		"En désactivant toutes les options d'affichage des images et des signatures dans les messages, vous augmenterez la vitesse de chargement des pages.",
	showSmilies: "Afficher les émoticônes sous forme d'icônes",
	showSigs: 'Afficher les signatures.',
	showAvatars: 'Afficher les avatars des utilisateurs.',
	showImages: 'Afficher les images.',
	showImagesSigs: 'Afficher les images dans les signatures des utilisateurs.',
	paginationLegend: 'Définissez vos options de pagination',
	topicsPerPage: 'Discussions par page',
	postsPerPage: 'Messages par page',
	paginateInfo: 'Nombres de discussions et de messages à afficher par page.',
	manageReputation: 'Afficher la renommée',
	manageReputationInfo:
		'Vous pouvez désactiver le système de renommée, dans ce cas, personne ne pourra changer votre renommée. Si vous désactivez cette option, vous ne pourrez plus voir et changer celle des autres membres.',
	reputationOn: 'Actif',
	reputationOff: 'Inactif',

	privacyLegend: 'Définissez vos options de vie privée',
	emailSettingInfo:
		"Indiquez si vous souhaitez que votre adresse électronique soit visible par les autres utilisateurs ou non et si vous voulez que les autres utilisateurs puissent vous envoyer des e-mails via ces forums (formulaire d'envoi d'e-mail) ou non.",
	emailSettings: [
		'Divulguer votre adresse électronique aux autres utilisateurs',
		"Masquer votre adresse électronique mais autoriser l'envoi via le formulaire d'envoi d'e-mail.",
		"Masquer votre adresse électronique et interdire l'utilisation du formulaire d'envoi d'e-mail.",
	],
	subscriptionLegend: 'Définit vos options de suivi de discussion',
	notifyFull: 'Inclure le message dans les e-mails de notification de réponse.',
	autoNotifyFull: 'Suivre automatiquement les sujets auxquels on a répondu.',
	usePm: 'Activer la messagerie privée',
	notifyPm: 'Notification des messages privés par courriel',
	notifyPmInfo: 'En activant cette option, un courriel sera envoyé pour tout nouveau message privé.',
	notifyPmFull: 'Inclure le contenu des messages privés',

	// Avatar (actions upload_avatar, delete_avatar)
	avatarsDisabled: 'La prise en charge des avatars est désactivée.',
	uploadAvatarLegend: 'Sélectionnez un fichier avatar à envoyer',
	file: 'Fichier',
	upload: 'Envoyer',
	avatarDesc: (width: number, height: number, bytes: string, size: string) =>
		`Un avatar est une petite image qui sera affichée sous votre nom d'utilisateur dans vos messages. Une image plus grande est réduite automatiquement à ${width} × ${height} pixels et ${bytes} octets (${size}) au plus.`,
	avatarError: avatarErrorText,
	confirmDeleteAvatar: "Effacer l'avatar\u00a0?",
	confirmDeleteAvatarInfo: 'Votre avatar actuel sera définitivement effacé.',
};
