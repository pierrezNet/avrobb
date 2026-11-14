-- Réactions sur les messages : une par membre et par message, parmi une liste fixe
-- (services/reactions.ts, 👍 « J'aime » compris). Option o_post_reactions (Fonctionnalités).
CREATE TABLE post_reactions (
	post_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	reaction TEXT NOT NULL,
	created INTEGER NOT NULL,
	PRIMARY KEY (post_id, user_id)
) WITHOUT ROWID;
CREATE INDEX post_reactions_created_idx ON post_reactions (created);
INSERT INTO config (conf_name, conf_value) VALUES ('o_post_reactions', '1');
