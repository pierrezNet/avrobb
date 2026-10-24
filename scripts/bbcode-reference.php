<?php
// Oracle du parseur : exécute les fonctions de PiloteVirtuel sur les cas JSON lus sur l'entrée
// standard et écrit les sorties en JSON. Lancé dans le conteneur pv_web par
// scripts/bbcode-reference.ts ; aucune base n'est nécessaire.
//
// Champ « fn » d'un cas : absent → parse_message() (ou parse_signature() si « signature »),
// « preparse » → preparse_bbcode() (texte et erreurs), « index » → mots indexés
// (début de update_search_index()), « email » → bbcode2email($text, -1).
define('PUN', 1);
define('PUN_ROOT', '/var/www/html/');
define('FORUM_CACHE_DIR', PUN_ROOT.'cache/');
define('PUN_SEARCH_MIN_WORD', 3);
define('PUN_SEARCH_MAX_WORD', 20);
require PUN_ROOT.'include/utf8/utf8.php';
require PUN_ROOT.'include/functions.php';

$pun_config = array(
	'o_censoring' => '0', 'p_message_bbcode' => '1', 'p_message_img_tag' => '1', 'p_sig_bbcode' => '1', 'p_sig_img_tag' => '1',
	'o_smilies' => '1', 'o_smilies_sig' => '1', 'o_indent_num_spaces' => '4', 'o_base_url' => 'http://forum.test', 'o_make_links' => '1',
	'o_quote_depth' => '3',
);
$pun_user = array('show_smilies' => '1', 'show_img' => '1', 'show_img_sig' => '1', 'language' => 'French', 'g_post_links' => '1');
$lang_common = array('wrote' => 'a écrit&#160;:', 'Image link' => 'image');

require PUN_ROOT.'include/parser.php';
require PUN_ROOT.'include/search_idx.php';
require PUN_ROOT.'include/email.php';
require PUN_ROOT.'lang/French/common.php';
require PUN_ROOT.'lang/French/post.php';
require PUN_ROOT.'lang/French/profile.php';
$lang_common['wrote'] = 'a écrit&#160;:';

$out = array();
foreach (json_decode(stream_get_contents(STDIN), true) as $case)
{
	$fn = isset($case['fn']) ? $case['fn'] : 'parse';
	if ($fn == 'preparse')
	{
		$pun_user['g_post_links'] = isset($case['noLinks']) ? '0' : '1';
		$errors = array();
		$text = preparse_bbcode(pun_linebreaks($case['text']), $errors, !empty($case['signature']));
		$out[$case['name']] = array('text' => $text, 'errors' => $errors);
	}
	else if ($fn == 'index')
	{
		$subject = isset($case['subject']) ? $case['subject'] : null;
		$message = strip_bbcode(utf8_strtolower($case['text']));
		$out[$case['name']] = array(
			'post' => array_values(split_words($message, true)),
			'subject' => $subject ? array_values(split_words(utf8_strtolower($subject), true)) : array(),
		);
	}
	else if ($fn == 'email')
		$out[$case['name']] = bbcode2email($case['text'], -1);
	else
		$out[$case['name']] = empty($case['signature']) ? parse_message($case['text'], '0') : parse_signature($case['text']);
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
