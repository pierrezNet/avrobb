/**
 * Textes de la messagerie privée (mod APMS) affichés dans l'en-tête. Source : lang/French/pms.php.
 * « PM » y vaut <acronym title="Messages Privés">MP</acronym> : découpé ici en abréviation + titre.
 */

export const pms = {
	pmAbbr: 'MP',
	pmTitle: 'Messages privés',
	newMessage: 'Vous avez un message privé non lu\u00a0!',
	newMessages: (count: number) => `Vous avez ${count} messages privés non lus\u00a0!`,
	fullBoxes: 'Vos boîtes de messages privés sont pleines\u00a0!',
	emptyBoxes: 'Vos boîtes de messages privés sont vides.',
	fullTo: (percent: number) => `Boîtes de messages privés pleines à ${percent}\u00a0%`,
};
