import type { Db } from '../db/database.ts';
import type { BoardConfig } from '../domain/models.ts';

export interface ConfigReader {
	load(): Promise<BoardConfig>;
}

export class ConfigRepository implements ConfigReader {
	constructor(private readonly db: Db) {}

	async load(): Promise<BoardConfig> {
		const rows = await this.db.selectFrom('config').select(['conf_name', 'conf_value']).execute();
		const values = new Map(rows.map((row) => [row.conf_name, row.conf_value ?? '']));

		const text = (name: string, fallback = ''): string => values.get(name) ?? fallback;
		const flag = (name: string): boolean => values.get(name) === '1';

		return {
			boardTitle: text('o_board_title'),
			defaultPostsPerPage: Number(text('o_disp_posts_default', '25')) || 25,
			dateFormat: text('o_date_format', 'Y-m-d'),
			timeFormat: text('o_time_format', 'H:i:s'),
			showUserInfo: flag('o_show_user_info'),
			showPostCount: flag('o_show_post_count'),
			signatures: flag('o_signatures'),
			avatars: flag('o_avatars'),
			avatarsDir: text('o_avatars_dir', 'img/avatars'),
			bbcode: flag('p_message_bbcode'),
			imgTag: flag('p_message_img_tag'),
		};
	}
}
