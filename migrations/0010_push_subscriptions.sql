-- Notifications push (application installable) : un abonnement par appareil et navigateur, avec la
-- langue de la page où il a été pris (texte de la notification). Préférences par membre : messages
-- privés et mentions, réponses aux discussions suivies.
CREATE TABLE push_subscriptions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	endpoint TEXT NOT NULL UNIQUE,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	locale TEXT NOT NULL DEFAULT 'fr',
	created INTEGER NOT NULL
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

ALTER TABLE users ADD COLUMN push_pm INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN push_replies INTEGER NOT NULL DEFAULT 1;
