/**
 * extern.php : formats de flux (services/feeds.ts) et réponses via inject(app, ).
 */

import { describe, expect, it } from 'vitest';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import type { FeedReader, FeedTopicRow } from '../src/repositories/FeedRepository.ts';
import { type Feed, iso8601, renderHtmlList, renderRss, rfc2822 } from '../src/services/feeds.ts';
import { fakeDeps, group, guest, NOW } from './fixtures.ts';
import { inject } from './inject.ts';

const feed: Feed = {
	title: 'Forum / Sujet ]]> piégé',
	link: 'http://forum.test/viewtopic.php?id=4',
	description: 'Les sujets les plus récents dans Sujet.',
	type: 'posts',
	items: [
		{
			id: 9,
			title: 'Un titre beaucoup trop long pour la liste HTML',
			link: 'http://forum.test/viewtopic.php?pid=9#p9',
			description: '<p>Bonjour</p>',
			author: { name: 'Tessy', email: null, uri: 'http://forum.test/profile.php?id=3' },
			pubDate: 1_000_000_000,
		},
	],
};
const context = { selfUrl: 'http://forum.test/extern.php?type=rss&a=1', version: null, now: NOW };

describe('formats de flux', () => {
	it('dates comme gmdate()', () => {
		expect(rfc2822(1_000_000_000)).toBe('Sun, 09 Sep 2001 01:46:40 +0000');
		expect(iso8601(1_000_000_000)).toBe('2001-09-09T01:46:40Z');
	});

	it('RSS 2.0 : CDATA protégée, adresse factice sans e-mail', () => {
		const rss = renderRss(feed, context);
		expect(rss).toContain('<title><![CDATA[Forum / Sujet ]]&gt; piégé]]></title>');
		expect(rss).toContain('<atom:link href="http://forum.test/extern.php?type=rss&amp;a=1" rel="self" type="application/rss+xml" />');
		expect(rss).toContain('<author><![CDATA[dummy@example.com (Tessy)]]></author>');
		expect(rss).toContain('<lastBuildDate>Sun, 09 Sep 2001 01:46:40 +0000</lastBuildDate>');
	});

	it('liste HTML : sujet tronqué à 30 caractères', () => {
		expect(renderHtmlList(feed)).toBe(
			'<li><a href="http://forum.test/viewtopic.php?pid=9#p9" title="Un titre beaucoup trop long pour la liste HTML">Un titre beaucoup trop lo …</a></li>\n',
		);
	});
});

const row: FeedTopicRow = {
	id: 102,
	poster: 'admin',
	posterId: 2,
	message: '[b]Dernier[/b]',
	hideSmilies: false,
	posted: NOW - 60,
	publicEmail: 'admin@example.test',
	topicId: 10,
	subject: 'Sujet <10>',
	topicPoster: 'Tessy',
	topicPosted: NOW - 600,
	lastPost: NOW - 60,
	lastPoster: 'admin',
};

function feeds(overrides: Partial<FeedReader> = {}): FeedReader {
	return {
		findTopic: async (id) => (id === 10 ? { subject: 'Sujet <10>', firstPostId: 100 } : null),
		listTopicPosts: async () => [row],
		findForumName: async () => 'Captures',
		listRecentTopics: async () => [row],
		...overrides,
	};
}

let app: ForumApp | undefined;

describe('GET /extern.php', () => {
	const deps = (users = [{ viewer: guest }]) => ({
		...fakeDeps({ users, topics: [], posts: new Map() }),
		feeds: feeds(),
	});

	it('flux RSS des discussions actives, sans e-mail pour un invité', async () => {
		app = await buildApp(deps());
		const res = await inject(app, '/extern.php?action=feed&type=rss&fid=2');
		expect(res.headers['content-type']).toBe('application/xml; charset=utf-8');
		expect(res.body).toContain('<title><![CDATA[Forum de test / Captures]]></title>');
		expect(res.body).toContain('<link>http://forum.test/viewtopic.php?id=10&amp;action=new</link>');
		expect(res.body).toContain('<description><![CDATA[<p><strong>Dernier</strong></p>]]></description>');
		expect(res.body).not.toContain('admin@example.test');
	});

	it('flux d’une discussion, liste HTML par défaut, sujet inconnu', async () => {
		app = await buildApp(deps());
		// Ancienne adresse Atom : le flux est servi en RSS.
		const atom = await inject(app, '/extern.php?action=feed&type=atom&tid=10');
		expect(atom.headers['content-type']).toBe('application/xml; charset=utf-8');
		expect(atom.body).toContain('<rss version="2.0"');
		expect(atom.body).not.toContain('<feed xmlns');

		const html = await inject(app, '/extern.php');
		expect(html.body).toBe(
			'<li><a href="http://forum.test/viewtopic.php?id=10&amp;action=new" title="Sujet &lt;10&gt;">Sujet &lt;10&gt;</a></li>\n',
		);
		expect((await inject(app, '/extern.php?action=feed&tid=99')).body).toBe('Erreur. Le lien que vous avez suivi est incorrect ou périmé.');
	});

	it('statistiques et présents en HTML, 401 sans g_read_board', async () => {
		app = await buildApp(deps());
		expect((await inject(app, '/extern.php?action=stats')).body).toContain('Nombre total de messages : 56 789<br />');
		expect((await inject(app, '/extern.php?action=online')).body).toContain('Membres en ligne : 0<br />');

		app = await buildApp(deps([{ viewer: { ...guest, group: group({ id: GroupId.Guest, canReadBoard: false }) } }]));
		const denied = await inject(app, '/extern.php');
		expect(denied.statusCode).toBe(401);
		expect(denied.headers['www-authenticate']).toContain('External Syndication');
	});
});
