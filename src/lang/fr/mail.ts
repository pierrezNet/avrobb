/**
 * Modèles des e-mails envoyés par le forum. Les balises <nom> sont remplacées par fillTemplate()
 * (services/mail.ts) ; chaque modèle n'utilise que les balises fournies par son expéditeur.
 * Version « full » d'une notification : le message lui-même est inclus.
 */

import type { MailTemplate, MailTemplateName } from '../../services/mail.ts';

const signature = `--
<board_mailer>
(Ne répondez pas à ce message.)`;

export const mail: Readonly<Record<MailTemplateName, MailTemplate>> = {
	new_reply: {
		subject: 'Réponse à « <topic_subject> »',
		body: `<replier> a répondu à la discussion « <topic_subject> », que vous suivez. D'autres réponses ont pu suivre : vous ne recevrez pas d'autre e-mail avant d'être retourné·e sur le forum.

Lire la réponse :
<post_url>

Ne plus suivre cette discussion :
<unsubscribe_url>

${signature}`,
	},
	new_reply_full: {
		subject: 'Réponse à « <topic_subject> »',
		body: `<replier> a répondu à la discussion « <topic_subject> », que vous suivez :

-----------------------------------------------------------------------

<message>

-----------------------------------------------------------------------

Lire la réponse :
<post_url>

Ne plus suivre cette discussion :
<unsubscribe_url>

${signature}`,
	},
	new_topic: {
		subject: 'Nouvelle discussion dans « <forum_name> » : <topic_subject>',
		body: `<poster> a ouvert la discussion « <topic_subject> » dans le forum « <forum_name> », que vous suivez.

Lire la discussion :
<topic_url>

Ne plus suivre ce forum :
<unsubscribe_url>

${signature}`,
	},
	new_topic_full: {
		subject: 'Nouvelle discussion dans « <forum_name> » : <topic_subject>',
		body: `<poster> a ouvert la discussion « <topic_subject> » dans le forum « <forum_name> », que vous suivez :

-----------------------------------------------------------------------

<message>

-----------------------------------------------------------------------

Lire la discussion :
<topic_url>

Ne plus suivre ce forum :
<unsubscribe_url>

${signature}`,
	},
	banned_email_post: {
		subject: 'Alerte : message avec une adresse bannie',
		body: `L'invité « <username> » a publié un message avec une adresse e-mail bannie (<email>).

Voir le message :
<post_url>

${signature}`,
	},
	form_email: {
		subject: '<mail_subject>',
		body: `<sender>, membre de <board_title>, vous a écrit depuis le forum :

-----------------------------------------------------------------------

<mail_message>

-----------------------------------------------------------------------

Vous pouvez lui répondre directement : ce message porte son adresse en réponse.

--
<board_mailer>`,
	},
	new_report: {
		subject: 'Signalement dans le forum n° <forum_id> : « <topic_subject> »',
		body: `<username> a signalé un message.

Message :
<post_url>

Motif :
<reason>

${signature}`,
	},
	new_pm: {
		subject: 'Nouveau message privé sur <board_title>',
		body: `<sender> vous a envoyé un message privé.

Le lire :
<pm_url>

${signature}`,
	},
	new_pm_full: {
		subject: 'Nouveau message privé sur <board_title>',
		body: `<sender> vous a envoyé un message privé :

-----------------------------------------------------------------------

<message>

-----------------------------------------------------------------------

Lui répondre :
<pm_url>

${signature}`,
	},
	/** Retour d'une application source (Phraséo, Donne Ton Point) : <app> est son nom. */
	app_feedback: {
		subject: 'Retour <app> : <type>',
		body: `Nouveau retour de <pseudo> envoyé depuis l'application <app> (<type>), rangé dans le forum privé « à trier ».

Contact laissé par l'auteur (non publié) : <contact>

Le lire, y répondre ou le déplacer vers le forum public :
<post_url>

${signature}`,
	},
};
