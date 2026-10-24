<?php
// Oracle du parseur : exécute parse_message() / parse_signature() de PiloteVirtuel sur les cas
// JSON lus sur l'entrée standard et écrit les sorties en JSON. Lancé dans le conteneur pv_web par
// scripts/bbcode-reference.ts ; aucune base n'est nécessaire.
define('PUN', 1);
define('PUN_ROOT', '/var/www/html/');
define('FORUM_CACHE_DIR', PUN_ROOT.'cache/');
require PUN_ROOT.'include/utf8/utf8.php';
require PUN_ROOT.'include/functions.php';

$pun_config = array(
	'o_censoring' => '0', 'p_message_bbcode' => '1', 'p_message_img_tag' => '1', 'p_sig_bbcode' => '1', 'p_sig_img_tag' => '1',
	'o_smilies' => '1', 'o_smilies_sig' => '1', 'o_indent_num_spaces' => '4', 'o_base_url' => 'http://forum.test', 'o_make_links' => '1',
);
$pun_user = array('show_smilies' => '1', 'show_img' => '1', 'show_img_sig' => '1', 'language' => 'French');
$lang_common = array('wrote' => 'a écrit&#160;:', 'Image link' => 'image');

require PUN_ROOT.'include/parser.php';

$out = array();
foreach (json_decode(stream_get_contents(STDIN), true) as $case)
	$out[$case['name']] = empty($case['signature']) ? parse_message($case['text'], '0') : parse_signature($case['text']);

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
