-- « J'aime » et réactions émoji sur les messages : au plus un « J'aime » (slot 'like') et une réaction
-- (slot 'emoji') par membre et par message. Date pour la colonne « Messages les plus appréciés » de
-- l'accueil (réactions de la semaine). Les deux fonctions se désactivent dans les options.
CREATE TABLE post_reactions (
	post_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	slot TEXT NOT NULL CHECK (slot IN ('like', 'emoji')),
	reaction TEXT NOT NULL,
	created INTEGER NOT NULL,
	PRIMARY KEY (post_id, user_id, slot)
) WITHOUT ROWID;
CREATE INDEX post_reactions_created_idx ON post_reactions (created);

INSERT INTO config (conf_name, conf_value) VALUES ('o_post_likes', '1'), ('o_post_reactions', '1');
