/**
 * Compte Premium de PV (premium.php) : état du compte, activation ou prolongation par un code
 * (« PV15… » 15 jours, « PV365… » un an), liens d'achat (boutique Digiseller).
 *
 * Écarts assumés : page dans la mise en page du forum, membre authentifié par la session (le PHP
 * lisait l'identifiant dans le cookie sans le vérifier, et se connectait à la base avec des
 * identifiants écrits en dur) ; la ligne apremium n'est créée qu'à l'activation d'un code (le PHP
 * l'écrivait à chaque visite) ; activation en POST avec jeton CSRF ; un code refusé est signalé.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import type { PremiumStore } from '../repositories/PremiumRepository.ts';
import { punTrim } from '../services/phpString.ts';
import { codeKind, extendedExpiration, premiumState } from '../services/premium.ts';

export interface PremiumControllerDeps extends LayoutDeps {
	premium: PremiumStore;
}

export interface PremiumQuery {
	done?: string;
}

type PremiumRequest = FastifyRequest<{ Querystring: PremiumQuery; Body?: FormBody }>;

/** « AAAA-MM-JJ » → « AAAA/MM/JJ », le format affiché par le PHP. */
const displayDay = (day: string): string => day.replaceAll('-', '/');

export class PremiumController {
	constructor(private readonly deps: PremiumControllerDeps) {}

	show = async (request: PremiumRequest, reply: FastifyReply, errors: string[] = []): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		if (viewer.isGuest)
			return renderMessage(request, reply, this.deps, 403, lang.premium.notLoggedIn, { href: 'login.php', label: lang.common.login });

		const expiration = await this.deps.premium.findExpiration(viewer.id);
		const state = premiumState(expiration, this.deps.page.clock());
		return renderPage(
			request,
			reply,
			this.deps,
			'premium.njk',
			{ pageId: 'premium', titleParts: [config.boardTitle, lang.premium.title] },
			{
				status: lang.premium.status(lang.premium.states[state]),
				expiration: expiration !== null ? lang.premium.expiration(displayDay(expiration)) : lang.premium.neverPremium,
				thanks: state === 'active' ? lang.premium.thanksActive : state === 'lifetime' ? lang.premium.thanksLifetime : null,
				// Prolonger un compte actif est permis ; l'achat n'est proposé qu'à un compte inactif, comme le PHP.
				codeForm: state !== 'lifetime' ? { legend: state === 'active' ? lang.premium.extend : lang.premium.activate } : null,
				notice: request.query.done === 'activated' ? lang.premium.activated : null,
				errors,
			},
		);
	};

	activate = async (request: FastifyRequest<{ Querystring: PremiumQuery; Body: FormBody }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer } = request;
		const { lang } = this.deps.page;
		if (viewer.isGuest) return renderMessage(request, reply, this.deps, 403, lang.premium.notLoggedIn);

		const code = punTrim(field(request.body, 'code'));
		const kind = codeKind(code);
		if (kind === null || code.length > 64) return this.show(request, reply, [lang.premium.badCode]);

		const now = this.deps.page.clock();
		const expiration = extendedExpiration(await this.deps.premium.findExpiration(viewer.id), kind.days, now);
		if (!(await this.deps.premium.redeemCode(viewer.id, kind.table, code, expiration)))
			return this.show(request, reply, [lang.premium.badCode]);
		return reply.redirect('premium.php?done=activated', 303);
	};
}
