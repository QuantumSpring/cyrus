import type { PlaneAgentRunWebhook } from "../src/types.js";

export const createdWebhookFixture: PlaneAgentRunWebhook = {
	event: "agent_run",
	action: "created",
	webhook_id: "6c8b4a7e-0000-0000-0000-000000000001",
	workspace_id: "b1f90000-0000-0000-0000-000000000002",
	workspace_slug: "quantum",
	data: {
		id: "3f2c0000-0000-0000-0000-000000000003",
		status: "created",
		type: "comment_thread",
		agent_user: "9a110000-0000-0000-0000-000000000004",
		issue: "77aa0000-0000-0000-0000-000000000005",
		project: "51de0000-0000-0000-0000-000000000006",
		workspace: "b1f90000-0000-0000-0000-000000000002",
		source_comment: "c0de0000-0000-0000-0000-000000000007",
		started_at: "2026-07-14T12:00:00Z",
		ended_at: null,
		external_link: null,
		workspace_slug: "quantum",
		prompt: "fix the failing test in packages/x",
		issue_detail: {
			id: "77aa0000-0000-0000-0000-000000000005",
			name: "Fix failing test",
			sequence_id: 42,
			project_identifier: "QS",
			description_stripped: "The test fails because…",
			priority: "medium",
			state_id: "0aa10000-0000-0000-0000-000000000008",
			url: "http://localhost/quantum/projects/51de0000-0000-0000-0000-000000000006/issues/77aa0000-0000-0000-0000-000000000005",
		},
		source_comment_detail: {
			id: "c0de0000-0000-0000-0000-000000000007",
			comment_html: "<p>fix the failing test in packages/x</p>",
		},
		agent_user_detail: {
			id: "9a110000-0000-0000-0000-000000000004",
			display_name: "Cyrus",
			agent_slug: "cyrus",
		},
		web_url: "http://localhost",
	},
	activity: null,
};

export const promptedWebhookFixture: PlaneAgentRunWebhook = {
	...createdWebhookFixture,
	action: "prompted",
	data: {
		...createdWebhookFixture.data,
		status: "in_progress",
		prompt: "also update the README",
	},
};
