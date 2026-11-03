-- « Règles » (o_rules) mène désormais à la page Termes et règles : son texte propre disparaît.
DELETE FROM config WHERE conf_name = 'o_rules_message';
