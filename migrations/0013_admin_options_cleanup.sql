-- Options de l'administration : « Nouveaux comptes » (o_regs_allow) bloque désormais la création d'un
-- compte par GitHub ou Google ; elle passe à « Oui » pour ne rien fermer au déploiement. Réglages sans
-- effet retirés : cache des flux, SMTP (les e-mails passent par Resend), vérification des inscriptions.
UPDATE config SET conf_value = '1' WHERE conf_name = 'o_regs_allow';
DELETE FROM config WHERE conf_name IN ('o_feed_ttl', 'o_smtp_host', 'o_smtp_user', 'o_smtp_pass', 'o_smtp_ssl', 'o_regs_verify');
