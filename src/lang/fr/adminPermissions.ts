/**
 * Textes d'admin_permissions.php (lang/French/admin_permissions.php).
 */

export const adminPermissions = {
	title: 'Permissions',
	sections: {
		posting: 'Messages',
		signatures: 'Signatures',
		registration: 'Inscription',
	},
	fields: {
		message_bbcode: { label: 'BBCode', help: 'Autoriser les balises BBCode dans les messages (recommandé).' },
		message_img_tag: { label: 'Balise image', help: 'Autoriser la balise BBCode [img][/img] dans les messages.' },
		message_all_caps: {
			label: 'Message uniquement en capitales',
			help: "Accepter qu'un message soit complètement écrit en lettres capitales.",
		},
		subject_all_caps: {
			label: 'Sujet uniquement en capitales',
			help: "Accepter qu'un sujet soit complètement écrit en lettres capitales.",
		},
		force_guest_email: {
			label: "E-mail de l'invité obligatoire",
			help: "Demander à l'invité d'indiquer son adresse électronique pour publier un message.",
		},
		sig_bbcode: { label: 'BBCodes dans les signatures', help: 'Autoriser les balises BBCode dans les signatures des utilisateurs.' },
		sig_img_tag: {
			label: 'Balise image dans les signatures',
			help: "Autoriser la balise BBCode [img][/img] dans les signatures d'utilisateurs (non recommandé).",
		},
		sig_all_caps: {
			label: 'Signature uniquement en capitales',
			help: "Accepter qu'une signature soit complètement écrite en lettres capitales.",
		},
		sig_length: {
			label: 'Longueur maximale de la signature',
			help: "Nombre maximal de caractères contenus dans une signature d'utilisateur.",
		},
		sig_lines: { label: 'Lignes maximales de la signature', help: "Nombre maximal de lignes accepté dans une signature d'utilisateur." },
		allow_banned_email: {
			label: 'Autoriser les adresses électroniques bannies',
			help: "Autoriser l'utilisation d'adresse électroniques ou de domaines d'adresse électronique bannis lors de l'inscription ou la modification d'e-mail d'utilisateurs. Si laissé au paramètre par défaut (oui), cette action sera autorisée, mais un avertissement par e-mail sera envoyé à la liste de diffusion (moyen efficace pour détecter les inscriptions multiples).",
		},
		allow_dupe_email: {
			label: 'Autoriser des adresses électroniques en double',
			help: "Indique si les utilisateurs sont autorisés à s'inscrire avec une adresse électronique déjà utilisée par un autre utilisateur enregistré. Si autorisé, un e-mail d'avertissement sera envoyé à la liste de diffusion si un doublon est détecté.",
		},
	} as Record<string, { label: string; help: string | null }>,
	updated: 'Permissions mises à jour.',
};
