/**
 * Retours des applications sources (Phraséo, Donne Ton Point) : validation, sujet, message et
 * contrôleur avec doublures (sujet du forum privé, e-mail à la liste d'administration).
 */

import { describe, expect, it } from 'vitest';
import type { Mailer } from '../src/adapters/mailer.ts';
import { AppFeedbackController } from '../src/controllers/AppFeedbackController.ts';
import type { BoardConfig, FeedbackSourceId } from '../src/domain/models.ts';
import { appFeedback as allTexts } from '../src/lang/fr/appFeedback.ts';
import { mail } from '../src/lang/fr/mail.ts';
import type { NewTopic } from '../src/repositories/PostingRepository.ts';
import { appFeedbackMessage, appFeedbackSubject, FEEDBACK_SOURCES, parseAppFeedback } from '../src/services/appFeedback.ts';
import { inertBbcode } from '../src/services/bbcode.ts';
import type { MailMessage } from '../src/services/mail.ts';
import { MAX_SUBJECT_LENGTH } from '../src/services/posting.ts';
import { boardConfig } from './fixtures.ts';

const phraseo = FEEDBACK_SOURCES.phraseo;
const dtp = FEEDBACK_SOURCES.donneTonPoint;
const texts = allTexts.phraseo;
const dtpTexts = allTexts.donneTonPoint;

const valid = {
	type: 'Bug technique',
	message: "La voix de l'ATC se répète après ma réponse.\nDétails : Chrome, casque Bluetooth.",
	pseudo: 'Pilote42',
	contact: 'pilote@example.org',
	mode: 'IFR',
	level: 'avancé',
	lang: 'fr',
};

const validDtp = {
	type: 'Suggestion / idée',
	message: 'Annuler un point plus tard.\nMerci !',
	pseudo: '  Équipe   Bleue ',
	contact: 'equipe@example.org',
	lang: 'en',
};

describe('parseAppFeedback (Phraséo)', () => {
	it('pseudo facultatif (ancien formulaire)', () => {
		const { pseudo: _pseudo, ...withoutPseudo } = valid;
		expect(parseAppFeedback(phraseo, withoutPseudo)?.pseudo).toBe('');
	});

	it('accepte le format du formulaire, espaces retirés', () => {
		expect(parseAppFeedback(phraseo, { ...valid, message: '  Bonjour  ' })).toEqual({
			source: 'phraseo',
			type: 'Bug technique',
			message: 'Bonjour',
			pseudo: 'Pilote42',
			contact: 'pilote@example.org',
			lang: 'fr',
			details: [
				{ name: 'mode', value: 'IFR' },
				{ name: 'level', value: 'avancé' },
			],
		});
	});

	it('refuse type inconnu, message vide ou trop long, mode ou langue invalides', () => {
		expect(parseAppFeedback(phraseo, { ...valid, type: 'Pub' })).toBeNull();
		expect(parseAppFeedback(phraseo, { ...valid, message: ' ' })).toBeNull();
		expect(parseAppFeedback(phraseo, { ...valid, message: 'x'.repeat(1801) })).toBeNull();
		expect(parseAppFeedback(phraseo, { ...valid, mode: 'ULM' })).toBeNull();
		expect(parseAppFeedback(phraseo, { ...valid, level: 'x'.repeat(21) })).toBeNull();
		expect(parseAppFeedback(phraseo, { ...valid, lang: 'de' })).toBeNull();
		expect(parseAppFeedback(phraseo, { ...valid, pseudo: 'x'.repeat(41) })).toBeNull();
		expect(parseAppFeedback(phraseo, null)).toBeNull();
	});
});

