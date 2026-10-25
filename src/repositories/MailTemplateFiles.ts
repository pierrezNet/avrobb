/**
 * Modèles d'e-mails de l'installation PHP (lang/French/mail_templates/*.tpl), que l'administrateur
 * peut modifier : on les relit à chaque envoi.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type MailTemplate, parseMailTemplate } from '../services/mail.ts';

export type MailTemplateName =
	| 'activate_password'
	| 'activate_email'
	| 'banned_email_change'
	| 'dupe_email_change'
	| 'welcome'
	| 'new_user'
	| 'banned_email_register'
	| 'dupe_email_register'
	| 'new_reply'
	| 'new_reply_full'
	| 'new_topic'
	| 'new_topic_full'
	| 'banned_email_post'
	| 'form_email'
	| 'new_report'
	| 'new_pm'
	| 'new_pm_full';

export interface MailTemplateReader {
	load(name: MailTemplateName): Promise<MailTemplate>;
}

export class MailTemplateFiles implements MailTemplateReader {
	constructor(private readonly legacyRoot: string) {}

	async load(name: MailTemplateName): Promise<MailTemplate> {
		return parseMailTemplate(await readFile(path.join(this.legacyRoot, 'lang', 'French', 'mail_templates', `${name}.tpl`), 'utf8'));
	}
}
