-- Pseudo choisi à la première connexion d'après le fournisseur SSO : le membre peut le changer une
-- fois lui-même dans son profil (1 : déjà changé ; les administrateurs renomment toujours).
ALTER TABLE users ADD COLUMN username_changed INTEGER NOT NULL DEFAULT 0;
