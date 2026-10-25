/**
 * Textes de la renommée (reputation.php). Source : lang/French/reputation.php ; les quelques
 * messages restés en anglais dans le PHP sont traduits.
 */

import type { ReasonError, ReputationAccessError, VoteError } from '../../services/reputation.ts';
import { post } from './post.ts';

const ACCESS: Record<ReputationAccessError, string> = {
	groupDisabled: 'Votre groupe ne peut pas utiliser le système de renommée.',
	disabled: 'Système de renommée actuellement désactivé',
	yourDisabled: 'Vous ne pouvez pas utiliser le système de renommée car vous l’avez désactivé dans votre profil.',
};

export const reputation = {
	reputation: 'Renommée',
	accessError: (error: ReputationAccessError) => ACCESS[error],
	voteError: (error: VoteError, timeoutMinutes: number): string => {
		switch (error) {
			case 'guest':
				return "Vous n'êtes pas autorisé(e) à afficher cette page.";
			case 'self':
				return 'Vous ne pouvez pas voter pour vous-même.';
			case 'userDisabled':
				return 'Le membre a désactivé l’utilisation des renommées.';
			case 'timeout':
				return `Veuillez patienter ${timeoutMinutes} minutes avant de pouvoir donner une autre voix.`;
			case 'notEnoughPosts':
				return 'Quantité de messages insuffisante pour changer la renommée.';
		}
	},
	reasonError: (error: ReasonError): string =>
		error.kind === 'noMessage'
			? 'Raison requise'
			: error.kind === 'tooLong'
				? 'Raison trop longue (400 caractères au plus).'
				: post.preparseError(error.error),
	userReputation: (username: string) => `Renommée du membre ${username}`,
	totals: (plus: number, minus: number) => `[+${plus} / -${minus}]`,
	noReputation: 'Aucune renommée',
	forTopic: 'Discussion',
	removedOrDeleted: 'Enlevée ou effacée',
	profileDeleted: 'Profil effacé',
	plusVote: 'Vote positif',
	minusVote: 'Vote négatif',
	from: (name: string) => `de ${name}`,
	selectVote: (date: string) => `Sélectionner le vote du ${date}`,
	deleteSelected: 'Supprimer les votes sélectionnés',
	areYouSure: 'Êtes-vous certain de vouloir supprimer ces votes ?',
	mustSelect: 'Vous devez sélectionner des votes.',
	deleted: 'Votes supprimés.',
	formHeader: 'S’il vous plaît, remplissez le formulaire',
	formYourName: 'Votre nom d’utilisateur',
	formToName: 'Le membre dont la renommée va être changée',
	formReason: 'La raison du changement de renommée',
	formMethod: 'Méthode',
	plus: 'Augmentation de renommée',
	minus: 'Réduction de renommée',
	reasonHelp: '400 caractères au plus.',
	submit: 'Valider',
	errorsTitle: 'Erreurs',
	errorsInfo: 'Les erreurs suivantes doivent être corrigées :',
};
