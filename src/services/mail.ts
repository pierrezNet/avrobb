/**
 * E-mails du forum : validation d'adresse (is_valid_email()), modèles lang/<langue>/mail_templates
 * et mots de passe aléatoires (random_pass()). Fonctions pures, l'envoi est dans adapters/mailer.ts.
 */

import { randomInt } from 'node:crypto';

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

/** is_valid_email() de include/email.php (80 caractères au plus). */
export function isValidEmail(email: string): boolean {
	if (email.length > 80) return false;
	return /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|("[^"]+"))@((\[\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\])|(([a-zA-Z\d-]+\.)+[a-zA-Z]{2,}))$/.test(
		email,
	);
}

/**
 * Modèle .tpl : première ligne « Subject: … », puis le corps (comme login.php). Les modèles de la
 * messagerie (new_pm*.tpl) commencent par « Sujet : » : le PHP retire les 8 premiers caractères,
 * on retire l'un ou l'autre intitulé.
 */
export function parseMailTemplate(raw: string): MailTemplate {
	const text = raw.replaceAll('\r\n', '\n').trim();
	const firstBreak = text.indexOf('\n');
	const subjectLine = firstBreak === -1 ? text : text.slice(0, firstBreak);
	return {
		subject: subjectLine.replace(/^(?:Subject|Sujet)\s?:/, '').trim(),
		body: firstBreak === -1 ? '' : text.slice(firstBreak).trim(),
	};
}

/** Remplace les balises <nom> du modèle. */
export function fillTemplate(body: string, values: Readonly<Record<string, string>>): string {
	return body.replace(/<([a-z_]+)>/g, (whole, name: string) => values[name] ?? whole);
}

const ALPHANUMERIC = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * random_pass() : le PHP tire du base64, dont « + » et « / » abîment le lien d'activation (« + » y
 * devient une espace) ; on se limite aux lettres et chiffres non ambigus, acceptés de la même façon.
 */
export function randomPassword(length: number): string {
	return Array.from({ length }, () => ALPHANUMERIC.charAt(randomInt(ALPHANUMERIC.length))).join('');
}