describe('parseAppFeedback (Donne Ton Point)', () => {
	it('accepte le format du formulaire : espaces retirés, pseudo réduit, aucun champ propre', () => {
		expect(parseAppFeedback(dtp, validDtp)).toEqual({
			source: 'donneTonPoint',
			type: 'Suggestion / idée',
			message: 'Annuler un point plus tard.\nMerci !',
			pseudo: 'Équipe Bleue',
			contact: 'equipe@example.org',
			lang: 'en',
			details: [],
		});
	});

	it('pseudo, contact et langue facultatifs ; règle de vol et niveau ignorés', () => {
		const feedback = parseAppFeedback(dtp, { type: 'Bug', message: 'Plantage', mode: 'ULM', level: 'x'.repeat(50) });
		expect(feedback).toMatchObject({ pseudo: '', contact: '', lang: '', details: [] });
	});

	it('limites : message 1 à 1800, pseudo 40, contact 120', () => {
		expect(parseAppFeedback(dtp, { ...validDtp, message: 'x'.repeat(1800) })).not.toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, message: 'x'.repeat(1801) })).toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, message: '   ' })).toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, pseudo: 'x'.repeat(40) })).not.toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, pseudo: 'x'.repeat(41) })).toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, contact: 'x'.repeat(120) })).not.toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, contact: 'x'.repeat(121) })).toBeNull();
	});

	it('refuse les types de Phraséo, une langue inconnue, un champ mal typé', () => {
		for (const type of ['Bug', 'Suggestion / idée', 'Question', 'Autre'])
			expect(parseAppFeedback(dtp, { ...validDtp, type })).not.toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, type: 'Bug technique' })).toBeNull();
		expect(parseAppFeedback(phraseo, { ...validDtp, type: 'Question' })).toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, lang: 'de' })).toBeNull();
		expect(parseAppFeedback(dtp, { ...validDtp, message: 42 })).toBeNull();
		expect(parseAppFeedback(dtp, 'Bug')).toBeNull();
	});
});

