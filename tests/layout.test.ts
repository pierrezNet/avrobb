/**
 * Mise en page commune : presenter (menu selon les droits, statut, MP, pied) et rendu via inject(app, ).
 */

import { describe, expect, it } from 'vitest';
import { createAssetUrl } from '../src/adapters/assetUrls.ts';
import { buildApp, type ForumApp } from '../src/app.ts';
import { GroupId } from '../src/domain/models.ts';
import { fr, frDateWords } from '../src/lang/fr/index.ts';
import { buildLayout, type LayoutInput, pageTitle } from '../src/presenters/layout.ts';
import { boardConfig, fakeDeps, group, guest, NOW, sessionCookie, topic, viewer } from './fixtures.ts';
import { inject } from './inject.ts';

const mod = viewer({ id: 5, username: 'MaxDUO', group: group({ id: GroupId.Moderator, isModerator: true }) });

function input(overrides: Partial<LayoutInput> = {}): LayoutInput {
	return {
		viewer: viewer(),
		config: boardConfig,
		lang: fr,
		dateWords: frDateWords,
		now: NOW,
		csrfToken: 'jeton',
		options: { pageId: 'test', titleParts: ['Forum', 'Page'] },
		pendingReports: false,
		unreadPrivateMessages: 0,
		...overrides,
	};
}

const navIds = (layout: ReturnType<typeof buildLayout>): string[] => layout.nav.map((item) => item.id);

describe('pageTitle', () => {
	it('inverse les parties comme generate_page_title()', () => {
		expect(pageTitle(['Forum', 'Section', 'Sujet'], 2, fr)).toBe('Sujet (Page 2) / Section / Forum');
		expect(pageTitle(['Forum'], null, fr)).toBe('Forum');
	});
});

describe('buildLayout', () => {
	it('menu invité : inscription et identification, pas de profil', () => {
		const layout = buildLayout(input({ viewer: guest }));
		expect(navIds(layout)).toEqual(['navindex', 'navuserlist', 'navsearch', 'navgallery', 'navlogin']);
		expect(layout.status).toBeNull();
		expect(layout.quickSearches.map((s) => s.label)).toEqual(['Récentes', 'Sans réponse']);
	});

	it('menu membre : profil et déconnexion avec le jeton de login.php', () => {
		const layout = buildLayout(input({ options: { pageId: 'x', titleParts: [], activeNav: 'index' } }));
		expect(navIds(layout)).toEqual(['navindex', 'navuserlist', 'navsearch', 'navprofile', 'navgallery', 'navdrafts', 'navlogout']);
		expect(layout.nav[0]?.active).toBe(true);
		// Déconnexion en POST (formulaire avec jeton CSRF), pas un lien.
		expect(layout.nav.at(-1)).toMatchObject({ href: 'login.php?action=out', post: true });
		expect(layout.quickSearches).toHaveLength(4);
		expect(layout.status?.showAdminLink).toBe(false);
	});

	it('masque liste des membres et recherche selon le groupe, affiche les règles si activées', () => {
		const restricted = viewer({ group: group({ canViewUsers: false, canSearch: false }) });
		const layout = buildLayout(input({ viewer: restricted, config: { ...boardConfig, rules: true } }));
		expect(navIds(layout)).toEqual(['navindex', 'navrules', 'navprofile', 'navgallery', 'navdrafts', 'navlogout']);
		expect(layout.quickSearches).toEqual([]);
	});

	it('insère les liens additionnels à la position demandée', () => {
		const config = { ...boardConfig, additionalNavlinks: '1 = <a href="/wiki">Wiki</a>\n10 = <a href="/x">X</a>' };
		const layout = buildLayout(input({ viewer: guest, config }));
		expect(navIds(layout)).toEqual(['navindex', 'navextra1', 'navuserlist', 'navsearch', 'navgallery', 'navlogin', 'navextra2']);
		expect(layout.nav[1]?.trustedHtml).toBe('<a href="/wiki">Wiki</a>');
	});

	it('liens de modération : signalements et maintenance pour les modérateurs seulement', () => {
		const config = { ...boardConfig, maintenance: true };
		expect(buildLayout(input({ viewer: mod, config, pendingReports: true })).status).toMatchObject({
			showAdminLink: true,
			pendingReports: true,
			maintenance: true,
		});
		expect(buildLayout(input({ config, pendingReports: true })).status).toMatchObject({ pendingReports: false, maintenance: false });
		const emailOnly = { ...boardConfig, reportsByBoard: false };
		expect(buildLayout(input({ viewer: mod, config: emailOnly, pendingReports: true })).status?.pendingReports).toBe(false);
	});

	it('messagerie privée : lien, nouveaux messages et remplissage des boîtes', () => {
		const config = { ...boardConfig, privateMessagesEnabled: true };
		const limited = viewer({ group: group({ privateMessageLimit: 50 }), privateMessageCount: 10 });
		const layout = buildLayout(input({ viewer: limited, config, unreadPrivateMessages: 2 }));

		expect(layout.nav.find((item) => item.id === 'navpm')).toMatchObject({ label: 'MP', count: 2, abbrTitle: 'Messages privés' });
		expect(layout.status?.privateMessageBox).toEqual({ kind: 'filled', percent: 20, text: 'Boîtes de messages privés pleines à 20 %' });

		const full = viewer({ group: group({ privateMessageLimit: 10 }), privateMessageCount: 10 });
		expect(buildLayout(input({ viewer: full, config })).status?.privateMessageBox?.kind).toBe('full');
		expect(buildLayout(input({ viewer: limited })).nav.some((item) => item.id === 'navpm')).toBe(false);
		expect(buildLayout(input({ viewer: viewer({ usesPrivateMessages: false }), config })).nav.some((item) => item.id === 'navpm')).toBe(
			false,
		);
	});

	it('pied de viewtopic : flux, pages d’information, modération du forum', () => {
		const modTopic = topic({ id: 10, closed: true, forum: { id: 2, name: 'F', moderators: new Map([['MaxDUO', 5]]) } });
		const options = { pageId: 'viewtopic', titleParts: [], footer: { kind: 'viewtopic' as const, topic: modTopic, page: 1 } };

		const layout = buildLayout(input({ viewer: mod, options }));
		expect(layout.feed).toMatchObject({ href: 'extern.php?action=feed&tid=10&type=rss', mimeType: 'application/rss+xml' });
		expect(layout.footerLinks.map((l) => l.href)).toEqual(['terms.php', 'privacy.php', 'faq.php', 'stats.php']);
		expect(layout.modControls.map((c) => c.href)).toContain('moderate.php?fid=2&open=10');

		expect(buildLayout(input({ options })).modControls).toEqual([]);
		const otherMod = viewer({ id: 6, username: 'Autre', group: group({ id: GroupId.Moderator, isModerator: true }) });
		expect(buildLayout(input({ viewer: otherMod, options })).modControls).toEqual([]);
	});

	it("thème : celui du membre s'il est connu, sinon celui du forum ; toujours celui du forum pour un invité", () => {
		expect(buildLayout(input({ viewer: viewer({ style: 'GreenDark' }) })).theme).toBe('GreenDark');
		expect(buildLayout(input({ viewer: viewer({ style: '../../etc' }) })).theme).toBe('Air');
		const config = { ...boardConfig, defaultStyle: 'Lagon' };
		expect(buildLayout(input({ viewer: { ...guest, style: 'GreenDark' }, config })).theme).toBe('Lagon');
	});
});

