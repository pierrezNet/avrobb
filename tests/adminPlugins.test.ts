/**
 * Règles des formulaires des plugins d'administration (services/adminPlugins.ts).
 */

import { describe, expect, it } from 'vitest';
import { readGroupPrivateMessageRights, readPrivateMessageSettings, readUploadileSettings } from '../src/services/adminPlugins.ts';

const reader = (values: Record<string, string>) => (name: string) => values[name] ?? '';

describe('plugins', () => {
	it('messagerie : destinataires plus un, droits des groupes présents seulement', () => {
		expect(readPrivateMessageSettings(reader({ 'form[pms_enabled]': '1', 'form[pms_max_receiver]': '-3' }))).toEqual(
			new Map([
				['o_pms_enabled', '1'],
				['o_pms_notification', '0'],
				['o_pms_max_receiver', '1'],
			]),
		);
		expect(readGroupPrivateMessageRights(reader({ 'allow[4]': '1', 'limit[4]': '20' }), 4)).toEqual({ allowed: true, limit: 20 });
		expect(readGroupPrivateMessageRights(reader({}), 4)).toBeNull();
	});

	it('Uploadile : valeurs non positives remplacées par les défauts, extensions sans espaces', () => {
		const settings = readUploadileSettings(reader({ laws: 'png, jpg', thumb: '0', limit_member: '500' }));
		expect(settings.get('o_uploadile_laws')).toBe('png,jpg');
		// La miniaturisation n'est plus réglable.
		expect(settings.has('o_uploadile_thumb')).toBe(false);
		expect(settings.get('o_uploadile_limit_member')).toBe('500');
		expect(settings.get('o_uploadile_limit_modo')).toBe('5242880');
	});
});