describe('sujet et message (Phraséo)', () => {
	const feedback = parseAppFeedback(phraseo, valid)!;

	it('sujet « [Phraséo] type : début du message », dans la limite des sujets', () => {
		expect(appFeedbackSubject(feedback, texts)).toBe("[Phraséo] Bug technique : La voix de l'ATC se répète après ma réponse.");
		const long = appFeedbackSubject({ ...feedback, message: 'mot '.repeat(40) }, texts);
		expect(long.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
		expect(long.endsWith('…')).toBe(true);
	});

	it('le contact n’apparaît jamais dans le message', () => {
		const message = appFeedbackMessage(feedback, texts);
		expect(message).not.toContain('pilote@example.org');
		expect(message).toContain('[b]Règle de vol :[/b] IFR');
		expect(message).toContain('[b]Envoyé par :[/b] Pilote42');
		expect(message).toContain('Chrome, casque Bluetooth.');
	});

	it('message identique à celui d’avant la généralisation', () => {
		expect(appFeedbackMessage(feedback, texts)).toBe(
			`[i]${texts.header}[/i]\n\n[b]Envoyé par :[/b] Pilote42\n[b]Type :[/b] Bug technique\n[b]Règle de vol :[/b] IFR\n[b]Niveau :[/b] avancé\n[b]Langue :[/b] fr\n\n${valid.message}`,
		);
	});

	it('le texte de l’auteur ne peut pas produire de balise BBCode', () => {
		expect(inertBbcode('[url=https://spam.example]clic[/url]')).toBe('[​url=https://spam.example]clic[​/url]');
		expect(appFeedbackMessage({ ...feedback, message: '[img]x[/img]' }, texts)).not.toContain('[img]');
	});
});

describe('sujet et message (Donne Ton Point)', () => {
	const feedback = parseAppFeedback(dtp, validDtp)!;

	it('sujet « [Donne Ton Point] type : début du message »', () => {
		expect(appFeedbackSubject(feedback, dtpTexts)).toBe('[Donne Ton Point] Suggestion / idée : Annuler un point plus tard.');
		const long = appFeedbackSubject({ ...feedback, message: 'mot '.repeat(40) }, dtpTexts);
		expect(long.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
		expect(long.endsWith('…')).toBe(true);
	});

	it('contexte : pseudo, type et langue, sans règle de vol ni niveau, sans le contact', () => {
		expect(appFeedbackMessage(feedback, dtpTexts)).toBe(
			`[i]${dtpTexts.header}[/i]\n\n[b]Envoyé par :[/b] Équipe Bleue\n[b]Type :[/b] Suggestion / idée\n[b]Langue :[/b] en\n\n${validDtp.message}`,
		);
		const empty = appFeedbackMessage({ ...feedback, pseudo: '', lang: '' }, dtpTexts);
		expect(empty).toContain('[b]Envoyé par :[/b] —');
		expect(empty).toContain('[b]Langue :[/b] —');
		expect(empty).not.toContain('equipe@example.org');
	});

	it('pseudo et message rendus inertes au BBCode', () => {
		const message = appFeedbackMessage({ ...feedback, pseudo: '[b]x[/b]', message: '[url=https://spam.example]clic[/url]' }, dtpTexts);
		expect(message).not.toContain('[url=');
		expect(message).toContain('[​b]x[​/b]');
		expect(appFeedbackSubject({ ...feedback, message: '[img]x[/img]' }, dtpTexts)).not.toContain('[img]');
	});
});

describe('AppFeedbackController', () => {
	const destinations = {
		phraseo: { forumId: 9, userId: 7, targetForumId: 4 },
		donneTonPoint: { forumId: 11, userId: 8, targetForumId: 3 },
	};
	const setup = (source: FeedbackSourceId = 'phraseo', config: BoardConfig = { ...boardConfig, appFeedback: destinations }) => {
		const topics: NewTopic[] = [];
		const mails: MailMessage[] = [];
		const mailer: Mailer = {
			send: async (message) => {
				mails.push(message);
			},
		};
		const controller = new AppFeedbackController(source, {
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
			texts: allTexts,
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
		expect(mails[0]!.text).toContain("Nouveau retour de Pilote42 envoyé depuis l'application Phraséo (Bug technique)");
		expect(mails[0]!.text).toContain('314');
	});

	it('refuse un retour mal formé, et ne fait rien sans la migration 0005', async () => {
		const { controller, topics } = setup();
		expect(await controller.submit({ ...valid, type: 'Pub' })).toEqual({ ok: false, reason: 'invalid' });
		const off = setup('phraseo', { ...boardConfig, appFeedback: { ...destinations, phraseo: null } });
		expect(await off.controller.submit(valid)).toEqual({ ok: false, reason: 'disabled' });
		expect([...topics, ...off.topics]).toHaveLength(0);
	});

	it('Donne Ton Point : sujet dans son propre forum privé, signé par son compte système', async () => {
		const { controller, topics, mails } = setup('donneTonPoint');
		expect(await controller.submit(validDtp)).toEqual({ ok: true, topicId: 42 });
		const topic = topics[0]!;
		expect(topic.forumId).toBe(11);
		expect(topic.author).toEqual({ kind: 'member', id: 8, username: 'Retours Donne Ton Point', promoteTo: null });
		expect(topic.ip).toBe('');
		expect(topic.subject).toBe('[Donne Ton Point] Suggestion / idée : Annuler un point plus tard.');
		expect(topic.message).toContain(dtpTexts.header);
		expect(topic.message).not.toContain('equipe@example.org');

		expect(mails).toHaveLength(1);
		expect(mails[0]!.subject).toBe('Retour Donne Ton Point : Suggestion / idée');
		expect(mails[0]!.text).toContain("Nouveau retour de Équipe Bleue envoyé depuis l'application Donne Ton Point");
		expect(mails[0]!.text).toContain('equipe@example.org');
	});

	it('Donne Ton Point : contact et pseudo absents remplacés dans l’e-mail', async () => {
		const { controller, mails } = setup('donneTonPoint');
		await controller.submit({ type: 'Bug', message: 'Plantage' });
		expect(mails[0]!.text).toContain('Nouveau retour de un anonyme');
		expect(mails[0]!.text).toContain('(non publié) : aucun');
	});

	it('Donne Ton Point : refusé s’il est mal formé, désactivé sans la migration 0008, sans toucher à Phraséo', async () => {
		const { controller, topics } = setup('donneTonPoint');
		expect(await controller.submit(valid)).toEqual({ ok: false, reason: 'invalid' });
		const off = setup('donneTonPoint', { ...boardConfig, appFeedback: { ...destinations, donneTonPoint: null } });
		expect(await off.controller.submit(validDtp)).toEqual({ ok: false, reason: 'disabled' });
		const phraseoStill = setup('phraseo', { ...boardConfig, appFeedback: { ...destinations, donneTonPoint: null } });
		expect(await phraseoStill.controller.submit(valid)).toEqual({ ok: true, topicId: 42 });
		expect([...topics, ...off.topics]).toHaveLength(0);
	});

	it('pas d’e-mail sans liste d’administration', async () => {
		const { controller, mails } = setup('donneTonPoint', {
			...boardConfig,
			appFeedback: destinations,
			registration: { ...boardConfig.registration, mailingList: '' },
		});
		expect(await controller.submit(validDtp)).toEqual({ ok: true, topicId: 42 });
		expect(mails).toHaveLength(0);
	});
});
