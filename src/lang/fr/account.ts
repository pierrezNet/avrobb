/**
 * Textes communs aux comptes : erreurs de pseudo (profil, message d'invité) et fuseaux horaires.
 * Source : lang/French/register.php et prof_reg.php de FluxBB.
 */

import type { UsernameError } from '../../services/accounts.ts';

export const account = {
	usernameDupe: (existing: string) =>
		`Il existe déjà une personne inscrite avec ce nom d'utilisateur. ${existing}. Ce nom d'utilisateur est trop ressemblant. Il doit différer par au moins un caractère alpha-numérique (a-z ou 0-9). Veuillez essayer un autre nom d'utilisateur.`,
	errors: {
		tooShort: "Les noms d'utilisateur doivent comporter au moins 2 caractères. Veuillez choisir un autre nom d'utilisateur.",
		tooLong: "Les noms d'utilisateur ne doivent pas comporter plus de 25 caractères. Veuillez choisir un autre nom d'utilisateur.",
		guest: "Le nom d'utilisateur « invité » est réservé. Veuillez choisir un autre nom d'utilisateur.",
		ip: "Les noms d'utilisateur ne peuvent pas être au format d'une adresse IP. Veuillez choisir un autre nom d'utilisateur.",
		reservedChars:
			"Les noms d'utilisateurs ne peuvent pas contenir les caractères ', \" et [ ou ]. Veuillez choisir un autre nom d'utilisateur.",
		bbcode: "Les noms d'utilisateur ne peuvent pas contenir de balises (BBCode). Veuillez choisir un autre nom d'utilisateur.",
		censored: "Le nom d'utilisateur que vous avez saisi contient des mots interdits. Veuillez choisir un autre nom d'utilisateur.",
		banned: "Le nom d'utilisateur que vous avez indiqué est banni. Veuillez choisir un autre nom d'utilisateur.",
	} satisfies Record<UsernameError, string>,
	timezones: {
		'-12': '(UTC-12:00) Ligne de changement de date OUEST',
		'-11': '(UTC-11:00) Niue, Samoa',
		'-10': '(UTC-10:00) Hawaii et des îles Aléoutiennes, Îles Cook',
		'-9.5': '(UTC-09:30) Îles Marquises',
		'-9': '(UTC-09:00) Alaska, Îles Gambier',
		'-8.5': '(UTC-08:30) Îles Pitcairn',
		'-8': '(UTC-08:00) Pacifique',
		'-7': '(UTC-07:00) Montagnes, les Rocheuses',
		'-6': '(UTC-06:00) Centre',
		'-5': '(UTC-05:00) Est',
		'-4': '(UTC-04:00) Atlantique',
		'-3.5': '(UTC-03:30) Terre-Neuve',
		'-3': '(UTC-03:00) Amazone, Centre du Groenland',
		'-2': "(UTC-02:00) Milieu de l'Atlantique",
		'-1': "(UTC-01:00) Açores, Cap Vert, Groenland de l'Est",
		'0': '(UTC) Europe Occidentale, Greenwich',
		'1': '(UTC+01:00) Europe Centrale, Afrique Occidentale',
		'2': "(UTC+02:00) Europe de l'Est, Afrique Centrale",
		'3': '(UTC+03:00) Moscou, Afrique Orientale',
		'3.5': '(UTC+03:30) Iran',
		'4': '(UTC+04:00) Golf, Samara',
		'4.5': '(UTC+04:30) Afghanistan',
		'5': '(UTC+05:00) Pakistan, Iekaterinbourg',
		'5.5': '(UTC+05:30) Inde, Sri Lanka',
		'5.75': '(UTC+05:45) Népal',
		'6': '(UTC+06:00) Bangladesh, Bhutan, Novosibirsk',
		'6.5': '(UTC+06:30) Îles Cocos, Myanmar',
		'7': '(UTC+07:00) Indochine, Krasnoyarsk',
		'8': '(UTC+08:00) Grande Chin, Australie occidentale, Irkutsk',
		'8.75': '(UTC+08:45) Australie occidentale',
		'9': '(UTC+09:00) Japon, Corée, Chine',
		'9.5': '(UTC+09:30) Australie Méridionale',
		'10': '(UTC+10:00) Australie Orientale, Vladivostok',
		'10.5': '(UTC+10:30) Île Lord Howe',
		'11': '(UTC+11:00) Île Salomon, Magadan',
		'11.5': '(UTC+11:30) Île Norfolk',
		'12': '(UTC+12:00) Nouvelle Zélande, Fiji, Kamchatka',
		'12.75': '(UTC+12:45) Îles Chatham',
		'13': '(UTC+13:00) Tonga, Îles Phoenix',
		'14': '(UTC+14:00) Îles de la Ligne',
	} as Record<string, string>,
};
