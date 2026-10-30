/**
 * Préfixes du sujet (topic_prefixes.php?id=…, page propre à Node) : l'auteur d'une discussion et les
 * modérateurs du forum ajoutent ou retirent les balises du sujet (« [AvroBB] », « [Résolu] »…) à tout
 * moment, sans toucher au message, même après les 30 minutes de modification.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { topicUrl } from '../presenters/topicPage.ts';
import type { StopwordsReader } from '../repositories/StopwordsLoader.ts';
import type { SubjectPrefixStore } from '../repositories/SubjectPrefixRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import { canEditSubjectPrefixes } from '../services/permissions.ts';
import { MAX_SUBJECT_LENGTH } from '../services/posting.ts';
import { indexWords } from '../services/searchIndex.ts';
import { applyPrefixes, splitPrefixes } from '../services/subjectPrefixes.ts';
import { tagColors } from '../services/subjectTags.ts';
import { positiveInt } from './params.ts';

export interface SubjectPrefixControllerDeps extends LayoutDeps {
	topics: TopicReader;
	subjectPrefixes: SubjectPrefixStore;
	stopwords: StopwordsReader;
}

export interface SubjectPrefixQuery {
	id?: string;
}

export class SubjectPrefixController {
	constructor(private readonly deps: SubjectPrefixControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: SubjectPrefixQuery }>, reply: AppReply): Promise<AppReply> => {
		const topic = await this.#topic(request, reply);
		if (!('subject' in topic)) return topic;
		return this.#render(request, reply, topic, splitPrefixes(topic.subject, request.board.subjectTags).prefixes, null);
	};

	submit = async (request: AppRequest<{ Querystring: SubjectPrefixQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const topic = await this.#topic(request, reply);
		if (!('subject' in topic)) return topic;
		const tags = request.board.subjectTags;
		const selected = tags.map((tag) => tag.name).filter((name) => field(request.body, `prefix[${name}]`) !== '');
		const subject = applyPrefixes(topic.subject, selected, tags);
		if ([...subject].length > MAX_SUBJECT_LENGTH)
			return this.#render(request, reply, topic, selected, this.deps.page.lang.topic.prefixesTooLong, 400);
		if (subject !== topic.subject) {
			const message = await this.deps.subjectPrefixes.firstPostMessage(topic.firstPostId);
			const words = indexWords(message, subject, await this.deps.stopwords.load());
			await this.deps.subjectPrefixes.updateSubject(topic.id, topic.firstPostId, subject, words);
		}
		return reply.redirect(topicUrl(topic.id), 303);
	};

	/** Discussion lisible et modifiable par le lecteur, ou la réponse d'erreur. */
	async #topic(request: AppRequest<{ Querystring: SubjectPrefixQuery }>, reply: AppReply) {
		const { lang } = this.deps.page;
		const id = positiveInt(request.query.id);
		const topic = id > 0 ? await this.deps.topics.findReadable(id, request.viewer.group.id, request.viewer.id) : null;
		if (topic === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);
		if (!canEditSubjectPrefixes(request.viewer, topic)) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);
		return topic;
	}

	#render(
		request: AppRequest,
		reply: AppReply,
		topic: { id: number; subject: string },
		selected: readonly string[],
		error: string | null,
		status = 200,
	): Promise<AppReply> {
		const { lang } = this.deps.page;
		const choices = (group: 'project' | 'other') =>
			request.board.subjectTags
				.filter((tag) => tag.group === group)
				.map((tag) => ({ prefix: tag.name, checked: selected.includes(tag.name), colors: tagColors(tag) }));
		reply.code(status);
		return renderPage(
			request,
			reply,
			this.deps,
			'topic_prefixes.njk',
			{ pageId: 'topic_prefixes', titleParts: [request.board.boardTitle, lang.topic.subjectPrefixes] },
			{
				subject: topic.subject,
				formAction: `topic_prefixes.php?id=${topic.id}`,
				topicHref: topicUrl(topic.id),
				projects: choices('project'),
				other: choices('other'),
				error,
			},
		);
	}
}
