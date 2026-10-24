/**
 * Modèles de vue des brouillons de PV : liste (draft_list.php), brouillon ouvert avec ses actions,
 * confirmation de suppression, et formulaire de modification (draft_edit.php, gabarit de post.php).
 * Fonctions pures.
 */

import type { BoardConfig, Draft, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import type { ToolbarSettings } from '../services/toolbar.ts';
import { type Crumb, crumbs } from './navigation.ts';
import { messageParserOptions } from './parserOptions.ts';
import { bbcodeStatus, type PostFormState, type PostPageView, toolbarView } from './postPage.ts';

export interface DraftRow {
	href: string;
	subject: string;
	forumName: string;
	forumHref: string;
	postedAt: string;
	selected: boolean;
}

export interface DraftListView {
	crumbs: Crumb[];
	rows: DraftRow[];
	/** Brouillon ouvert (draft_list.php?id=…). */
	opened: {
		id: number;
		postedAt: string;
		/** HTML de parseMessage() (échappé par construction). */
		messageHtml: string;
		actions: { kind: 'postsubmit' | 'postedit' | 'postdelete'; href: string; label: string }[];
	} | null;
	/** Confirmation de suppression (draft_list.php?action=delete&id=…). */
	confirmDelete: { id: number } | null;
}

export interface DraftListInput {
	viewer: Viewer;
	config: BoardConfig;
	drafts: readonly Draft[];
	opened: Draft | null;
	confirmDelete: boolean;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

export function buildDraftList(input: DraftListInput): DraftListView {
	const { viewer, config, lang, opened } = input;
	const t = lang.drafts;
	const time = viewerTimeSettings(viewer);
	const format = (ts: number): string => formatTime(ts, time, input.dateWords, input.now);

	return {
		crumbs: crumbs({ label: lang.common.index, href: 'index.php' }, { label: t.title, href: 'draft_list.php' }),
		rows: input.drafts.map((draft) => ({
			href: `draft_list.php?id=${draft.id}`,
			subject: draft.subject,
			forumName: draft.forum.name,
			forumHref: `viewforum.php?id=${draft.forum.id}`,
			postedAt: format(draft.posted),
			selected: draft.id === opened?.id,
		})),
		opened:
			opened !== null && !input.confirmDelete
				? {
						id: opened.id,
						postedAt: format(opened.posted),
						messageHtml: parseMessage(opened.message, messageParserOptions(config, viewer, lang, input.censor)),
						actions: [
							{ kind: 'postsubmit', href: `post.php?id=${opened.id}&brouillon=1`, label: t.submit },
							{ kind: 'postedit', href: `draft_edit.php?id=${opened.id}`, label: t.edit },
							{ kind: 'postdelete', href: `draft_list.php?action=delete&id=${opened.id}`, label: t.delete },
						],
					}
				: null,
		confirmDelete: opened !== null && input.confirmDelete ? { id: opened.id } : null,
	};
}

export interface DraftEditInput {
	viewer: Viewer;
	config: BoardConfig;
	draft: Draft;
	form: Pick<PostFormState, 'subject' | 'message'>;
	errors: readonly string[];
	preview: string | null;
	toolbar: ToolbarSettings;
	censor: Censor | null;
	lang: Lang;
}

/** draft_edit.php, affiché par le gabarit de post.php. */
export function buildDraftEditPage(input: DraftEditInput): PostPageView {
	const { viewer, config, draft, lang, censor } = input;
	return {
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: lang.drafts.title, href: `draft_list.php?id=${draft.id}` },
			{ label: lang.drafts.editDraft, href: `draft_edit.php?id=${draft.id}` },
		),
		heading: lang.drafts.editDraft,
		formAction: `draft_edit.php?id=${draft.id}&action=edit`,
		legend: lang.post.editPostLegend,
		showSubject: draft.topicId === null,
		guest: null,
		form: { ...input.form, username: '', email: '', hideSmilies: false, subscribe: false, stickTopic: false, draft: false, draftId: null },
		errors: input.errors,
		previewHtml: input.preview !== null ? parseMessage(input.preview, messageParserOptions(config, viewer, lang, censor)) : null,
		subjectPrefixes: null,
		bbcodeStatus: bbcodeStatus(config, viewer, lang),
		toolbar: toolbarView(input.toolbar, 'form', config, lang),
		checkboxes: [],
		draftsUrl: null,
		review: [],
	};
}
