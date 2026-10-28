/**
 * Pages d'information d'AvroBB (pied de page) : termes et règles, politique de confidentialité, aide.
 * Chaque page est une suite de rubriques (titre et paragraphes), affichées comme les forums d'une
 * catégorie. Les liens d'une rubrique pointent vers les pages du forum.
 */

export interface StaticSection {
	title: string;
	paragraphs: string[];
	links?: { label: string; href: string }[];
}

export interface StaticPage {
	title: string;
	intro: string;
	sections: StaticSection[];
}

export const staticPages = {
	updated: 'Dernière mise à jour : octobre 2026.',
	contactTitle: 'Nous contacter',
	contactText: "Pour toute question sur cette page, écrivez à l'administrateur :",

	terms: {
		title: 'Termes et règles',
		intro:
			'Pilote-Virtuel est une communauté francophone de passionnés de simulation de vol. En vous inscrivant ou en publiant sur le forum, vous acceptez les règles ci-dessous. Elles ont un seul but : garder un forum utile, accueillant et agréable à lire.',
		sections: [
			{
				title: 'Respect et courtoisie',
				paragraphs: [
					'Restez courtois, même en désaccord. Les attaques personnelles, les insultes, le harcèlement, les propos discriminatoires ou haineux ne sont pas tolérés.',
					'Chacun a débuté un jour : accueillez les nouveaux venus et leurs questions avec bienveillance.',
				],
			},
			{
				title: 'Bien publier',
				paragraphs: [
					'Choisissez le forum qui correspond à votre sujet et donnez-lui un titre explicite. Indiquez votre simulateur avec les balises du sujet (MSFS, FS24, X-Plane, P3D…) : les réponses seront plus justes.',
					'Avant de poser une question, un coup d’œil à la recherche évite les doublons. Quand votre problème est réglé, ajoutez la balise « Résolu » : cela aidera les suivants.',
					'Évitez les messages en majuscules, les messages sans contenu et la publicité non sollicitée. Un lien vers votre chaîne, votre boutique ou votre création est le bienvenu s’il apporte quelque chose à la discussion.',
				],
			},
			{
				title: 'Droits d’auteur et piratage',
				paragraphs: [
					'Ne publiez que ce que vous avez le droit de partager : vos captures, vos vidéos, vos créations, ou des contenus dont vous citez la source.',
					'Les liens vers des add-ons, scènes, avions ou simulateurs piratés, ainsi que les moyens de contourner leurs protections, sont interdits. Les créateurs de la simulation vivent de leur travail.',
				],
			},
			{
				title: 'Vos contenus',
				paragraphs: [
					'Vous restez l’auteur de vos messages et de vos images. En les publiant, vous autorisez Pilote-Virtuel à les afficher sur le forum, y compris dans les citations et les résultats de recherche.',
					'Vous pouvez modifier vos messages pendant un temps limité après leur envoi. Au-delà, demandez à un modérateur.',
				],
			},
			{
				title: 'Modération et sanctions',
				paragraphs: [
					'Les modérateurs peuvent déplacer, fermer, modifier ou supprimer un message ou une discussion qui ne respecte pas ces règles. Utilisez le lien « Signaler » d’un message plutôt que d’y répondre.',
					'Selon la gravité, un manquement peut entraîner un rappel, une note sur votre profil ou un bannissement, temporaire ou définitif. Un membre banni peut toujours lire le forum, mais ne peut plus y écrire.',
				],
			},
			{
				title: 'Responsabilité',
				paragraphs: [
					'Chaque membre est responsable de ce qu’il publie. Les avis et conseils partagés sur le forum sont donnés de bonne foi, sans garantie : sauvegardez votre simulateur avant de suivre un tutoriel.',
					'Ces règles peuvent évoluer ; la version en vigueur est toujours celle de cette page.',
				],
			},
		],
	},

	privacy: {
		title: 'Politique de confidentialité',
		intro:
			'Cette page explique quelles données le forum Pilote-Virtuel conserve à votre sujet, pourquoi, et comment exercer vos droits, conformément au Règlement général sur la protection des données (RGPD).',
		sections: [
			{
				title: 'Données collectées',
				paragraphs: [
					'À l’inscription : votre nom d’utilisateur, votre adresse e-mail et votre mot de passe, enregistré sous forme d’empreinte, jamais en clair.',
					'Ce que vous choisissez de publier : messages, images de la galerie, fichiers envoyés, avatar, signature et informations facultatives du profil (localisation, site web…).',
					'Pour la sécurité du forum : l’adresse IP utilisée à l’inscription et pour chaque message, ainsi que vos dates d’inscription, de dernière visite et de dernier message.',
				],
			},
			{
				title: 'Pourquoi ces données',
				paragraphs: [
					'Elles servent uniquement au fonctionnement du forum : vous identifier, afficher vos contributions, vous prévenir des nouveaux messages privés ou des réponses aux discussions suivies, et lutter contre le spam et les abus.',
					'Vos données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.',
				],
			},
			{
				title: 'Qui y a accès',
				paragraphs: [
					'Vos messages, votre profil et votre avatar sont publics. Votre adresse e-mail reste cachée, sauf si vous choisissez de l’afficher dans votre profil.',
					'Les adresses IP ne sont visibles que des administrateurs et des modérateurs, pour repérer les abus. Les messages privés ne sont lus que par leurs destinataires.',
				],
			},
			{
				title: 'Cookies',
				paragraphs: [
					'Le forum dépose uniquement des cookies nécessaires à son fonctionnement : votre session de connexion, un jeton de sécurité contre les envois de formulaires frauduleux, et le suivi des discussions déjà lues. Ils ne servent à aucun suivi publicitaire et ne demandent donc pas de consentement.',
					'La page Premium charge la boutique d’un prestataire de paiement, qui peut déposer ses propres cookies : reportez-vous à sa politique de confidentialité.',
				],
			},
			{
				title: 'Durée de conservation',
				paragraphs: [
					'Votre compte et vos contributions sont conservés tant que votre compte existe. Les messages publics restent visibles pour préserver le fil des discussions, même anciennes.',
					'Si vous demandez la suppression de votre compte, vos données personnelles sont effacées ; vos messages publics et images sont conservés pour garder la cohérence des sujets et nous pouvons selon votre choix anonymiser votre nom d’utilisateur.',
				],
			},
			{
				title: 'Vos droits',
				paragraphs: [
					'Vous pouvez à tout moment consulter et corriger vos informations depuis votre profil. Vous disposez aussi d’un droit d’accès, de rectification, d’effacement, de limitation et d’opposition au traitement de vos données.',
					'Pour l’exercer, écrivez à l’administrateur (adresse ci-dessous). En cas de difficulté, vous pouvez saisir la CNIL (cnil.fr).',
				],
			},
		],
	},

	faq: {
		title: 'Aide',
		intro:
			'Les réponses aux questions les plus courantes sur le forum. Une autre question ? Posez-la dans le forum adapté : la communauté est là pour ça.',
		sections: [
			{
				title: 'S’inscrire et se connecter',
				paragraphs: [
					'L’inscription est gratuite : choisissez un nom d’utilisateur et indiquez une adresse e-mail valide. Cochez « Me connecter automatiquement » pour rester connecté sur votre appareil.',
					'Mot de passe oublié ? Le lien sur la page d’identification vous envoie un nouveau mot de passe par e-mail.',
				],
				links: [
					{ label: 'S’inscrire', href: 'register.php' },
					{ label: 'S’identifier', href: 'login.php' },
				],
			},
			{
				title: 'Écrire et mettre en forme',
				paragraphs: [
					'La barre d’outils au-dessus du champ de message met en forme votre texte (gras, liens, listes, citations, vidéos…) avec des balises BBCode. Le bouton « Prévisualisation » montre le résultat avant l’envoi.',
					'Pour citer un passage précis, sélectionnez-le dans le message puis cliquez sur « Citer ». Vous pouvez aussi enregistrer un message en brouillon et le reprendre plus tard.',
				],
				links: [{ label: 'Aide sur le BBCode', href: 'help.php' }],
			},
			{
				title: 'Images et fichiers',
				paragraphs: [
					'Le bouton image de la barre d’outils propose trois choix : l’adresse d’une image en ligne, une image de votre galerie, ou une nouvelle image envoyée directement. Les images sont optimisées automatiquement pour s’afficher vite, y compris sur mobile.',
					'Une image de la galerie insérée dans un message s’affiche en carte, avec son titre et sa légende.',
				],
				links: [{ label: 'Galerie', href: 'gallery.php' }],
			},
			{
				title: 'Mentionner un membre',
				paragraphs: [
					'Tapez @ suivi du début d’un nom d’utilisateur, puis choisissez le membre dans la liste. Il sera prévenu par message privé qu’il a été mentionné.',
				],
			},
			{
				title: 'Balises du sujet',
				paragraphs: [
					'Les pastilles colorées devant le titre d’une discussion indiquent le simulateur concerné ou l’état du sujet (« Résolu », « À vendre »…). L’auteur de la discussion peut les changer à tout moment avec le bouton « Balises du sujet ».',
				],
			},
			{
				title: 'Messages privés',
				paragraphs: [
					'Les messages privés permettent d’écrire à un ou plusieurs membres. Quand vous en recevez un, une pastille avec leur nombre apparaît sur « MP » dans le menu.',
				],
			},
			{
				title: 'Suivre l’activité',
				paragraphs: [
					'« Nouvelles » liste les discussions qui ont reçu des messages depuis votre dernière visite. Vous pouvez aussi suivre une discussion ou un forum pour être prévenu par e-mail des nouvelles réponses.',
					'Les discussions sans nouveau message depuis longtemps sont regroupées dans les « Anciennes discussions » de chaque forum : elles restent consultables et la recherche les trouve toujours.',
				],
				links: [{ label: 'Rechercher', href: 'search.php' }],
			},
			{
				title: 'Renommée',
				paragraphs: [
					'Les boutons + et − à côté du nom d’un membre permettent de saluer une aide précieuse ou de signaler un comportement peu constructif. Utilisez-les avec mesure.',
				],
			},
		],
	},
} satisfies Record<'terms' | 'privacy' | 'faq', StaticPage> & Record<string, unknown>;
