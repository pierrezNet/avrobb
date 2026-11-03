/**
 * Comptes affichés dans le profil (Discord, Mastodon, Bluesky, Reddit, Discourse, GitHub, LinkedIn) :
 * saisie ramenée à une forme reconnue, et lien vers le profil quand il y en a un. Le lien est
 * construit ici, jamais repris tel quel de la saisie (sauf l'adresse d'un profil Discourse,
 * en http(s) seulement).
 */

export const ACCOUNT_FIELDS = ['discord', 'mastodon', 'bluesky', 'reddit', 'discourse', 'github', 'linkedin'] as const;
export type AccountField = (typeof ACCOUNT_FIELDS)[number];
export type Accounts = Record<AccountField, string>;

export const ACCOUNT_MAX_LENGTHS: Readonly<Record<AccountField, number>> = {
	discord: 32,
	mastodon: 100,
	bluesky: 100,
	reddit: 25,
	discourse: 200,
	github: 40,
	linkedin: 100,
};

const RULES: Readonly<Record<AccountField, { pattern: RegExp; stored: (match: RegExpExecArray) => string }>> = {
	discord: { pattern: /^@?([a-z0-9_.]{2,32})$/i, stored: (m) => (m[1] ?? '').toLowerCase() },
	mastodon: { pattern: /^@?([a-z0-9_]{1,30})@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i, stored: (m) => `@${m[1]}@${(m[2] ?? '').toLowerCase()}` },
	bluesky: { pattern: /^@?([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+)$/i, stored: (m) => (m[1] ?? '').toLowerCase() },
	reddit: { pattern: /^(?:\/?u\/)?([a-z0-9_-]{3,20})$/i, stored: (m) => m[1] ?? '' },
	discourse: { pattern: /^https?:\/\/[a-z0-9.-]+(?::\d+)?\/u\/[^\s"'<>]+$/i, stored: (m) => m[0] },
	github: { pattern: /^@?([a-z\d](?:[a-z\d-]{0,38}))$/i, stored: (m) => m[1] ?? '' },
	linkedin: { pattern: /^(?:https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/)?([\w-]{3,100})\/?$/i, stored: (m) => m[1] ?? '' },
};

/** Saisie → forme enregistrée ; '' si vide, null si le format n'est pas reconnu. */
export function normalizeAccount(field: AccountField, input: string): string | null {
	const value = input.trim();
	if (value === '') return '';
	const match = RULES[field].pattern.exec(value);
	return match !== null ? RULES[field].stored(match) : null;
}

/** Adresse du profil, ou null (Discord n'a pas d'adresse de profil publique par pseudo). */
export function accountLink(field: AccountField, stored: string): string | null {
	if (stored === '') return null;
	switch (field) {
		case 'discord':
			return null;
		case 'mastodon': {
			const [, user = '', host = ''] = stored.split('@');
			return `https://${host}/@${user}`;
		}
		case 'bluesky':
			return `https://bsky.app/profile/${stored}`;
		case 'reddit':
			return `https://www.reddit.com/user/${stored}`;
		case 'discourse':
			return /^https?:\/\//i.test(stored) ? stored : null;
		case 'github':
			return `https://github.com/${stored}`;
		case 'linkedin':
			return `https://www.linkedin.com/in/${stored}`;
	}
}
