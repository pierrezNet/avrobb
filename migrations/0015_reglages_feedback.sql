-- Retours de l'Atelier réglages MSFS d'aeronautique.xyz (formulaire « J'ai un retour », sans compte),
-- reçus du relais du site par liaison de service (worker.ts, ReglagesFeedback), sur le modèle de
-- l'Horloge UTC et du SELCAL (0012) :
-- - un compte système « Retours Atelier réglages » qui signe les sujets : sans fournisseur SSO
--   (personne ne peut s'y connecter), sans messagerie privée ni renommée ;
-- - un forum privé « à trier », dans la catégorie du forum public n° 13 « Atelier réglages MSFS »,
--   juste après lui, illisible pour tous sauf les administrateurs ;
-- - trois réglages qui les désignent et le forum public des retours acceptés : le n° 13 s'il existe,
--   sinon 0 (bouton « Accepter » masqué).

INSERT INTO users (group_id, username, email, email_setting, use_pm, reputation_enable)
VALUES (4, 'Retours Atelier réglages', '', 2, 0, 0);

UPDATE forums SET disp_position = disp_position + 1
WHERE cat_id = (SELECT cat_id FROM forums WHERE id = 13)
	AND disp_position > (SELECT disp_position FROM forums WHERE id = 13);

INSERT INTO forums (forum_name, forum_desc, cat_id, disp_position)
VALUES (
	'Retours Atelier réglages (à trier)',
	'Retours envoyés depuis l''application, sans compte. Privé : à déplacer vers le forum public s''ils intéressent tout le monde.',
	COALESCE((SELECT cat_id FROM forums WHERE id = 13), (SELECT MIN(id) FROM categories), 0),
	COALESCE((SELECT disp_position FROM forums WHERE id = 13), 0) + 1
);

INSERT INTO forum_perms (group_id, forum_id, read_forum, post_replies, post_topics)
SELECT g.g_id, f.id, 0, 0, 0
FROM groups AS g, forums AS f
WHERE g.g_id IN (2, 3, 4) AND f.forum_name = 'Retours Atelier réglages (à trier)';

INSERT INTO config (conf_name, conf_value) VALUES
	('o_reglages_feedback_forum', (SELECT id FROM forums WHERE forum_name = 'Retours Atelier réglages (à trier)')),
	('o_reglages_feedback_user', (SELECT id FROM users WHERE username = 'Retours Atelier réglages')),
	('o_reglages_feedback_target', COALESCE((SELECT id FROM forums WHERE id = 13), 0));
