/**
 * Parité du parseur BBCode avec le PHP de PV : chaque cas de cases.json est comparé à la sortie
 * du vrai include/parser.php (reference.json, régénéré par `npm run bbcode:reference`).
 *
 * Les écarts volontaires (voir l'en-tête de src/services/bbcode.ts) sont listés dans DEVIATIONS et
 * vérifiés par des assertions dédiées ; tout le reste doit être identique au caractère près.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { type BbcodeOptions, parseMessage, parseSignature } from '../../src/services/bbcode.ts';
import { buildCensor } from '../../src/services/censor.ts';

interface Case {
	name: string;
	text: string;
	signature?: boolean;
}

const dir = import.meta.dirname;
const cases = JSON.parse(readFileSync(path.join(dir, 'cases.json'), 'utf8')) as Case[];
const reference = JSON.parse(readFileSync(path.join(dir, 'reference.json'), 'utf8')) as Record<string, string>;

const options: BbcodeOptions = {
	bbcode: true,
	imgTag: true,
	showImages: true,
	smilies: true,
	censor: null,
	baseUrl: 'http://forum.test',
	indentSpaces: 4,
	labels: { wrote: (author) => `${author} a écrit&#160;:`, imageLink: 'image', spoiler: 'Spoiler', video: 'Vidéo' },
};

const render = (c: Case, opts = options): string => (c.signature === true ? parseSignature(c.text, opts) : parseMessage(c.text, opts));

/** Seul ajout systématique de Node : le chargement différé des images. */
const normalize = (html: string): string => html.replaceAll(' loading="lazy"', '');

const DEVIATIONS = new Set([
	'émoticônes',
	'émoticônes collées',
	'signature simple',
	'acronym',
	'alignements',
	'spoiler',
	'vidéo youtube',
	'lien interne',
	'citation non fermée',
	'injection attribut acronym',
	'marqueur interne',
]);

const byName = (name: string): Case => {
	const found = cases.find((c) => c.name === name);
	if (found === undefined) throw new Error(`Cas inconnu : ${name}`);
	return found;
};

describe('parité avec include/parser.php', () => {
	it('chaque cas a une sortie de référence', () => {
		expect(cases.filter((c) => reference[c.name] === undefined).map((c) => c.name)).toEqual([]);
	});

	it.each(cases.filter((c) => !DEVIATIONS.has(c.name)).map((c) => [c.name, c] as const))('%s', (_name, c) => {
		expect(normalize(render(c))).toBe(reference[c.name]);
	});
});

describe('écarts volontaires', () => {
	it('émoticônes : émojis Unicode aux mêmes endroits que les images du PHP', () => {
		for (const name of ['émoticônes', 'émoticônes collées', 'signature simple']) {
			const php = reference[name] ?? '';
			const node = render(byName(name));
			const phpSmileys = php.match(/class="smiley"/g)?.length ?? 0;
			expect(node.match(/class="smiley"/g)?.length ?? 0, name).toBe(phpSmileys);
			expect(normalize(node).replace(/<span class="smiley" role="img" aria-label="(\w+)">[^<]+<\/span>/g, '«$1»')).toBe(
				php.replace(/<img src="[^"]*" class="smiley" alt="(\w+)" \/>/g, '«$1»'),
			);
		}
		expect(render(byName('émoticônes'))).toContain('<span class="smiley" role="img" aria-label="smile">🙂</span>');
	});

	it('acronym devient abbr, alignements en classes', () => {
		expect(render(byName('acronym'))).toBe('<p><abbr>ATC</abbr> <abbr title="Air Traffic Control">ATC</abbr></p>');
		expect(render(byName('alignements'))).toBe(
			'<p class="bbcode-center">milieu</p><p class="bbcode-right">droite</p><p class="bbcode-left">gauche</p><p class="bbcode-justify">j</p>',
		);
	});

	it('spoiler en <details>, sans JavaScript', () => {
		expect(render(byName('spoiler'))).toBe('<details class="spoiler"><summary>Spoiler</summary><p>la fin</p></details>');
	});

	it('vidéo : lecteur intégré construit à partir de l’identifiant, sinon lien', () => {
		expect(render(byName('vidéo youtube'))).toContain('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
		const other = parseMessage('[video]https://example.test/x" onload="alert(1)[/video]', options);
		expect(other).not.toContain('<iframe');
		expect(other).not.toContain('" onload');
	});

	it('liens internes corrigés (le PHP de PV produit « id=.$matches[1] »)', () => {
		expect(reference['lien interne']).toContain('.$matches[1]');
		expect(render(byName('lien interne'))).toBe(
			'<p><a href="viewtopic.php?id=4">viewtopic.php?id=4</a> <a href="viewtopic.php?pid=12#p12">message</a></p>',
		);
	});
});

describe('écarts de robustesse', () => {
	it('citation déséquilibrée laissée en texte (le PHP ouvre des <div> jamais fermés)', () => {
		expect(reference['citation non fermée']).not.toContain('</div>');
		expect(render(byName('citation non fermée'))).toBe('<p>[quote=A]sans fin</p>');
	});

	it('attribut title échappé, comme le PHP', () => {
		expect(render(byName('injection attribut acronym'))).toBe('<p><abbr title="&quot; onmouseover=&quot;alert(1)">x</abbr></p>');
	});

	it('un caractère \\x01 saisi ne devient pas un bloc de code (bug du PHP)', () => {
		expect(render(byName('marqueur interne'))).toBe('<p>ab </p><div class="codebox"><pre><code>c</code></pre></div>');
	});
});

describe('options', () => {
	it('sans BBCode, le texte est seulement échappé', () => {
		expect(parseMessage('[b]<i>[/b]', { ...options, bbcode: false })).toBe('<p>[b]&lt;i&gt;[/b]</p>');
	});

	it('images masquées par le lecteur : lien « <image - nom> »', () => {
		expect(parseMessage('[img]http://a.test/p.png[/img]', { ...options, showImages: false })).toBe(
			'<p><a href="http://a.test/p.png" rel="nofollow">&lt;image - p.png&gt;</a></p>',
		);
	});

	it('[img] non reconnue si p_message_img_tag est désactivé', () => {
		expect(parseMessage('[img]http://a.test/p.png[/img]', { ...options, imgTag: false })).toBe('<p>[img]http://a.test/p.png[/img]</p>');
	});

	it('émoticônes désactivées (hide_smilies ou préférence)', () => {
		expect(parseMessage('ok :)', { ...options, smilies: false })).toBe('<p>ok :)</p>');
	});

	it('censure appliquée avant l’échappement, mots entiers, joker *', () => {
		const censor = buildCensor([
			{ searchFor: 'zut', replaceWith: '***' },
			{ searchFor: 'flûte*', replaceWith: '[censuré]' },
		]);
		expect(parseMessage('Zut, zutalors, flûtiau flûteries <zut>', { ...options, censor })).toBe(
			'<p>***, zutalors, flûtiau [censuré] &lt;***&gt;</p>',
		);
	});
});
