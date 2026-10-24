import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely';
import { describe, expect, it } from 'vitest';
import { type Database, TABLE_NAMES } from '../src/db/schema.ts';
import { TablePrefixPlugin } from '../src/db/TablePrefixPlugin.ts';
import { GroupId } from '../src/domain/models.ts';
import { frDateWords } from '../src/lang/fr.ts';
import { parseBbcode } from '../src/services/bbcode.ts';
import { formatTime } from '../src/services/dateFormat.ts';
import { forumHmac, isCookiePasswordValid, isCookieSignatureValid, parseLegacyCookie } from '../src/services/legacySession.ts';
import { clampPage, paginate } from '../src/services/pagination.ts';
import { canReply, postActions } from '../src/services/permissions.ts';
import { parseModerators } from '../src/services/phpSerialize.ts';
import { group, guest, topic, viewer } from './fixtures.ts';

describe('parseBbcode', () => {
	const parse = (text: string) => parseBbcode(text, { bbcode: true, showImages: true });

	it('échappe le HTML avant de reconnaître les balises', () => {
		expect(parse('<b onclick="x">a</b> [b]b[/b]')).toBe('<p>&lt;b onclick=&quot;x&quot;&gt;a&lt;/b&gt; <strong>b</strong></p>');
	});

	it('refuse les schémas dangereux dans [url] et [img]', () => {
		expect(parse('[url=javascript:alert(1)]x[/url]')).not.toContain('href');
		expect(parse('[img]javascript:alert(1)[/img]')).not.toContain('<img');
		expect(parse('[url]http://a.test/?q="x"[/url]')).toContain('href="http://a.test/?q=&quot;x&quot;"');
		expect(parse('[color=red;background:url(x)]t[/color]')).not.toContain('style');
	});

	it('gère les citations imbriquées et le code non interprété', () => {
		const html = parse('[quote=Tessy][quote]a[/quote]b[/quote]\n[code][b]brut[/b] <x>[/code]');
		expect(html).toContain('<cite>Tessy a écrit :</cite>');
		expect(html.match(/class="quotebox"/g)).toHaveLength(2);
		expect(html).toContain('<pre><code>[b]brut[/b] &lt;x&gt;</code></pre>');
	});

	it('découpe les paragraphes sur les lignes vides', () => {
		expect(parse('a\nb\n\nc')).toBe('<p>a<br />b</p><p>c</p>');
	});
});

describe('parseModerators', () => {
	it('lit le tableau sérialisé par PHP, longueurs en octets', () => {
		const mods = parseModerators('a:2:{s:5:"Hélo";i:7;s:5:"admin";i:2;}');
		expect([...mods]).toEqual([
			['Hélo', 7],
			['admin', 2],
		]);
	});

	it('renvoie une liste vide pour une valeur absente ou invalide', () => {
		expect(parseModerators(null).size).toBe(0);
		expect(parseModerators('O:8:"stdClass":0:{}').size).toBe(0);
	});
});

describe('cookie de session FluxBB', () => {
	const seed = 'graine';
	const now = 1_000_000;
	const value = `3|${forumHmac('hash', `${seed}_password_hash`)}|${now + 60}|${forumHmac(`3|${now + 60}`, `${seed}_cookie_hash`)}`;

	it('valide signature, expiration et mot de passe', () => {
		const cookie = parseLegacyCookie(value)!;
		expect(isCookieSignatureValid(cookie, seed, now)).toBe(true);
		expect(isCookieSignatureValid(cookie, seed, now + 61)).toBe(false);
		expect(isCookieSignatureValid({ ...cookie, userId: 2 }, seed, now)).toBe(false);
		expect(isCookiePasswordValid(cookie, 'hash', seed)).toBe(true);
		expect(isCookiePasswordValid(cookie, 'autre', seed)).toBe(false);
	});

	it('rejette un format inattendu', () => {
		expect(parseLegacyCookie('3|abc|x|def')).toBeNull();
		expect(parseLegacyCookie(undefined)).toBeNull();
	});
});

