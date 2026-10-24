import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely';
import { describe, expect, it } from 'vitest';
import { type Database, TABLE_NAMES } from '../src/db/schema.ts';
import { TablePrefixPlugin } from '../src/db/TablePrefixPlugin.ts';
import { GroupId } from '../src/domain/models.ts';
import { frDateWords } from '../src/lang/fr/index.ts';
import { formatTime, viewerTimeSettings } from '../src/services/dateFormat.ts';
import { forumHmac, isCookiePasswordValid, isCookieSignatureValid, parseLegacyCookie } from '../src/services/legacySession.ts';
import { clampPage, paginate } from '../src/services/pagination.ts';
import { canReply, postActions } from '../src/services/permissions.ts';
import { parseModerators } from '../src/services/phpSerialize.ts';
import { group, guest, NOW, topic, viewer } from './fixtures.ts';

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

	it('postActions : un membre modifie ses messages (30 minutes), un modérateur pas ceux des admins', () => {
		const own = { posterId: 3, posterIsAdmin: false, posted: NOW - 600, isTopicPost: true };
		expect(postActions(viewer(), topic(), own, NOW)).toEqual({ report: true, delete: true, edit: true, quote: true });
		expect(postActions(viewer(), topic(), { ...own, posted: NOW - 1801 }, NOW)).toMatchObject({ edit: false, delete: true });
		expect(postActions(viewer({ group: group({ canDeleteTopics: false }) }), topic(), own, NOW)).toMatchObject({ delete: false });
		expect(postActions(viewer(), topic({ closed: true }), own, NOW)).toEqual({ report: true, delete: false, edit: false, quote: false });
		expect(postActions(viewer(), topic(), { ...own, posterId: 4 }, NOW)).toEqual({ report: true, delete: false, edit: false, quote: true });
		const modTopic = topic({ forum: { id: 1, name: 'F', moderators: new Map([['MaxDUO', 5]]) } });
		expect(postActions(mod, modTopic, { ...own, posterId: 2, posterIsAdmin: true, posted: 0 }, NOW)).toEqual({
			report: true,
			delete: false,
			edit: false,
			quote: true,
		});
		expect(postActions(mod, modTopic, { ...own, posterId: 4, posted: 0 }, NOW)).toMatchObject({ delete: true, edit: true });
	});
});

describe('pagination', () => {
	it('reproduit paginate() de PV (pages voisines ±1, page 1 toujours affichée)', () => {
		const shape = (n: number, p: number) =>
			paginate(n, p).map((l) => (l.kind === 'page' ? (l.current ? `[${l.page}]` : String(l.page)) : l.kind));
		expect(shape(1, 1)).toEqual(['[1]']);
		expect(shape(10, 1)).toEqual(['[1]', '2', 'gap', '10', 'next']);
		expect(shape(10, 6)).toEqual(['previous', '1', 'gap', '5', '[6]', '7', 'gap', '10', 'next']);
		expect(shape(10, 10)).toEqual(['previous', '1', 'gap', '9', '[10]']);
		expect(shape(2, 1)).toEqual(['[1]', '2', 'next']);
		expect(shape(3, 3)).toEqual(['previous', '1', '2', '[3]']);
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

describe('viewerTimeSettings', () => {
	it('impose les formats de format_time() de PV (d/m/Y H:i), pas ceux de la config', () => {
		const now = Date.UTC(2026, 9, 24, 12, 0, 0) / 1000;
		const settings = viewerTimeSettings({ timezone: 0, dst: false });
		expect(formatTime(now - 3 * 86400, settings, frDateWords, now)).toBe('21/10/2026 12:00');
		expect(formatTime(now - 3 * 86400, settings, frDateWords, now, true)).toBe('21/10/2026');
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
