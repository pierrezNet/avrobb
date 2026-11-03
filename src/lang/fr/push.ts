/**
 * Notifications push (application installable) : textes des notifications et du réglage par appareil.
 */

export const push = {
	privateMessage: (sender: string) => `Message privé de ${sender}`,
	reply: (subject: string) => `Nouvelle réponse : ${subject}`,
	replyBody: (replier: string) => `${replier} a répondu dans une discussion que vous suivez.`,
	legend: 'Notifications sur vos appareils',
	info: 'Installez AvroBB sur votre téléphone ou votre ordinateur, puis activez les notifications : vous serez prévenu·e même forum fermé. Les e-mails ne changent pas.',
	pushPm: 'Messages privés et mentions',
	pushReplies: 'Réponses aux discussions que je suis',
	enable: 'Activer sur cet appareil',
	disable: 'Désactiver sur cet appareil',
	enabled: 'Notifications activées sur cet appareil.',
	denied: 'Les notifications sont bloquées pour AvroBB dans ce navigateur : autorisez-les dans ses réglages.',
	unsupported: 'Ce navigateur ne permet pas les notifications. Sur iPhone et iPad, ajoutez d’abord AvroBB à l’écran d’accueil.',
	failed: 'L’activation a échoué. Réessayez plus tard.',
	needsScript: 'L’activation des notifications demande JavaScript.',
};
