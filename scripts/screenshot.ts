/**
 * Captures d'écran d'une page à plusieurs largeurs, pour la vérification visuelle des vues
 * (mobile et bureau), éventuellement avec un cookie de session.
 *
 *   npm run screenshot -- <url> [--widths 320,375,768,1280] [--cookie nom=valeur] [--out dossier] [--open-menu]
 *
 * Pilote un Chrome sans tête (CHROME_BIN, ou chrome-headless-shell de Playwright s'il est présent)
 * par le protocole DevTools, avec le WebSocket natif de Node : aucune dépendance à installer.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		widths: { type: 'string', default: '375,1280' },
		cookie: { type: 'string' },
		out: { type: 'string', default: 'screenshots' },
		'open-menu': { type: 'boolean', default: false },
	},
});

const target = positionals[0];
if (target === undefined) {
	console.error('Usage : npm run screenshot -- <url> [--widths 375,1280] [--cookie nom=valeur] [--out dossier] [--open-menu]');
	process.exit(1);
}

function findChrome(): string {
	if (process.env.CHROME_BIN !== undefined) return process.env.CHROME_BIN;

	const playwright = path.join(homedir(), '.cache', 'ms-playwright');
	if (existsSync(playwright)) {
		for (const dir of readdirSync(playwright)
			.filter((d) => d.startsWith('chromium_headless_shell'))
			.sort()
			.reverse()) {
			const candidate = path.join(playwright, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
			if (existsSync(candidate)) return candidate;
		}
	}

	throw new Error('Chrome introuvable : définir CHROME_BIN');
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Client minimal du protocole DevTools sur une page. */
class DevTools {
	#nextId = 1;
	readonly #pending = new Map<number, (result: unknown) => void>();

	private constructor(private readonly socket: WebSocket) {
		socket.addEventListener('message', (event) => {
			const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
			if (message.id !== undefined) this.#pending.get(message.id)?.(message.result);
		});
	}

	static async connect(url: string): Promise<DevTools> {
		const socket = new WebSocket(url);
		await new Promise((resolve, reject) => {
			socket.addEventListener('open', resolve, { once: true });
			socket.addEventListener('error', reject, { once: true });
		});
		return new DevTools(socket);
	}

	send<T = unknown>(method: string, params: object = {}): Promise<T> {
		const id = this.#nextId++;
		this.socket.send(JSON.stringify({ id, method, params }));
		return new Promise((resolve) => this.#pending.set(id, (result) => resolve(result as T)));
	}

	close(): void {
		this.socket.close();
	}
}

async function openPage(port: number): Promise<DevTools> {
	for (let attempt = 0; attempt < 50; attempt++) {
		try {
			const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
			const page = pages.find((p) => p.type === 'page');
			if (page !== undefined) return DevTools.connect(page.webSocketDebuggerUrl);
		} catch {
			// Chrome démarre encore.
		}
		await delay(100);
	}
	throw new Error('Chrome ne répond pas sur le port de débogage');
}

async function capture(page: DevTools, url: string, width: number, file: string): Promise<void> {
	await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
	await page.send('Page.navigate', { url });
	await delay(1500);

	if (values['open-menu']) {
		await page.send('Runtime.evaluate', { expression: "document.querySelector('details.site-nav')?.setAttribute('open', '')" });
		await delay(200);
	}

	const { result } = await page.send<{ result: { value: number } }>('Runtime.evaluate', {
		expression: 'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)',
		returnByValue: true,
	});
	const overflow = await page.send<{ result: { value: boolean } }>('Runtime.evaluate', {
		expression: 'document.documentElement.scrollWidth > window.innerWidth',
		returnByValue: true,
	});
	if (overflow.result.value) console.warn(`  ⚠ défilement horizontal à ${width} px`);

	await page.send('Emulation.setDeviceMetricsOverride', { width, height: result.value, deviceScaleFactor: 1, mobile: width < 768 });
	const shot = await page.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
	writeFileSync(file, Buffer.from(shot.data, 'base64'));
	console.log(`  ${file}`);
}

const port = 9300 + Math.floor(Math.random() * 500);
const chrome: ChildProcess = spawn(findChrome(), [`--remote-debugging-port=${port}`, '--no-sandbox', '--hide-scrollbars', 'about:blank'], {
	stdio: 'ignore',
});

try {
	const page = await openPage(port);
	await page.send('Page.enable');

	if (values.cookie !== undefined) {
		const [name = '', ...rest] = values.cookie.split('=');
		await page.send('Network.setCookie', { name, value: rest.join('='), url: target });
	}

	mkdirSync(values.out, { recursive: true });
	const slug = new URL(target).pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'page';

	for (const width of values.widths.split(',').map(Number))
		await capture(page, target, width, path.join(values.out, `${slug}-${width}.png`));

	page.close();
} finally {
	chrome.kill();
}
