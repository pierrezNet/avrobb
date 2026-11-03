/**
 * Service worker d'AvroBB : installation de l'application (PWA), notifications push, page hors ligne.
 * Aucune page du forum n'est gardée en cache : jamais de contenu périmé, seule la page hors ligne
 * l'est, servie quand le réseau manque.
 */

const OFFLINE_CACHE = 'avrobb-offline-v1';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) => Promise.all(names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.mode !== 'navigate') return;
	event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : '' };
	}
	event.waitUntil(
		self.registration.showNotification(data.title || 'AvroBB', {
			body: data.body || '',
			icon: '/assets/icons/icon-192.png',
			badge: '/assets/icons/favicon-32.png',
			tag: data.tag,
			lang: data.lang,
			data: { url: data.url || '/' },
		}),
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
			const open = windows.find((client) => client.url === url);
			return open ? open.focus() : self.clients.openWindow(url);
		}),
	);
});