describe('permissions', () => {
	const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });

	it('canReply suit FluxBB : sujet fermé réservé aux modérateurs du forum', () => {
		expect(canReply(viewer(), topic())).toBe(true);
		expect(canReply(guest, topic())).toBe(false);
		expect(canReply(viewer(), topic({ closed: true }))).toBe(false);
		expect(canReply(mod, topic({ closed: true }))).toBe(false);
		expect(canReply(mod, topic({ closed: true, forum: { id: 1, name: 'F', moderators: new Map([['MaxDUO', 5]]) } }))).toBe(true);
		expect(canReply(viewer(), topic({ forumReplyPermission: false }))).toBe(false);
	});

	it('postActions : un membre modifie ses messages, un modérateur pas ceux des admins', () => {
		expect(postActions(viewer(), topic(), 3, 1, false)).toEqual({ report: true, delete: true, edit: true, quote: true });
		expect(postActions(viewer(), topic(), 4, 2, false)).toEqual({ report: true, delete: false, edit: false, quote: true });
		const modTopic = topic({ forum: { id: 1, name: 'F', moderators: new Map([['MaxDUO', 5]]) } });
		expect(postActions(mod, modTopic, 2, 2, true)).toEqual({ report: true, delete: false, edit: false, quote: true });
	});
});

describe('pagination', () => {
	it('reproduit paginate() de FluxBB', () => {
		const shape = (n: number, p: number) =>
			paginate(n, p).map((l) => (l.kind === 'page' ? (l.current ? `[${l.page}]` : String(l.page)) : l.kind));
		expect(shape(1, 1)).toEqual(['[1]']);
		expect(shape(10, 1)).toEqual(['[1]', '2', '3', 'gap', '10', 'next']);
		expect(shape(10, 6)).toEqual(['previous', '1', 'gap', '4', '5', '[6]', '7', '8', 'gap', '10', 'next']);
		expect(shape(10, 10)).toEqual(['previous', '1', 'gap', '8', '9', '[10]']);
	});

	it('ramène une page invalide à 1', () => {
		expect(clampPage('abc', 5)).toBe(1);
		expect(clampPage('9', 5)).toBe(1);
		expect(clampPage('3', 5)).toBe(3);
	});
});

describe('formatTime', () => {
	const settings = { timezone: 1, dst: true, dateFormat: 'd/m/Y', timeFormat: 'H:i' };
	const now = Date.UTC(2026, 9, 24, 12, 0, 0) / 1000;

	it("applique fuseau + heure d'été et les libellés Aujourd'hui / Hier", () => {
		expect(formatTime(now, settings, frDateWords, now)).toBe("Aujourd'hui 14:00");
		expect(formatTime(now - 86400, settings, frDateWords, now)).toBe('Hier 14:00');
		expect(formatTime(now - 3 * 86400, settings, frDateWords, now)).toBe('21/10/2026 14:00');
		expect(formatTime(null, settings, frDateWords, now)).toBe('Jamais');
	});
});

describe('TablePrefixPlugin', () => {
	it('préfixe les tables mais pas les alias', () => {
		const db = new Kysely<Database>({
			dialect: {
				createAdapter: () => new MysqlAdapter(),
				createDriver: () => new DummyDriver(),
				createIntrospector: (k) => new MysqlIntrospector(k),
				createQueryCompiler: () => new MysqlQueryCompiler(),
			},
			plugins: [new TablePrefixPlugin('fo_', TABLE_NAMES)],
		});

		const query = db
			.selectFrom('topics as t')
			.innerJoin('forums', 'forums.id', 't.forum_id')
			.select(['t.id', 'forums.forum_name'])
			.compile();
		expect(query.sql).toBe(
			'select `t`.`id`, `fo_forums`.`forum_name` from `fo_topics` as `t` inner join `fo_forums` on `fo_forums`.`id` = `t`.`forum_id`',
		);
	});
});
