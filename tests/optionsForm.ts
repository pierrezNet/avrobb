/**
 * Formulaire d'admin_options.php valide, partagé par les tests du service et de la page.
 */

/** Formulaire valide, complété par `overrides`. */
export function optionsForm(overrides: Record<string, string> = {}): Record<string, string> {
	return {
		board_title: 'Pilote-Virtuel',
		board_desc: 'Le forum',
		base_url: 'http://localhost:8080',
		default_timezone: '1',
		default_dst: '1',
		default_lang: 'French',
		default_style: 'Air',
		time_format: 'H:i',
		date_format: 'd/m/Y',
		timeout_visit: '1800',
		timeout_online: '300',
		redirect_delay: '1',
		topic_review: '15',
		disp_topics_default: '30',
		disp_posts_default: '25',
		indent_num_spaces: '4',
		quote_depth: '3',
		feed_type: '2',
		feed_ttl: '0',
		report_method: '0',
		mailing_list: '',
		avatars_dir: 'img/avatars',
		avatars_width: '100',
		avatars_height: '100',
		avatars_size: '20480',
		admin_email: 'admin@example.test',
		webmaster_email: 'web@example.test',
		default_email_setting: '1',
		announcement_message: 'Bienvenue',
		rules_message: 'Soyez courtois',
		maintenance_message: 'Pause',
		...overrides,
	};
}
