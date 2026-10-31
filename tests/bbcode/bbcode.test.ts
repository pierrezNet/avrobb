/**
 * Non-régression du parseur BBCode : chaque cas de cases.json est comparé à reference.json, sortie
 * du include/parser.php de FluxBB/PV relevée une fois pour toutes (instantané figé : le PHP n'est
 * plus disponible). Un changement voulu du rendu se reporte à la main dans reference.json.
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

/** Ajouts systématiques de Node : chargement différé des images, espace après un retour à la ligne. */
const normalize = (html: string): string => html.replaceAll(' loading="lazy"', '').replaceAll('<span class="bbcode-gap"></span>', '');

const DEVIATIONS = new Set([
	'émoticônes',
	'émoticônes collées',
	'signature simple',
	'acronym',
	'alignements',
	'spoiler',
	'vidéo youtube',
	'lien interne',
	'url relative',
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

	it('aucun attribut injecté par une adresse ou une balise imbriquée (revue de sécurité du lot 8)', () => {
		// Lien vers une page du forum : le « " » reste dans l'adresse, échappé.
		expect(parseMessage('[url=/profile.php?id=3#"style="color:red"]clic[/url]', options)).toBe(
			'<p><a href="http://forum.test/membre/3#&quot;style=&quot;color:red&quot;" rel="nofollow">clic</a></p>',
		);
		// [acronym=…] converti avant [email] et [img=…] : son HTML ne doit pas atterrir dans un attribut.
		for (const source of [
			'[email][acronym=style=color:red id=x]S[/acronym][/email]',
			'[email=[acronym=style=color:red]a[/acronym]]b[/email]',
			'[img=[acronym=style=color:red x]y[/acronym]]https://e.test/f.png[/img]',
		]) {
			const html = parseMessage(source, options);
			expect(html).not.toMatch(/(?:href|alt)="[^"]*<abbr/);
			expect(html).not.toContain('mailto:<');
		}
	});

	it('liens internes corrigés (le PHP de PV produit « id=.$matches[1] »)', () => {
		expect(reference['lien interne']).toContain('.$matches[1]');
		expect(render(byName('lien interne'))).toBe(
			'<p><a href="http://forum.test/sujet/4" rel="nofollow">http://forum.test/sujet/4</a> <a href="http://forum.test/message/12#p12" rel="nofollow">message</a></p>',
		);
	});

	it('liens vers le forum : adresses propres (AvroBB), libellé inchangé', () => {
		expect(reference['url relative']).toContain('viewtopic.php?id=4');
		expect(render(byName('url relative'))).toBe('<p><a href="http://forum.test/sujet/4" rel="nofollow">sujet</a></p>');
		expect(parseMessage('[url]http://forum.test/viewtopic.php?pid=7&p=2[/url]', options)).toContain(
			'href="http://forum.test/message/7?p=2#p7"',
		);
		expect(parseMessage('[url]http://ailleurs.test/viewtopic.php?id=4[/url]', options)).toContain(
			'href="http://ailleurs.test/viewtopic.php?id=4"',
		);
		expect(parseMessage('[url=http://forum.test/post.php?tid=4]r[/url]', options)).toContain('href="http://forum.test/post.php?tid=4"');
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

describe('espace après un retour à la ligne (Node)', () => {
	it('entre deux lignes, pas entre deux paragraphes', () => {
		expect(parseMessage('a\nb\n\nc', options)).toBe('<p>a<br /><span class="bbcode-gap"></span>b</p><p>c</p>');
		expect(parseMessage('a\n\n\n\nb', options)).not.toContain('bbcode-gap');
	});
});

describe('adresses en texte brut transformées en liens (Node)', () => {
	const linking = { ...options, makeLinks: true };
	it('http et www deviennent des liens, hors balises et [code]', () => {
		expect(parseMessage('voir https://www.pilote-virtuel.com/forum.', linking)).toBe(
			'<p>voir <a href="https://www.pilote-virtuel.com/forum" rel="nofollow">https://www.pilote-virtuel.com/forum</a>.</p>',
		);
		expect(parseMessage('www.a.fr', linking)).toContain('<a href="http://www.a.fr" rel="nofollow">www.a.fr</a>');
		const untouched = parseMessage('[url=http://b.fr]lien[/url] [img]http://c.fr/i.png[/img] [code]http://d.fr[/code]', linking);
		expect(untouched.match(/<a /g)).toHaveLength(1);
		expect(untouched).toContain('<code>http://d.fr</code>');
		expect(parseMessage('[video]https://www.youtube.com/watch?v=dQw4w9WgXcQ[/video]', linking)).toContain(
			'youtube-nocookie.com/embed/dQw4w9WgXcQ',
		);
	});

	it('pas de lien sans BBCode ni si o_make_links est désactivé', () => {
		expect(parseMessage('https://a.fr', { ...linking, bbcode: false })).toBe('<p>https://a.fr</p>');
		expect(parseMessage('https://a.fr', options)).toBe('<p>https://a.fr</p>');
	});
});
