/**
 * Traduction automatique : protection du BBCode par des marqueurs, restauration contrôlée,
 * réponse du modèle (services/translation.ts).
 */

import { describe, expect, it } from 'vitest';
import {
	hasTranslatableText,
	parseModelReply,
	protectText,
	restoreText,
	targetLocale,
	translationInstructions,
} from '../src/services/translation.ts';

describe('protectText()', () => {
	it('balises, code, images, adresses remplacés par des marqueurs ; le texte reste', () => {
		const source =
			'Salut [b]tout le monde[/b] ! Voir [url=https://ex.test/a]ce lien[/url], https://ex.test/b et [img]https://ex.test/c.png[/img]\n[code]const a = 1;[/code]';
		const prepared = protectText(source, 'post');
		expect(prepared.text).toBe('Salut ⟦0⟧tout le monde⟦1⟧ ! Voir ⟦2⟧ce lien⟦3⟧, ⟦4⟧ et ⟦5⟧\n⟦6⟧');
		expect(prepared.tokens).toEqual([
			'[b]',
			'[/b]',
			'[url=https://ex.test/a]',
			'[/url]',
			'https://ex.test/b',
			'[img]https://ex.test/c.png[/img]',
			'[code]const a = 1;[/code]',
		]);
	});

	it('citation : le nom de l’auteur reste, le texte cité se traduit ; balise de sujet accentuée', () => {
		expect(protectText('[quote=Tessy]Bonjour[/quote] Merci', 'post').text).toBe('⟦0⟧Bonjour⟦1⟧ Merci');
		expect(protectText('[Phraséo] La voix se répète', 'subject')).toEqual({ text: '⟦0⟧ La voix se répète', tokens: ['[Phraséo]'] });
	});

	it('retour d’application : en-tête et champs gardés d’un bloc, seul le texte de l’auteur se traduit', () => {
		const source = '[i]Retour envoyé depuis l’application.[/i]\n\n[b]Envoyé par :[/b] Sam\n[b]Langue :[/b] en\n\nThe [b]badge[/b] counter';
		const header = '[i]Retour envoyé depuis l’application.[/i]\n\n[b]Envoyé par :[/b] Sam\n[b]Langue :[/b] en\n\n';
		const prepared = protectText(source, 'post');
		expect(prepared).toEqual({ text: 'The ⟦0⟧badge⟦1⟧ counter', tokens: ['[b]', '[/b]'], prefix: header });
		// Remis en tête au retour, quoi que fasse le modèle.
		expect(restoreText('Le compteur de ⟦0⟧badges⟦1⟧', prepared, 'post')).toBe(`${header}Le compteur de [b]badges[/b]`);
		// Un message ordinaire commençant en italique n'est pas concerné.
		expect(protectText('[i]Bonjour[/i]\n\nÇa va ?', 'post').tokens).toEqual(['[i]', '[/i]']);
	});

	it('noms propres gardés, en mots entiers seulement', () => {
		const prepared = protectText('Donne Ton Point et la phraséologie de Phraséo', 'post', ['Phraséo', 'Donne Ton Point']);
		expect(prepared).toEqual({ text: '⟦0⟧ et la phraséologie de ⟦1⟧', tokens: ['Donne Ton Point', 'Phraséo'] });
		expect(hasTranslatableText(protectText('Donne Ton Point', 'forum_name', ['Donne Ton Point']))).toBe(false);
	});

	it('description de forum : balises HTML et entités gardées', () => {
		const prepared = protectText('Le <strong>bar</strong> d&#039;AvroBB', 'forum_desc');
		expect(prepared.text).toBe('Le ⟦0⟧bar⟦1⟧ d⟦2⟧AvroBB');
	});

	it('rien à traduire : seulement des liens ou des images', () => {
		expect(hasTranslatableText(protectText('[img]https://ex.test/a.png[/img] https://ex.test', 'post'))).toBe(false);
		expect(hasTranslatableText(protectText('😀 :)', 'post'))).toBe(false);
		expect(hasTranslatableText(protectText('Super [b]vol[/b]', 'post'))).toBe(true);
	});
});

describe('restoreText()', () => {
	const prepared = protectText('Voir [url=https://ex.test]ici[/url] [b]vite[/b]', 'post');

	it('marqueurs remis à leur place, même dans un autre ordre', () => {
		expect(restoreText('See ⟦0⟧here⟦1⟧ ⟦2⟧quickly⟦3⟧', prepared, 'post')).toBe('See [url=https://ex.test]here[/url] [b]quickly[/b]');
		expect(restoreText('⟦2⟧Quickly⟦3⟧ see ⟦0⟧here⟦1⟧', prepared, 'post')).toBe('[b]Quickly[/b] see [url=https://ex.test]here[/url]');
	});

	it('texte sans marqueur : un marqueur inventé par le modèle est retiré', () => {
		expect(restoreText('Put down your glass. ⟦0⟧', protectText('Pose ton verre.', 'post'), 'post')).toBe('Put down your glass.');
	});

	it('marqueur manquant, en double ou inconnu : traduction jetée', () => {
		expect(restoreText('See here ⟦2⟧quickly⟦3⟧', prepared, 'post')).toBeNull();
		expect(restoreText('⟦0⟧⟦0⟧here⟦1⟧ ⟦2⟧quickly⟦3⟧', prepared, 'post')).toBeNull();
		expect(restoreText('⟦0⟧here⟦1⟧ ⟦2⟧quickly⟦3⟧ ⟦9⟧', prepared, 'post')).toBeNull();
	});

	it('description de forum : le texte traduit ne peut pas ajouter de balise HTML', () => {
		const html = protectText('Le <strong>bar</strong>', 'forum_desc');
		expect(restoreText('The ⟦0⟧bar⟦1⟧ <script>x</script>', html, 'forum_desc')).toBe(
			'The <strong>bar</strong> &lt;script&gt;x&lt;/script&gt;',
		);
	});
});

describe('réponse du modèle', () => {
	const prepared = protectText('Bonjour à tous', 'post');

	it('JSON entouré de texte accepté ; langue et traduction contrôlées', () => {
		expect(parseModelReply('Voici : {"source": "fr", "translation": "Hello everyone"} fin', prepared)).toEqual({
			source: 'fr',
			translation: 'Hello everyone',
		});
		expect(parseModelReply('{"source": "de", "translation": "Hallo"}', prepared)).toBeNull();
		expect(parseModelReply('{"source": "fr", "translation": "  "}', prepared)).toBeNull();
		expect(parseModelReply('pas de JSON', prepared)).toBeNull();
		expect(parseModelReply('{"source": "fr", "translation": "', prepared)).toBeNull();
		expect(parseModelReply(JSON.stringify({ source: 'fr', translation: 'x'.repeat(500) }), prepared)).toBeNull();
	});

	it('langue de la traduction ; consigne propre au type de texte', () => {
		expect(targetLocale('fr')).toBe('en');
		expect(targetLocale('en')).toBe('fr');
		expect(targetLocale('other')).toBe('fr');
		expect(translationInstructions('subject', false)).toContain('a forum topic title');
		expect(translationInstructions('post', true)).toContain('never answer');
		// Marqueurs mentionnés seulement s'il y en a : sinon le modèle en invente.
		expect(translationInstructions('post', true)).toContain('⟦0⟧');
		expect(translationInstructions('post', false)).not.toContain('⟦');
	});
});
