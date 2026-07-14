import type {
	AgentEventTransportConfig,
	IAgentEventTransport,
	IIssueTrackerService,
} from "cyrus-core";
import { PlaneEventTransport } from "./PlaneEventTransport.js";

export interface PlaneIssueTrackerConfig {
	apiUrl: string; // http://localhost:8000
	apiKey: string; // PLANE_BOT_TOKEN
	workspaceSlug: string;
	projectId: string;
	webUrl?: string;
	agentSlug?: string;
}

// Plane state group → Linear WorkflowState type
const STATE_TYPE_MAP: Record<string, string> = {
	backlog: "backlog",
	unstarted: "unstarted",
	started: "started",
	completed: "completed",
	cancelled: "canceled",
};

const notImplemented = (method: string): never => {
	throw new Error(
		`PlaneIssueTrackerService.${method} is not implemented for the PoC`,
	);
};

/**
 * IIssueTrackerService implementation backed by Plane's external REST API
 * (plain fetch for the issue/comment/state hot path). Agent run/activity
 * operations use the pinned official SDK and are implemented in a later task.
 *
 * Return objects are structural literals shaped like the core Issue/Comment/
 * Connection/WorkflowState types; typed as `any` at the method boundary so the
 * class satisfies IIssueTrackerService without pulling in the Linear SDK
 * client (mirrors the CLI adapter's plain-object approach).
 */
