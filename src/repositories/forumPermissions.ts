/**
 * Droit de lecture d'un forum pour un groupe (forum_perms), repris tel quel de toutes les requêtes
 * du PHP : pas de ligne pour ce groupe et ce forum, ou read_forum = 1. Les requêtes joignent
 * forum_perms sous l'alias « fp » :
 *
 *   .leftJoin('forum_perms as fp', (join) => join.onRef('fp.forum_id', '=', 'f.id').on('fp.group_id', '=', groupId))
 *   .where(forumReadable)
 */

import { type Expression, type SqlBool, sql } from 'kysely';

/** Condition « forum lisible » sur l'alias fp (texte SQL fixe, sans donnée de l'utilisateur). */
export const forumReadable: Expression<SqlBool> = sql<SqlBool>`(fp.read_forum IS NULL OR fp.read_forum = 1)`;
