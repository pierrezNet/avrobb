/**
 * Règles d'admin_options.php (services/adminOptions.ts) : bornes, valeurs de repli, messages par
 * défaut, URL de base, mot de passe SMTP, clés modifiées seulement.
 */

import { describe, expect, it } from 'vitest';
import { changedOptions, readMaintenanceForm, readOptionsForm } from '../src/services/adminOptions.ts';
import { optionsForm } from './optionsForm.ts';

const DEFAULTS = { announcement: 'Annonce ici', rules: 'Règles ici', maintenance: 'Fermé' };

const read = (form: Record<string, string>) => (key: string) => form[key] ?? '';
const values = (overrides: Record<string, string> = {}) => {
	const result = readOptionsForm(read(optionsForm(overrides)), DEFAULTS);
	if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
	return result.values;
};

describe('readOptionsForm', () => {
	it('borne et corrige les nombres comme intval() et le PHP', () => {
		const v = values({ disp_topics_default: '200', disp_posts_default: '1', quote_depth: '0', redirect_delay: '-3', avatars_size: 'abc' });
		expect(v.get('o_disp_topics_default')).toBe('75');
		expect(v.get('o_disp_posts_default')).toBe('3');
		expect(v.get('o_quote_depth')).toBe('1');
		expect(v.get('o_redirect_delay')).toBe('0');
		expect(v.get('o_avatars_size')).toBe('1');
	});

	it('oui/non, formats vides, barres obliques finales, liste de diffusion', () => {
		const v = values({
			smilies: '1',
			base_url: 'http://pv.test/forum/',
			avatars_dir: 'img/avatars/',
			mailing_list: 'A@Ex.test, b@ex.test',
		});
		expect(v.get('o_smilies')).toBe('1');
		// Options retirées : jamais écrites (le PHP garde ses valeurs).
		for (const removed of ['o_gzip', 'o_time_format', 'o_date_format', 'o_default_lang', 'o_show_version'])
			expect(v.has(removed)).toBe(false);
		expect(v.get('o_base_url')).toBe('http://pv.test/forum');
		expect(v.get('o_avatars_dir')).toBe('img/avatars');
		expect(v.get('o_mailing_list')).toBe('a@ex.test,b@ex.test');
	});

	it('message vide : texte par défaut et option désactivée', () => {
		const v = values({ announcement: '1', announcement_message: '', maintenance: '1', rules: '1', rules_message: 'a\r\nb' });
		expect(v.get('o_announcement')).toBe('0');
		expect(v.get('o_announcement_message')).toBe('Annonce ici');
		// Le mode maintenance se règle dans admin_maintenance.php.
		expect(v.has('o_maintenance')).toBe(false);
		expect(v.get('o_rules_message')).toBe('a\nb');
	});

	it('mode maintenance : interrupteur et message, texte par défaut si vide', () => {
		expect(readMaintenanceForm(read({ maintenance: '1', maintenance_message: ' <b>Pause</b>\r\nà 20 h ' }), 'Fermé')).toEqual(
			new Map([
				['o_maintenance', '1'],
				['o_maintenance_message', '<b>Pause</b>\nà 20 h'],
			]),
		);
		expect(readMaintenanceForm(read({ maintenance: 'x' }), 'Fermé')).toEqual(
			new Map([
				['o_maintenance', '0'],
				['o_maintenance_message', 'Fermé'],
			]),
		);
	});

	it('domaine accentué en punycode', () => {
		expect(values({ base_url: 'http://pilote-virtuél.fr/forum' }).get('o_base_url')).toBe('http://xn--pilote-virtul-mhb.fr/forum');
	});

	it('mot de passe SMTP seulement si « modifier » est coché, et confirmé', () => {
		expect(values({ smtp_pass1: 'x' }).has('o_smtp_pass')).toBe(false);
		expect(values({ smtp_change_pass: '1', smtp_pass1: 'secret', smtp_pass2: 'secret' }).get('o_smtp_pass')).toBe('secret');
		expect(readOptionsForm(read(optionsForm({ smtp_change_pass: '1', smtp_pass1: 'a', smtp_pass2: 'b' })), DEFAULTS)).toEqual({
			kind: 'invalid',
			errors: ['smtpMismatch'],
		});
	});

	it('erreurs de saisie et requêtes invalides', () => {
		const invalid = readOptionsForm(read(optionsForm({ board_title: ' ', admin_email: 'x', timeout_online: '1800' })), DEFAULTS);
		expect(invalid).toEqual({ kind: 'invalid', errors: ['missingTitle', 'timeout', 'invalidAdminEmail'] });
		// Adresses vides acceptées : rien n'est encore envoyé (lot 6).
		const empty = readOptionsForm(read(optionsForm({ admin_email: '', webmaster_email: ' ' })), DEFAULTS);
		expect(empty.kind).toBe('ok');
		for (const bad of [{ feed_type: '2' }, { default_style: '../x' }, { default_timezone: '1.3' }]) {
			expect(readOptionsForm(read(optionsForm(bad)), DEFAULTS)).toEqual({ kind: 'badRequest' });
		}
	});
});

describe('changedOptions', () => {
	it('ne garde que les clés connues qui changent, chaîne vide en NULL', () => {
		const current = new Map([
			['o_board_title', 'PV'],
			['o_board_desc', 'Desc'],
			['o_quickpost', '1'],
		]);
		const next = new Map([
			['o_board_title', 'PV'],
			['o_board_desc', ''],
			['o_quickpost', '0'],
			['o_inconnue', 'x'],
		]);
		expect(changedOptions(current, next)).toEqual(
			new Map<string, string | null>([
				['o_board_desc', null],
				['o_quickpost', '0'],
			]),
		);
	});
});
