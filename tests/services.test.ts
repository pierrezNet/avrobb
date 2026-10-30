import { describe, expect, it } from 'vitest';
import { GroupId } from '../src/domain/models.ts';
import { frDateWords } from '../src/lang/fr/index.ts';
import { formatTime, viewerTimeSettings } from '../src/services/dateFormat.ts';
import { parseModerators, serializeModerators } from '../src/services/moderators.ts';
import { clampPage, paginate } from '../src/services/pagination.ts';
import { canReply, postActions } from '../src/services/permissions.ts';
import { buildSessionCookie, isDevLoginAllowed, readSessionCookie, SESSION_SECONDS, shouldRenewSession } from '../src/services/session.ts';
import { group, guest, NOW, topic, viewer } from './fixtures.ts';

describe('parseModerators', () => {
	it('lit l’objet JSON { pseudo : id } et ignore le reste', () => {
		const mods = parseModerators('{"Hélo":7,"admin":2}');
		expect([...mods]).toEqual([
			['Hélo', 7],
			['admin', 2],
		]);
		expect(parseModerators(null).size).toBe(0);
		expect(parseModerators('a:1:{s:5:"admin";i:2;}').size).toBe(0);
		expect(parseModerators('{"x":"2","y":-1}').size).toBe(0);
		expect(serializeModerators(new Map([['admin', 2]]))).toBe('{"admin":2}');
		expect(serializeModerators(new Map())).toBeNull();
	});
});

describe('cookie de session', () => {
	const secret = 'secret-de-test';
	const now = 1_000_000;
	const value = buildSessionCookie({ userId: 3, version: 2, expires: now + 60 }, secret);

	it('valide signature et expiration', () => {
		expect(readSessionCookie(value, secret, now)).toEqual({ userId: 3, version: 2, expires: now + 60 });
		expect(readSessionCookie(value, secret, now + 60)).toBeNull();
		expect(readSessionCookie(value, 'autre-secret', now)).toBeNull();
		// Membre ou échéance modifiés : la signature ne correspond plus.
		expect(readSessionCookie(value.replace(/^3\./, '2.'), secret, now)).toBeNull();
		expect(readSessionCookie(value.replace(`.${now + 60}.`, `.${now + 9999}.`), secret, now)).toBeNull();
		// Numéro de session modifié (pour survivre à « me déconnecter de partout ») : refusé aussi.
		expect(readSessionCookie(value.replace('3.2.', '3.3.'), secret, now)).toBeNull();
	});

	it('rejette un format inattendu', () => {
		expect(readSessionCookie('3|abc|x|def', secret, now)).toBeNull();
		expect(readSessionCookie(undefined, secret, now)).toBeNull();
		expect(readSessionCookie(buildSessionCookie({ userId: 0, version: 0, expires: now + 60 }, secret), secret, now)).toBeNull();
		// Ancien format, sans numéro de session.
		expect(readSessionCookie(`3.${now + 60}.${'0'.repeat(64)}`, secret, now)).toBeNull();
	});

	it("ne renouvelle le cookie qu'une fois par jour", () => {
		expect(shouldRenewSession(now + SESSION_SECONDS, now)).toBe(false);
		expect(shouldRenewSession(now + SESSION_SECONDS - 3600, now)).toBe(false);
		expect(shouldRenewSession(now + SESSION_SECONDS - 86_401, now)).toBe(true);
	});

	it('réserve la connexion de développement à la machine elle-même', () => {
		expect(isDevLoginAllowed(true, '127.0.0.1')).toBe(true);
		expect(isDevLoginAllowed(true, '::1')).toBe(true);
		expect(isDevLoginAllowed(true, '203.0.113.7')).toBe(false);
		expect(isDevLoginAllowed(false, '127.0.0.1')).toBe(false);
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
