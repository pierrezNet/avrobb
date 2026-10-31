-- Retours de l'application Phraséo (formulaire « J'ai un retour », sans compte), reçus du relais
-- de Phraséo par liaison de service (worker.ts, PhraseoFeedback) :
-- - un compte système « Retours Phraséo » qui signe les sujets. Comme l'invité, il n'a pas de
--   fournisseur SSO : personne ne peut s'y connecter (connexion par fournisseur et identifiant) ;
-- - un forum privé « à trier », dans la catégorie du forum de la phraséologie (n° 4), illisible
--   pour tous sauf les administrateurs (absents de forum_perms : toujours lecteurs). Un sujet utile
--   à tous est ensuite déplacé vers le forum public par la modération ;
-- - deux réglages qui les désignent (identifiants calculés ici, différents d'une base à l'autre).

INSERT INTO users (group_id, username, email, email_setting) VALUES (4, 'Retours Phraséo', '', 2);

INSERT INTO forums (forum_name, forum_desc, cat_id, disp_position)
VALUES (
	'Retours Phraséo (à trier)',
	'Retours envoyés depuis l''application, sans compte. Privé : à déplacer vers le forum public s''ils intéressent tout le monde.',
	COALESCE((SELECT cat_id FROM forums WHERE id = 4), (SELECT MIN(id) FROM categories), 0),
	COALESCE((SELECT disp_position FROM forums WHERE id = 4), 0) + 1
);

INSERT INTO forum_perms (group_id, forum_id, read_forum, post_replies, post_topics)
SELECT g.g_id, f.id, 0, 0, 0
FROM groups AS g, forums AS f
WHERE g.g_id IN (2, 3, 4) AND f.forum_name = 'Retours Phraséo (à trier)';

INSERT INTO config (conf_name, conf_value) VALUES
	('o_phraseo_feedback_forum', (SELECT id FROM forums WHERE forum_name = 'Retours Phraséo (à trier)')),
	('o_phraseo_feedback_user', (SELECT id FROM users WHERE username = 'Retours Phraséo'));
