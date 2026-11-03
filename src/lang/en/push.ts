/**
 * English translation of src/lang/fr/push.ts.
 */

import type { push as frPush } from '../fr/push.ts';

export const push: typeof frPush = {
	privateMessage: (sender: string) => `Private message from ${sender}`,
	reply: (subject: string) => `New reply: ${subject}`,
	replyBody: (replier: string) => `${replier} replied in a topic you follow.`,
	legend: 'Notifications on your devices',
	info: 'Install AvroBB on your phone or computer, then turn notifications on: you will be notified even when the forum is closed. Emails do not change.',
	pushPm: 'Private messages and mentions',
	pushReplies: 'Replies to topics I follow',
	enable: 'Turn on for this device',
	disable: 'Turn off for this device',
	enabled: 'Notifications are on for this device.',
	denied: 'Notifications are blocked for AvroBB in this browser: allow them in its settings.',
	unsupported: 'This browser does not support notifications. On iPhone and iPad, add AvroBB to the Home Screen first.',
	failed: 'Turning notifications on failed. Try again later.',
	needsScript: 'Turning notifications on requires JavaScript.',
};
