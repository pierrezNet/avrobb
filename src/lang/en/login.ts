/**
 * English translation of src/lang/fr/login.ts: sign-in texts (SSO providers GitHub and Google,
 * development login, sign-out).
 */

import type { login as frLogin } from '../fr/login.ts';

export const login: typeof frLogin = {
	login: 'Sign in',
	logout: 'Sign out',
	intro:
		'AvroBB has no passwords: you sign in with an existing account. The first time you sign in, your AvroBB account is created with a username taken from that account, which you can change once in your profile.',
	providers: { github: 'GitHub', google: 'Google' } as Record<'github' | 'google', string>,
	signInWith: (provider: string) => `Sign in with ${provider}`,
	noProvider: 'No sign-in provider is configured yet.',
	// The forum works without JavaScript, but the GitHub and Google sign-in pages require it.
	noScript:
		'JavaScript seems to be disabled. You can read AvroBB without it, but signing in goes through your account’s website, which needs it: turn it on while you sign in.',
	privacyInfo: 'What we receive from this account is described in the',
	privacyLink: 'privacy policy',
	ssoCancelled: 'Sign-in cancelled.',
	ssoExpired: 'The sign-in attempt has expired or did not come from this browser. Start again from the sign-in page.',
	ssoFailed: (provider: string) => `Signing in with ${provider} failed. Please try again in a moment.`,
	tooManyAttempts: 'Too many sign-in attempts. Please try again in a minute.',
	/** Username of a new account when no name from the provider fits. */
	defaultUsername: 'Member',
	username: 'Username',
	required: '(required)',
	unknownUser: 'No member has this username.',
	devLoginLegend: 'Development login',
	devLoginInfo: 'For development only, from this machine: sign in as an existing member, without a password.',
	submit: 'Sign in',
	devLoginRefused: 'The development login is not available.',
	logoutEverywhere: 'Sign me out everywhere',
	logoutEverywhereInfo: 'Ends your session on all devices and browsers, including this one.',
};
