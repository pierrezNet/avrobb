/**
 * E-mails du forum : validation d'adresse (is_valid_email()) et remplissage des modèles
 * (lang/fr/mail.ts). Fonctions pures, l'envoi est dans adapters/mailer.ts.
 */

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	replyTo?: { email: string; name: string };
}

export interface MailTemplate {
	subject: string;
	body: string;
}

export type MailTemplateName =
	| 'new_reply'
	| 'new_reply_full'
	| 'new_topic'
	| 'new_topic_full'
	| 'banned_email_post'
	| 'form_email'
	| 'new_report'
	| 'new_pm'
	| 'new_pm_full'
	| 'app_feedback';

export interface MailTemplateReader {
	load(name: MailTemplateName): Promise<MailTemplate>;
}

/** is_valid_email() de include/email.php (80 caractères au plus). */
export function isValidEmail(email: string): boolean {
	if (email.length > 80) return false;
	return /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|("[^"]+"))@((\[\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\])|(([a-zA-Z\d-]+\.)+[a-zA-Z]{2,}))$/.test(
		email,
	);
}

/** Remplace les balises <nom> du modèle. */
export function fillTemplate(body: string, values: Readonly<Record<string, string>>): string {
	return body.replace(/<([a-z_]+)>/g, (whole, name: string) => values[name] ?? whole);
}
