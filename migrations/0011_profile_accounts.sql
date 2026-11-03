-- Profil : comptes actuels à la place des messageries de FluxBB (Jabber, ICQ, MSN, AIM, Yahoo).
ALTER TABLE users DROP COLUMN jabber;
ALTER TABLE users DROP COLUMN icq;
ALTER TABLE users DROP COLUMN msn;
ALTER TABLE users DROP COLUMN aim;
ALTER TABLE users DROP COLUMN yahoo;
ALTER TABLE users ADD COLUMN discord TEXT;
ALTER TABLE users ADD COLUMN mastodon TEXT;
ALTER TABLE users ADD COLUMN bluesky TEXT;
ALTER TABLE users ADD COLUMN reddit TEXT;
ALTER TABLE users ADD COLUMN discourse TEXT;
ALTER TABLE users ADD COLUMN github TEXT;
ALTER TABLE users ADD COLUMN linkedin TEXT;
