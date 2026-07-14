export type { PlaneEventTransportConfig } from "cyrus-core"; // re-export for consumers

export interface PlaneIssueDetail {
	id: string;
	name: string;
	sequence_id: number;
	project_identifier: string;
	description_stripped: string | null;
	priority: string | null;
	state_id: string | null;
	url: string;
}

export interface PlaneAgentRunData {
	id: string;
	status: string;
	type: "comment_thread" | "assignment";
	agent_user: string;
	issue: string | null;
	project: string | null;
	workspace: string;
	source_comment: string | null;
	started_at: string;
	ended_at: string | null;
	external_link: string | null;
	workspace_slug: string;
	prompt: string;
	issue_detail: PlaneIssueDetail | null;
	source_comment_detail: { id: string; comment_html: string } | null;
	agent_user_detail: { id: string; display_name: string; agent_slug: string };
	web_url: string | null;
}

/** Envelope produced by Plane's webhook_send_task (see Plan 1, "Canonical webhook payload"). */
export interface PlaneAgentRunWebhook {
	event: "agent_run";
	action: "created" | "prompted";
	webhook_id: string;
	workspace_id: string;
	workspace_slug: string;
	data: PlaneAgentRunData;
	activity: unknown | null;
}

export function isPlaneAgentRunWebhook(
	body: unknown,
): body is PlaneAgentRunWebhook {
	if (typeof body !== "object" || body === null) return false;
	const b = body as Record<string, unknown>;
	return (
		b.event === "agent_run" &&
		(b.action === "created" || b.action === "prompted")
	);
}