describe('rendu de la mise en page', () => {
	let app: ForumApp;

	const users = [{ viewer: guest }, { viewer: mod }];

	it("affiche l'annonce, les pages d'information, les signalements et le thème", async () => {
		const config = { announcement: '<b>Maintenance dimanche</b>' };
		app = await buildApp(fakeDeps({ users, topics: [], posts: new Map(), config, pendingReports: true }));

		const res = await inject(app, { url: '/nimporte.php', headers: { cookie: sessionCookie(5) } });
		expect(res.statusCode).toBe(404);
		expect(res.body).toContain('<b>Maintenance dimanche</b>');
		expect(res.body).not.toContain('id="qjump"');
		expect(res.body).toContain('<a href="/confidentialite">Politique de confidentialité</a>');
		expect(res.body).toContain('href="/admin_reports.php"');
		expect(res.body).toMatch(/href="\/assets\/css\/themes\/Air\.css\?v=[0-9a-f]{10}"/);
	});

	it('MP non lus : pastille animée dans le menu (nombre et texte pour lecteurs d’écran)', async () => {
		app = await buildApp(
			fakeDeps({ users, topics: [], posts: new Map(), config: { privateMessagesEnabled: true }, unreadPrivateMessages: new Map([[5, 3]]) }),
		);
		const res = await inject(app, { url: '/index.php', headers: { cookie: sessionCookie(5) } });
		expect(res.body).toContain('<li id="navpm" class="site-nav__item has-news">');
		// Modérateur : lien Administration dans le menu burger (masqué sur grand écran).
		expect(res.body).toContain(
			'<li id="navadminmenu" class="site-nav__item site-nav__item--mobile"><a href="/admin_index.php">Administration</a>',
		);
		expect(res.body).toContain('<span class="site-nav__count">3<span class="visually-hidden"> non lus</span></span>');
		app = await buildApp(fakeDeps({ users, topics: [], posts: new Map(), config: { privateMessagesEnabled: true } }));
		const none = await inject(app, { url: '/index.php', headers: { cookie: sessionCookie(5) } });
		expect(none.body).toContain('<li id="navpm" class="site-nav__item">');
		expect(none.body).not.toContain('site-nav__count');
	});

	it('ressources de public/assets/ : adresse versionnée par le manifeste du build, faute de frappe signalée', () => {
		const asset = createAssetUrl({ 'css/base.css': 'abc1234567' });
		expect(asset('css/base.css')).toBe('/assets/css/base.css?v=abc1234567');
		expect(() => asset('css/absente.css')).toThrow('css/absente.css');
	});
});