export class PlaneIssueTrackerService implements IIssueTrackerService {
	constructor(protected readonly config: PlaneIssueTrackerConfig) {}

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const url = `${this.config.apiUrl}/api/v1/workspaces/${this.config.workspaceSlug}${path}`;
		const response = await fetch(url, {
			...init,
			headers: {
				"X-Api-Key": this.config.apiKey,
				"Content-Type": "application/json",
				...(init.headers ?? {}),
			},
		});
		if (!response.ok) {
			throw new Error(
				`Plane API ${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`,
			);
		}
		return (await response.json()) as T;
	}

	private issuePath(issueId: string, suffix = ""): string {
		return `/projects/${this.config.projectId}/issues/${issueId}/${suffix}`;
	}

	// biome-ignore lint/suspicious/noExplicitAny: mapped to core Issue shape (see CLIIssueTrackerService)
	private toIssue(raw: any): any {
		const identifier = raw.project_identifier
			? `${raw.project_identifier}-${raw.sequence_id}`
			: String(raw.sequence_id ?? raw.id);
		return {
			id: raw.id,
			identifier,
			title: raw.name,
			description: raw.description_stripped ?? raw.description_html ?? "",
			url: this.config.webUrl
				? `${this.config.webUrl}/${this.config.workspaceSlug}/projects/${this.config.projectId}/issues/${raw.id}`
				: "",
			branchName: undefined,
			state: raw.state ? { id: raw.state } : undefined,
		};
	}

	// biome-ignore lint/suspicious/noExplicitAny: mapped to core Comment shape
	private toComment(raw: any): any {
		return {
			id: raw.id,
			body: raw.comment_stripped ?? raw.comment_html ?? "",
			createdAt: raw.created_at,
		};
	}

	// --- hot path ---

	// biome-ignore lint/suspicious/noExplicitAny: mapped to core Issue shape
	async fetchIssue(idOrIdentifier: string): Promise<any> {
		return this.toIssue(await this.request(this.issuePath(idOrIdentifier)));
	}

	async updateIssue(
		issueId: string,
		// biome-ignore lint/suspicious/noExplicitAny: mapped to core IssueUpdateInput
		updates: { stateId?: string; [key: string]: unknown },
		// biome-ignore lint/suspicious/noExplicitAny: mapped to core Issue shape
	): Promise<any> {
		const body: Record<string, unknown> = {};
		if (updates.stateId) body.state = updates.stateId;
		return this.toIssue(
			await this.request(this.issuePath(issueId), {
				method: "PATCH",
				body: JSON.stringify(body),
			}),
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: mapped to core Connection<Comment>
	async fetchComments(issueId: string): Promise<any> {
		// biome-ignore lint/suspicious/noExplicitAny: raw API payload
		const data = await this.request<any>(this.issuePath(issueId, "comments/"));
		const results = Array.isArray(data) ? data : (data.results ?? []);
		return {
			// biome-ignore lint/suspicious/noExplicitAny: raw API payload
			nodes: results.map((comment: any) => this.toComment(comment)),
			pageInfo: { hasNextPage: false },
		};
	}

	async createComment(
		issueId: string,
		input: { body: string },
		// biome-ignore lint/suspicious/noExplicitAny: mapped to core Comment shape
	): Promise<any> {
		const raw = await this.request(this.issuePath(issueId, "comments/"), {
			method: "POST",
			body: JSON.stringify({ comment_html: `<p>${input.body}</p>` }),
		});
		return this.toComment(raw);
	}

	// biome-ignore lint/suspicious/noExplicitAny: mapped to core Connection<WorkflowState>
	async fetchWorkflowStates(_teamId: string): Promise<any> {
		// biome-ignore lint/suspicious/noExplicitAny: raw API payload
		const data = await this.request<any>(
			`/projects/${this.config.projectId}/states/`,
		);
		const results = Array.isArray(data) ? data : (data.results ?? []);
		return {
			// biome-ignore lint/suspicious/noExplicitAny: raw API payload
			nodes: results.map((state: any) => ({
				id: state.id,
				name: state.name,
				type: STATE_TYPE_MAP[state.group] ?? "unstarted",
				position: state.sequence,
			})),
			pageInfo: { hasNextPage: false },
		};
	}

	getPlatformType(): string {
		return "plane";
	}

	getPlatformMetadata(): Record<string, unknown> {
		return {
			workspaceSlug: this.config.workspaceSlug,
			projectId: this.config.projectId,
		};
	}

	createEventTransport(
		config: AgentEventTransportConfig,
	): IAgentEventTransport {
		if (config.platform !== "plane") {
			throw new Error(
				`PlaneIssueTrackerService cannot create a ${config.platform} transport`,
			);
		}
		return new PlaneEventTransport(config) as unknown as IAgentEventTransport;
	}

	// --- agent session/activity methods: implemented in Task 7 ---
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async createAgentSessionOnIssue(_input: any): Promise<any> {
		return notImplemented("createAgentSessionOnIssue");
	}
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async createAgentSessionOnComment(_input: any): Promise<any> {
		return notImplemented("createAgentSessionOnComment");
	}
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async fetchAgentSession(_sessionId: string): Promise<any> {
		return notImplemented("fetchAgentSession");
	}
	// biome-ignore lint/suspicious/noExplicitAny: implemented in Task 7
	async createAgentActivity(_input: any): Promise<any> {
		return notImplemented("createAgentActivity");
	}
	async emitStopSignalEvent(_sessionId: string): Promise<void> {
		// no-op: stop signals arrive via Plane webhooks (mirrors LinearIssueTrackerService)
	}

	// --- not needed for the PoC ---
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchIssueChildren(..._args: any[]): Promise<any> {
		return notImplemented("fetchIssueChildren");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchIssueAttachments(..._args: any[]): Promise<any> {
		return notImplemented("fetchIssueAttachments");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchComment(..._args: any[]): Promise<any> {
		return notImplemented("fetchComment");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchCommentWithAttachments(..._args: any[]): Promise<any> {
		return notImplemented("fetchCommentWithAttachments");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchTeams(..._args: any[]): Promise<any> {
		return notImplemented("fetchTeams");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchTeam(..._args: any[]): Promise<any> {
		return notImplemented("fetchTeam");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchLabels(..._args: any[]): Promise<any> {
		return notImplemented("fetchLabels");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchLabel(..._args: any[]): Promise<any> {
		return notImplemented("fetchLabel");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async getIssueLabels(..._args: any[]): Promise<any> {
		return notImplemented("getIssueLabels");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchWorkflowState(..._args: any[]): Promise<any> {
		return notImplemented("fetchWorkflowState");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchUser(..._args: any[]): Promise<any> {
		return notImplemented("fetchUser");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async fetchCurrentUser(..._args: any[]): Promise<any> {
		return notImplemented("fetchCurrentUser");
	}
	// biome-ignore lint/suspicious/noExplicitAny: stubs
	async requestFileUpload(..._args: any[]): Promise<any> {
		return notImplemented("requestFileUpload");
	}
}
