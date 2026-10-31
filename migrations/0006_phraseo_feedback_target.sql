-- Retours Phraséo : forum public où un administrateur publie un retour « accepté » depuis le forum
-- privé « à trier » (bouton « Accepter » de la page du sujet). Par défaut le forum de la phraséologie
-- (n° 4) s'il existe, sinon 0 (bouton masqué) ; modifiable dans Administration → Options.
INSERT INTO config (conf_name, conf_value)
VALUES ('o_phraseo_feedback_target', COALESCE((SELECT id FROM forums WHERE id = 4), 0));
