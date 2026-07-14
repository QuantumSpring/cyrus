import type { PlaneAgentRunWebhook } from "./types.js";

const slugify = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 40);

/**
 * Produces the Linear-SDK-shaped AgentSessionEvent webhook that
 * EdgeWorker.handleWebhook dispatches on (the working legacy "event" path —
 * the InternalMessage bus handlers are unimplemented stubs, see plan header).
 * Typed as a structural literal; EdgeWorker consumes it via type guards that
 * check only `type` and `action`.
 */
export class PlaneWebhookTranslator {
	toAgentSessionEvent(webhook: PlaneAgentRunWebhook) {
		const { data } = webhook;
		const detail = data.issue_detail;
		const identifier = detail
			? `${detail.project_identifier}-${detail.sequence_id}`
			: (data.issue ?? data.id);

		const agentSession = {
			id: data.id,
			status: "active",
			issue: {
				id: data.issue ?? "",
				identifier,
				title: detail?.name ?? "",
				description: detail?.description_stripped ?? "",
				url: detail?.url ?? "",
				branchName: `${slugify(identifier)}-${slugify(detail?.name ?? "agent-run")}`,
				team: detail
					? {
							id: data.project ?? "",
							key: detail.project_identifier,
							name: detail.project_identifier,
						}
					: undefined,
				labels: { nodes: [] },
			},
			// Session prompt: mention comment body for comment_thread runs,
			// synthesized issue prompt for assignment runs.
			comment: { id: data.source_comment ?? data.id, body: data.prompt },
		};

		if (webhook.action === "prompted") {
			return {
				type: "AgentSessionEvent" as const,
				action: "prompted" as const,
				organizationId: data.workspace,
				createdAt: new Date().toISOString(),
				agentSession,
				agentActivity: {
					id: `plane-prompt-${Date.now()}`,
					content: { type: "prompt", body: data.prompt },
					signal: undefined,
				},
			};
		}
		return {
			type: "AgentSessionEvent" as const,
			action: "created" as const,
			organizationId: data.workspace,
			createdAt: new Date().toISOString(),
			agentSession,
			guidance: undefined,
		};
	}
}
