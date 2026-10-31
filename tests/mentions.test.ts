/**
 * Mentions de membres : repérage dans le message (services/mentions.ts) et message privé envoyé au
 * membre mentionné après une réponse (post.php).
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId, type PrivateRecipient } from '../src/domain/models.ts';
import { extractMentionIds, MAX_MENTIONS, mentionRecipients } from '../src/services/mentions.ts';
import { pmData } from './fakePrivateMessages.ts';
import { type FakeData, fakeDeps, guest, post, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const BASE = 'http://forum.test';
const mention = (id: number, name: string): string => `[url=${BASE}/profile.php?id=${id}]@${name}[/url]`;

function recipient(overrides: Partial<PrivateRecipient> = {}): PrivateRecipient {
	return {
		id: 5,
		username: 'MaxDUO',
		email: 'max@example.test',
		groupId: GroupId.Member,
		usesPrivateMessages: true,
		groupCanUsePrivateMessages: true,
		privateMessageLimit: 0,
		privateMessageCount: 0,
		notifyPrivateMessages: false,
		notifyPrivateMessagesFull: false,
		...overrides,
	};
}

describe('repérage des mentions', () => {
	it('liens @Nom vers un profil du forum, sans doublon ni auteur, en nombre limité', () => {
		const text = `Salut ${mention(5, 'MaxDUO')} et ${mention(5, 'MaxDUO')}, ${mention(3, 'Tessy')} [url=http://ailleurs.test/profile.php?id=9]@Pirate[/url] @Texte`;
		expect(extractMentionIds(text, BASE, 3)).toEqual([5]);
		const many = Array.from({ length: 9 }, (_, i) => mention(10 + i, `M${i}`)).join(' ');
		expect(extractMentionIds(many, BASE, 3)).toHaveLength(MAX_MENTIONS);
	});

	it('destinataires : messagerie active, boîte non pleine', () => {
		const list = [
			recipient(),
			recipient({ id: 6, usesPrivateMessages: false }),
			recipient({ id: 7, privateMessageLimit: 5, privateMessageCount: 5 }),
		];
		expect(mentionRecipients(list).map((r) => r.id)).toEqual([5]);
	});
});

const tessy = viewer();
const cookie = `${sessionCookie(3)}`;

let app: ForumApp | undefined;

function data(overrides: Partial<FakeData> = {}): FakeData {
	return {
		users: [{ viewer: guest }, { viewer: tessy }],
		topics: [topic({ id: 10, subject: 'Vol de nuit', forum: { id: 2, name: 'Captures', moderators: new Map() } })],
		posts: new Map([[10, [post(100)]]]),
		forumInfos: [
			{
				id: 2,
				name: 'Captures',
				redirectUrl: null,
				links: { site: null, repository: null },
				descriptionHtml: '',
				moderators: new Map(),
				numTopics: 1,
				sortBy: 'lastPost',
				topicPermission: null,
				isSubscribed: false,
			},
		],
		config: { privateMessagesEnabled: true, baseUrl: BASE },
		pm: pmData({
			members: [recipient(), recipient({ id: 6, username: 'Invisible', groupId: 7 }), recipient({ id: 3, username: 'Tessy' })],
		}),
		...overrides,
	};
}

async function reply(server: ForumApp, message: string) {
	const page = await inject(server, { url: '/post.php?tid=10', headers: { cookie } });
	const csrf =
		[page.headers['set-cookie']]
			.flat()
			.find((c) => c?.startsWith('avrobb_csrf='))
			?.split(';')[0] ?? '';
	const token = /name="csrf_token" value="([0-9a-f]+)"/.exec(page.body)?.[1] ?? '';
	return inject(server, {
		method: 'POST',
		url: '/post.php?action=post&tid=10',
		headers: { cookie: `${cookie}; ${csrf}`, 'content-type': 'application/x-www-form-urlencoded' },
		payload: new URLSearchParams({ csrf_token: token, form_sent: '1', req_message: message }).toString(),
	});
}

describe('message privé au membre mentionné', () => {
	it('envoyé au membre qui peut lire la discussion, sans copie pour l’auteur', async () => {
		// Groupe 7 : ne peut pas lire le forum 2.
		const fake = data({ forumReaders: new Map([[2, [GroupId.Member, GroupId.Admin, GroupId.Moderator]]]) });
		app = await buildApp(fakeDeps(fake));
		const res = await reply(app, `Regarde ${mention(5, 'MaxDUO')} et ${mention(6, 'Invisible')} !`);
		expect(res.statusCode).toBe(302);
		const rows = fake.pm?.rows ?? [];
		expect(rows.map((row) => row.ownerId)).toEqual([5]);
		expect(rows[0]?.subject).toBe('Tessy vous a mentionné');
		expect(rows[0]?.message).toMatch(
			/^\[b\]Tessy\[\/b\] vous a mentionné dans la discussion \[url=\/message\/\d+#p\d+\]Vol de nuit\[\/url\]\.$/,
		);
	});

	it('titre du sujet recopié inerte : il ne ferme pas le lien ni n’ajoute de balise', async () => {
		const fake = data({
			topics: [
				topic({ id: 10, subject: 'x[/url][img]https://e.test/a.png[/img]', forum: { id: 2, name: 'Captures', moderators: new Map() } }),
			],
		});
		app = await buildApp(fakeDeps(fake));
		await reply(app, `Regarde ${mention(5, 'MaxDUO')}`);
		const message = fake.pm?.rows[0]?.message ?? '';
		expect(message).toContain('x[\u200b/url][\u200bimg]https://e.test/a.png[\u200b/img][/url]');
	});

	it('rien si la messagerie est désactivée', async () => {
		const fake = data({ config: { privateMessagesEnabled: false, baseUrl: BASE } });
		app = await buildApp(fakeDeps(fake));
		await reply(app, `Coucou ${mention(5, 'MaxDUO')}`);
		expect(fake.pm?.rows).toEqual([]);
	});
});
