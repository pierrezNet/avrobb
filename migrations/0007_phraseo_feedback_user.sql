-- Retours Phraséo : le compte système qui signe les retours ne représente personne. Ni
-- messagerie privée ni renommée : ses liens disparaissent sous les messages, et le serveur refuse
-- déjà un MP vers un membre sans messagerie (services/privateMessages.ts) comme un vote sur un
-- membre sans renommée (ReputationRepository). Désigné par son réglage, pas par son nom.
UPDATE users SET use_pm = 0, reputation_enable = 0
WHERE id = (SELECT CAST(conf_value AS INTEGER) FROM config WHERE conf_name = 'o_phraseo_feedback_user');
