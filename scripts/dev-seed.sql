-- Point de départ de la base locale de développement (npm run db:seed:dev), après les migrations :
-- un administrateur pour la connexion de développement (DEV_LOGIN=1, nom « Emmanuel ») et une
-- première catégorie avec deux forums, à renommer ou compléter dans l'administration.
-- À ne pas appliquer à la base en ligne : les administrateurs y viendront du SSO (lot 5).

INSERT INTO users (group_id, username, email, registered, last_visit) VALUES (1, 'Emmanuel', '', unixepoch(), unixepoch());

INSERT INTO categories (cat_name, disp_position) VALUES ('Projets', 1);

INSERT INTO forums (forum_name, forum_desc, cat_id, disp_position) VALUES
	('AvroBB', 'Le forum lui-même : idées, bugs, évolutions.', (SELECT MAX(id) FROM categories), 1),
	('Discussions', 'Tout le reste.', (SELECT MAX(id) FROM categories), 2);
