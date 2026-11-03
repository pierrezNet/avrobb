/**
 * Application installable : enregistre le service worker (/sw.js) et, sur la page du profil,
 * active ou désactive les notifications push de cet appareil.
 */
(() => {
	if (!('serviceWorker' in navigator)) return;
	const registration = navigator.serviceWorker.register('/sw.js');

	const box = document.querySelector('[data-push]');
	if (box === null) return;
	const status = box.querySelector('.push-device__status');
	const toggle = box.querySelector('.push-device__toggle');
	const say = (text) => {
		status.textContent = text;
	};

	if (!('PushManager' in window) || !('Notification' in window)) {
		say(box.dataset.unsupported);
		return;
	}

	const keyBytes = (key) => {
		const base64 = key
			.replace(/-/g, '+')
			.replace(/_/g, '/')
			.padEnd(key.length + ((4 - (key.length % 4)) % 4), '=');
		return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
	};

	const send = (action, subscription) => {
		const json = subscription.toJSON();
		const body = new URLSearchParams({
			csrf_token: box.dataset.csrf,
			endpoint: json.endpoint ?? '',
			p256dh: json.keys?.p256dh ?? '',
			auth: json.keys?.auth ?? '',
		});
		return fetch(`${box.dataset.action}?action=${action}`, { method: 'POST', body, credentials: 'same-origin' }).then((response) => {
			if (!response.ok) throw new Error(String(response.status));
		});
	};

	const show = (subscription) => {
		toggle.hidden = false;
		toggle.textContent = subscription ? box.dataset.disable : box.dataset.enable;
		say(subscription ? box.dataset.enabled : Notification.permission === 'denied' ? box.dataset.denied : '');
	};

	registration
		.then((worker) => worker.pushManager.getSubscription())
		.then(show)
		.catch(() => say(box.dataset.unsupported));

	toggle.addEventListener('click', async () => {
		toggle.disabled = true;
		try {
			const worker = await navigator.serviceWorker.ready;
			const current = await worker.pushManager.getSubscription();
			if (current) {
				await send('unsubscribe', current);
				await current.unsubscribe();
				show(null);
			} else if ((await Notification.requestPermission()) !== 'granted') {
				show(null);
			} else {
				const subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(box.dataset.key) });
				await send('subscribe', subscription);
				show(subscription);
			}
		} catch {
			say(box.dataset.failed);
		} finally {
			toggle.disabled = false;
		}
	});
})();
