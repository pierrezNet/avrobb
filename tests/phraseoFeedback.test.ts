import { describe, expect, it } from 'vitest';
import type { Mailer } from '../src/adapters/mailer.ts';
import { PhraseoFeedbackController } from '../src/controllers/PhraseoFeedbackController.ts';
import type { BoardConfig } from '../src/domain/models.ts';
import { mail } from '../src/lang/fr/mail.ts';
import { phraseoFeedback as texts } from '../src/lang/fr/phraseoFeedback.ts';
import type { NewTopic } from '../src/repositories/PostingRepository.ts';
import type { MailMessage } from '../src/services/mail.ts';
import { inertBbcode, parsePhraseoFeedback, phraseoFeedbackMessage, phraseoFeedbackSubject } from '../src/services/phraseoFeedback.ts';
import { MAX_SUBJECT_LENGTH } from '../src/services/posting.ts';
import { boardConfig } from './fixtures.ts';

const valid = {
	type: 'Bug technique',
	message: "La voix de l'ATC se répète après ma réponse.\nDétails : Chrome, casque Bluetooth.",
	pseudo: 'Pilote42',
	contact: 'pilote@example.org',
	mode: 'IFR',
	level: 'avancé',
	lang: 'fr',
};

describe('parsePhraseoFeedback', () => {
	it('pseudo facultatif (ancien formulaire)', () => {
		const { pseudo: _pseudo, ...withoutPseudo } = valid;
		expect(parsePhraseoFeedback(withoutPseudo)?.pseudo).toBe('');
	});

	it('accepte le format du formulaire, espaces retirés', () => {
		expect(parsePhraseoFeedback({ ...valid, message: '  Bonjour  ' })).toEqual({ ...valid, message: 'Bonjour' });
	});

	it('refuse type inconnu, message vide ou trop long, mode ou langue invalides', () => {
		expect(parsePhraseoFeedback({ ...valid, type: 'Pub' })).toBeNull();
		expect(parsePhraseoFeedback({ ...valid, message: ' ' })).toBeNull();
		expect(parsePhraseoFeedback({ ...valid, message: 'x'.repeat(1801) })).toBeNull();
		expect(parsePhraseoFeedback({ ...valid, mode: 'ULM' })).toBeNull();
		expect(parsePhraseoFeedback({ ...valid, lang: 'de' })).toBeNull();
		expect(parsePhraseoFeedback({ ...valid, pseudo: 'x'.repeat(41) })).toBeNull();
		expect(parsePhraseoFeedback(null)).toBeNull();
	});
});

describe('sujet et message', () => {
	const feedback = parsePhraseoFeedback(valid)!;

	it('sujet « [Phraséo] type : début du message », dans la limite des sujets', () => {
		expect(phraseoFeedbackSubject(feedback, texts)).toBe("[Phraséo] Bug technique : La voix de l'ATC se répète après ma réponse.");
		const long = phraseoFeedbackSubject({ ...feedback, message: 'mot '.repeat(40) }, texts);
		expect(long.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
		expect(long.endsWith('…')).toBe(true);
	});

	it('le contact n’apparaît jamais dans le message', () => {
		const message = phraseoFeedbackMessage(feedback, texts);
		expect(message).not.toContain('pilote@example.org');
		expect(message).toContain('[b]Règle de vol :[/b] IFR');
		expect(message).toContain('[b]Envoyé par :[/b] Pilote42');
		expect(message).toContain('Chrome, casque Bluetooth.');
	});

	it('le texte de l’auteur ne peut pas produire de balise BBCode', () => {
		expect(inertBbcode('[url=https://spam.example]clic[/url]')).toBe('[​url=https://spam.example]clic[​/url]');
		expect(phraseoFeedbackMessage({ ...feedback, message: '[img]x[/img]' }, texts)).not.toContain('[img]');
	});
});

describe('PhraseoFeedbackController', () => {
	const setup = (config: BoardConfig = { ...boardConfig, phraseoFeedback: { forumId: 9, userId: 7, targetForumId: 4 } }) => {
		const topics: NewTopic[] = [];
		const mails: MailMessage[] = [];
		const mailer: Mailer = {
			send: async (message) => {
				mails.push(message);
			},
		};
		const controller = new PhraseoFeedbackController({
			config: { load: async () => config },
			posting: {
				createTopic: async (topic) => {
					topics.push(topic);
					return { topicId: 42, postId: 314 };
				},
			},
			stopwords: { load: async () => new Set<string>() },
			mailer,
			mailTemplates: { load: async (name) => mail[name] },
			texts,
			clock: () => 1_800_000_000,
			logger: { error: () => {}, info: () => {} },
		});
		return { controller, topics, mails };
	};

	it('crée le sujet dans le forum privé, signé par le compte système, sans le contact', async () => {
		const { controller, topics } = setup();
		expect(await controller.submit(valid)).toEqual({ ok: true, topicId: 42 });
		expect(topics).toHaveLength(1);
		const topic = topics[0]!;
		expect(topic.forumId).toBe(9);
		expect(topic.author).toEqual({ kind: 'member', id: 7, username: 'Retours Phraséo', promoteTo: null });
		expect(topic.ip).toBe('');
		expect(topic.message).not.toContain('pilote@example.org');
	});

	it('envoie le contact et le lien du sujet à la liste d’administration seulement', async () => {
		const { controller, mails } = setup();
		await controller.submit(valid);
		expect(mails).toHaveLength(1);
		expect(mails[0]!.to).toBe(boardConfig.registration.mailingList);
		expect(mails[0]!.subject).toBe('Retour Phraséo : Bug technique');
		expect(mails[0]!.text).toContain('pilote@example.org');
		expect(mails[0]!.text).toContain('Nouveau retour de Pilote42');
		expect(mails[0]!.text).toContain('314');
	});

	it('refuse un retour mal formé, et ne fait rien sans la migration 0005', async () => {
		const { controller, topics } = setup();
		expect(await controller.submit({ ...valid, type: 'Pub' })).toEqual({ ok: false, reason: 'invalid' });
		const off = setup({ ...boardConfig, phraseoFeedback: null });
		expect(await off.controller.submit(valid)).toEqual({ ok: false, reason: 'disabled' });
		expect([...topics, ...off.topics]).toHaveLength(0);
	});
});
