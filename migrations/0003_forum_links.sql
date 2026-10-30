-- Liens d'un forum de projet (AvroBB) : site du projet et dépôt de code, affichés sur l'index et
-- en tête du forum. NULL : pas de lien.
ALTER TABLE forums ADD COLUMN site_url TEXT;
ALTER TABLE forums ADD COLUMN repo_url TEXT;
