/**
 * English translation of src/lang/fr/account.ts (username errors and time zones shared by
 * account pages).
 */

import type { UsernameError } from '../../services/accounts.ts';
import type { account as frAccount } from '../fr/account.ts';

export const account: typeof frAccount = {
	usernameDupe: (existing: string) =>
		`Someone is already registered with that username. ${existing}. This username is too similar. It must differ by at least one alphanumeric character (a-z or 0-9). Please try another username.`,
	errors: {
		tooShort: 'Usernames must be at least 2 characters long. Please choose another username.',
		tooLong: 'Usernames must not be longer than 25 characters. Please choose another username.',
		guest: 'The username “guest” is reserved. Please choose another username.',
		ip: "Usernames can't look like an IP address. Please choose another username.",
		reservedChars: "Usernames can't contain the characters ', \" and [ or ]. Please choose another username.",
		bbcode: "Usernames can't contain tags (BBCode). Please choose another username.",
		censored: 'The username you entered contains banned words. Please choose another username.',
		banned: 'The username you entered is banned. Please choose another username.',
	} satisfies Record<UsernameError, string>,
	timezones: {
		'-12': '(UTC-12:00) International Date Line West',
		'-11': '(UTC-11:00) Niue, Samoa',
		'-10': '(UTC-10:00) Hawaii-Aleutian, Cook Islands',
		'-9.5': '(UTC-09:30) Marquesas Islands',
		'-9': '(UTC-09:00) Alaska, Gambier Islands',
		'-8.5': '(UTC-08:30) Pitcairn Islands',
		'-8': '(UTC-08:00) Pacific',
		'-7': '(UTC-07:00) Mountain',
		'-6': '(UTC-06:00) Central',
		'-5': '(UTC-05:00) Eastern',
		'-4': '(UTC-04:00) Atlantic',
		'-3.5': '(UTC-03:30) Newfoundland',
		'-3': '(UTC-03:00) Amazon, Central Greenland',
		'-2': '(UTC-02:00) Mid-Atlantic',
		'-1': '(UTC-01:00) Azores, Cape Verde, Eastern Greenland',
		'0': '(UTC) Western European, Greenwich',
		'1': '(UTC+01:00) Central European, West African',
		'2': '(UTC+02:00) Eastern European, Central African',
		'3': '(UTC+03:00) Moscow, Eastern African',
		'3.5': '(UTC+03:30) Iran',
		'4': '(UTC+04:00) Gulf, Samara',
		'4.5': '(UTC+04:30) Afghanistan',
		'5': '(UTC+05:00) Pakistan, Yekaterinburg',
		'5.5': '(UTC+05:30) India, Sri Lanka',
		'5.75': '(UTC+05:45) Nepal',
		'6': '(UTC+06:00) Bangladesh, Bhutan, Novosibirsk',
		'6.5': '(UTC+06:30) Cocos Islands, Myanmar',
		'7': '(UTC+07:00) Indochina, Krasnoyarsk',
		'8': '(UTC+08:00) Greater China, Western Australia, Irkutsk',
		'8.75': '(UTC+08:45) Southeastern Western Australia',
		'9': '(UTC+09:00) Japan, Korea, Chita',
		'9.5': '(UTC+09:30) Australian Central',
		'10': '(UTC+10:00) Australian Eastern, Vladivostok',
		'10.5': '(UTC+10:30) Lord Howe Island',
		'11': '(UTC+11:00) Solomon Islands, Magadan',
		'11.5': '(UTC+11:30) Norfolk Island',
		'12': '(UTC+12:00) New Zealand, Fiji, Kamchatka',
		'12.75': '(UTC+12:45) Chatham Islands',
		'13': '(UTC+13:00) Tonga, Phoenix Islands',
		'14': '(UTC+14:00) Line Islands',
	} as Record<string, string>,
};
