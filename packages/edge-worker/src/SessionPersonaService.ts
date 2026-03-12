import type { AgentSessionCreatedWebhook, CyrusAgentSession } from "cyrus-core";

export type SessionPersona = "default" | "pm";

/**
 * Session persona helpers used by EdgeWorker.
 * Keeps persona token parsing/sanitization out of the main orchestrator.
 */
export class SessionPersonaService {
	private static readonly PM_PERSONA_TAG_DETECT = /(^|[\s])#pm(?=([\s]|$))/i;
	private static readonly PM_PERSONA_TAG_REPLACE = /(^|[\s])#pm(?=([\s]|$))/gi;

	detectPersonaFromComment(
		commentBody: string | null | undefined,
	): SessionPersona {
		if (!commentBody) {
			return "default";
		}
		return SessionPersonaService.PM_PERSONA_TAG_DETECT.test(commentBody)
			? "pm"
			: "default";
	}

	stripPmPersonaTag(commentBody: string | null | undefined): string {
		if (!commentBody) {
			return "";
		}
		const stripped = commentBody.replace(
			SessionPersonaService.PM_PERSONA_TAG_REPLACE,
			"$1",
		);
		return stripped
			.replace(/[ \t]{2,}/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	getSessionPersona(session?: CyrusAgentSession): SessionPersona {
		return session?.metadata?.persona === "pm" ? "pm" : "default";
	}

	withCleanedCommentBody(
		agentSession: AgentSessionCreatedWebhook["agentSession"],
		cleanedCommentBody: string,
	): AgentSessionCreatedWebhook["agentSession"] {
		if (!agentSession.comment) {
			return agentSession;
		}
		return {
			...agentSession,
			comment: {
				...agentSession.comment,
				body: cleanedCommentBody,
			},
		};
	}
}
