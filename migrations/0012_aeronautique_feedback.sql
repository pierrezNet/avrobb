-- Retours des applications Horloge UTC et SELCAL d'aeronautique.xyz (formulaire « J'ai un retour »,
-- sans compte), reçus du relais du site par liaison de service (worker.ts, HorlogeUtcFeedback et
-- SelcalFeedback), sur le modèle de Donne Ton Point (0008). Pour chaque application :
-- - un compte système qui signe les sujets : sans fournisseur SSO (personne ne peut s'y connecter),
--   sans messagerie privée ni renommée ;
-- - un forum privé « à trier », dans la catégorie de son forum public (n° 8 « Horloge UTC »,
--   n° 9 « SELCAL »), juste après lui, illisible pour tous sauf les administrateurs ;
-- - trois réglages qui les désignent et le forum public des retours acceptés : le n° 8 ou 9 s'il
--   existe, sinon 0 (bouton « Accepter » masqué).

-- ── Horloge UTC (forum public n° 8) ──────────────────────────────────────────────────────────

INSERT INTO users (group_id, username, email, email_setting, use_pm, reputation_enable)
VALUES (4, 'Retours Horloge UTC', '', 2, 0, 0);

UPDATE forums SET disp_position = disp_position + 1
WHERE cat_id = (SELECT cat_id FROM forums WHERE id = 8)
	AND disp_position > (SELECT disp_position FROM forums WHERE id = 8);

INSERT INTO forums (forum_name, forum_desc, cat_id, disp_position)
VALUES (
	'Retours Horloge UTC (à trier)',
	'Retours envoyés depuis l''application, sans compte. Privé : à déplacer vers le forum public s''ils intéressent tout le monde.',
	COALESCE((SELECT cat_id FROM forums WHERE id = 8), (SELECT MIN(id) FROM categories), 0),
	COALESCE((SELECT disp_position FROM forums WHERE id = 8), 0) + 1
);

INSERT INTO forum_perms (group_id, forum_id, read_forum, post_replies, post_topics)
SELECT g.g_id, f.id, 0, 0, 0
FROM groups AS g, forums AS f
WHERE g.g_id IN (2, 3, 4) AND f.forum_name = 'Retours Horloge UTC (à trier)';

INSERT INTO config (conf_name, conf_value) VALUES
	('o_utc_feedback_forum', (SELECT id FROM forums WHERE forum_name = 'Retours Horloge UTC (à trier)')),
	('o_utc_feedback_user', (SELECT id FROM users WHERE username = 'Retours Horloge UTC')),
	('o_utc_feedback_target', COALESCE((SELECT id FROM forums WHERE id = 8), 0));

-- ── SELCAL (forum public n° 9) ───────────────────────────────────────────────────────────────

INSERT INTO users (group_id, username, email, email_setting, use_pm, reputation_enable)
VALUES (4, 'Retours SELCAL', '', 2, 0, 0);

UPDATE forums SET disp_position = disp_position + 1
WHERE cat_id = (SELECT cat_id FROM forums WHERE id = 9)
	AND disp_position > (SELECT disp_position FROM forums WHERE id = 9);

INSERT INTO forums (forum_name, forum_desc, cat_id, disp_position)
VALUES (
	'Retours SELCAL (à trier)',
	'Retours envoyés depuis l''application, sans compte. Privé : à déplacer vers le forum public s''ils intéressent tout le monde.',
	COALESCE((SELECT cat_id FROM forums WHERE id = 9), (SELECT MIN(id) FROM categories), 0),
	COALESCE((SELECT disp_position FROM forums WHERE id = 9), 0) + 1
);

INSERT INTO forum_perms (group_id, forum_id, read_forum, post_replies, post_topics)
SELECT g.g_id, f.id, 0, 0, 0
FROM groups AS g, forums AS f
WHERE g.g_id IN (2, 3, 4) AND f.forum_name = 'Retours SELCAL (à trier)';

INSERT INTO config (conf_name, conf_value) VALUES
	('o_selcal_feedback_forum', (SELECT id FROM forums WHERE forum_name = 'Retours SELCAL (à trier)')),
	('o_selcal_feedback_user', (SELECT id FROM users WHERE username = 'Retours SELCAL')),
	('o_selcal_feedback_target', COALESCE((SELECT id FROM forums WHERE id = 9), 0));
