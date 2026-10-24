/**
 * Suivi des sujets lus de FluxBB : cookie <cookie_name>_track écrit par set_tracked_topics() au
 * format « t<id>=<horodatage>;f<id>=<horodatage>; ». Lecture seule ici (get_tracked_topics()) :
 * l'écriture viendra avec le lot Authentification.
 */

import type { RecentTopic } from '../domain/models.ts';

/** FORUM_MAX_COOKIE_SIZE */
const MAX_COOKIE_SIZE = 4048;

export interface TrackedTopics {
	topics: ReadonlyMap<number, number>;
	forums: ReadonlyMap<number, number>;
}

export function parseTrackedTopics(cookie: string | undefined): TrackedTopics {
	const topics = new Map<number, number>();
	const forums = new Map<number, number>();

	if (cookie !== undefined && cookie.length <= MAX_COOKIE_SIZE) {
		for (const entry of cookie.split(';')) {
			const match = /^([tf]?)(\d+)=(\d+)/.exec(entry);
			const id = Number(match?.[2] ?? 0);
			const timestamp = Number(match?.[3] ?? 0);
			if (id > 0 && timestamp > 0) (match?.[1] === 'f' ? forums : topics).set(id, timestamp);
		}
	}

	return { topics, forums };
}

/**
 * Le forum a-t-il des messages non lus ? (index.php) : dernier message postérieur à la dernière
 * visite et à la lecture du forum, et au moins un sujet récent pas encore lu.
 */
export function forumHasNewPosts(
	forumId: number,
	forumLastPost: number | null,
	lastVisit: number,
	recentTopics: readonly RecentTopic[],
	tracked: TrackedTopics,
): boolean {
	if (forumLastPost === null || forumLastPost <= lastVisit) return false;

	const forumRead = tracked.forums.get(forumId);
	if (forumRead !== undefined && forumLastPost <= forumRead) return false;

	return recentTopics.some((topic) => {
		if (topic.forumId !== forumId) return false;
		const topicRead = tracked.topics.get(topic.topicId);
		return (topicRead === undefined || topicRead < topic.lastPost) && (forumRead === undefined || forumRead < topic.lastPost);
	});
}

/**
 * set_tracked_topics() : sujets puis forums, du plus récemment lu au plus ancien, tronqué à
 * FORUM_MAX_COOKIE_SIZE sur une limite d'entrée.
 */
export function serializeTrackedTopics(tracked: TrackedTopics): string {
	const entries = (prefix: string, map: ReadonlyMap<number, number>): string[] =>
		[...map].sort((a, b) => b[1] - a[1]).map(([id, timestamp]) => `${prefix}${id}=${timestamp};`);
	let data = [...entries('t', tracked.topics), ...entries('f', tracked.forums)].join('');

	if (data.length > MAX_COOKIE_SIZE) {
		data = data.slice(0, MAX_COOKIE_SIZE);
		data = `${data.slice(0, data.lastIndexOf(';'))};`;
	}

	return data;
}

/** Copie de `tracked` où le sujet (ou le forum) est marqué lu à `now`. */
export function markRead(tracked: TrackedTopics, kind: 'topics' | 'forums', id: number, now: number): TrackedTopics {
	const updated = new Map(tracked[kind]);
	updated.set(id, now);
	return kind === 'topics' ? { topics: updated, forums: tracked.forums } : { topics: tracked.topics, forums: updated };
}
