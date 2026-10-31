-- Retours de l'application Donne Ton Point (donnetonpoint.fr, formulaire « J'ai un retour », sans
-- compte), reçus de sa Pages Function par liaison de service (worker.ts, DonneTonPointFeedback), sur
-- le modèle des retours Phraséo (0005 à 0007) :
-- - un compte système « Retours Donne Ton Point » qui signe les sujets : sans fournisseur SSO
--   (personne ne peut s'y connecter), sans messagerie privée ni renommée ;
-- - un forum privé « à trier », dans la catégorie du forum public « Donne ton point » (n° 3), juste
--   après lui, illisible pour tous sauf les administrateurs (absents de forum_perms : toujours lecteurs) ;
-- - trois réglages qui les désignent (identifiants calculés ici, différents d'une base à l'autre) et
--   le forum public des retours acceptés : le n° 3 s'il existe, sinon 0 (bouton « Accepter » masqué).

INSERT INTO users (group_id, username, email, email_setting, use_pm, reputation_enable)
VALUES (4, 'Retours Donne Ton Point', '', 2, 0, 0);

-- Place libérée juste après le forum n° 3 dans sa catégorie (rien ne bouge s'il n'existe pas).
UPDATE forums SET disp_position = disp_position + 1
WHERE cat_id = (SELECT cat_id FROM forums WHERE id = 3)
	AND disp_position > (SELECT disp_position FROM forums WHERE id = 3);

INSERT INTO forums (forum_name, forum_desc, cat_id, disp_position)
VALUES (
	'Retours Donne Ton Point (à trier)',
	'Retours envoyés depuis l''application, sans compte. Privé : à déplacer vers le forum public s''ils intéressent tout le monde.',
	COALESCE((SELECT cat_id FROM forums WHERE id = 3), (SELECT MIN(id) FROM categories), 0),
	COALESCE((SELECT disp_position FROM forums WHERE id = 3), 0) + 1
);

INSERT INTO forum_perms (group_id, forum_id, read_forum, post_replies, post_topics)
SELECT g.g_id, f.id, 0, 0, 0
FROM groups AS g, forums AS f
WHERE g.g_id IN (2, 3, 4) AND f.forum_name = 'Retours Donne Ton Point (à trier)';

INSERT INTO config (conf_name, conf_value) VALUES
	('o_dtp_feedback_forum', (SELECT id FROM forums WHERE forum_name = 'Retours Donne Ton Point (à trier)')),
	('o_dtp_feedback_user', (SELECT id FROM users WHERE username = 'Retours Donne Ton Point')),
	('o_dtp_feedback_target', COALESCE((SELECT id FROM forums WHERE id = 3), 0));
