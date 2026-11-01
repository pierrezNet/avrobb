-- Traduction automatique du contenu (interface anglaise sous /en/) : messages, titres des sujets,
-- noms et descriptions des forums, traduits une fois à l'écriture par Workers AI
-- (controllers/translationJob.ts), jamais à l'affichage.
-- - kind : 'post', 'subject', 'forum_name', 'forum_desc' ; item_id : son identifiant ;
-- - lang : langue de la traduction ('fr', 'en'), ou '-' quand il n'y a rien à traduire (message
--   fait seulement d'images ou de liens), pour ne pas le reprendre à chaque passage ;
-- - source : le texte d'origine traduit. Une traduction ne s'affiche que s'il est toujours le texte
--   actuel : toute modification (édition, balises, administration…) la périme d'elle-même, sans
--   suppression à prévoir dans chaque écriture ; la tâche planifiée la refait ;
-- - manual : 1 pour une traduction saisie par l'administrateur (forums), affichée même si le texte
--   d'origine change, et jamais remplacée par une traduction automatique.
CREATE TABLE translations (
	kind TEXT NOT NULL CHECK (kind IN ('post', 'subject', 'forum_name', 'forum_desc')),
	item_id INTEGER NOT NULL,
	lang TEXT NOT NULL,
	text TEXT NOT NULL,
	source TEXT NOT NULL,
	manual INTEGER NOT NULL DEFAULT 0,
	created INTEGER NOT NULL,
	PRIMARY KEY (kind, item_id, lang)
) WITHOUT ROWID;
