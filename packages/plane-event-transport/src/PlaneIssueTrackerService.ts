import { PlaneClient } from "@makeplane/plane-node-sdk";
import type {
	AgentEventTransportConfig,
	IAgentEventTransport,
	IIssueTrackerService,
} from "cyrus-core";
import { PlaneEventTransport } from "./PlaneEventTransport.js";

/**
 * Minimum interval between agent activity API calls. Plane rate-limits agent
 * run activity creation (~60 req/min); rapid ephemeral thoughts/actions are
 * coalesced so only the newest within a window is sent.
 */
const MIN_ACTIVITY_INTERVAL_MS = 2000;

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
	private readonly sdk: PlaneClient;
	private lastActivitySentAt = 0;
	private pendingEphemeral: { runId: string; request: any } | null = null;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		protected readonly config: PlaneIssueTrackerConfig,
		sdk?: PlaneClient,
	) {
		// IMPORTANT: `apiKey` (→ X-Api-Key header), NOT `accessToken` (→ Bearer).
		// Plane's external API authenticates bot tokens via X-Api-Key; using
		// accessToken makes every SDK call 401.
		this.sdk =
			sdk ?? new PlaneClient({ baseUrl: config.apiUrl, apiKey: config.apiKey });
	}

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

	private toComment(raw: any): any {
		return {
			id: raw.id,
			body: raw.comment_stripped ?? raw.comment_html ?? "",
			createdAt: raw.created_at,
		};
	}

	// --- hot path ---

	async fetchIssue(idOrIdentifier: string): Promise<any> {
		return this.toIssue(await this.request(this.issuePath(idOrIdentifier)));
	}

	async updateIssue(
		issueId: string,
		updates: { stateId?: string; [key: string]: unknown },
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

	async fetchComments(issueId: string): Promise<any> {
		const data = await this.request<any>(this.issuePath(issueId, "comments/"));
		const results = Array.isArray(data) ? data : (data.results ?? []);
		return {
			nodes: results.map((comment: any) => this.toComment(comment)),
			pageInfo: { hasNextPage: false },
		};
	}

	async createComment(issueId: string, input: { body: string }): Promise<any> {
		const raw = await this.request(this.issuePath(issueId, "comments/"), {
			method: "POST",
			body: JSON.stringify({ comment_html: `<p>${input.body}</p>` }),
		});
		return this.toComment(raw);
	}

	async fetchWorkflowStates(_teamId: string): Promise<any> {
		const data = await this.request<any>(
			`/projects/${this.config.projectId}/states/`,
		);
		const results = Array.isArray(data) ? data : (data.results ?? []);
		return {
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

	// --- agent session/activity methods (Plane SDK) ---

	async createAgentActivity(input: any): Promise<any> {
		const { agentSessionId, content, ephemeral, signal } = input;
		const type = content.type as string;
		const planeSignal =
			signal === "stop" || signal === "Stop"
				? "stop"
				: type === "elicitation"
					? "select"
					: "continue";
		const isEphemeral = ephemeral ?? (type === "thought" || type === "action");
		const request = {
			type,
			content,
			ephemeral: isEphemeral,
			signal: planeSignal,
		};

		if (
			isEphemeral &&
			Date.now() - this.lastActivitySentAt < MIN_ACTIVITY_INTERVAL_MS
		) {
			// Coalesce: keep only the newest ephemeral, flush after the window
			this.pendingEphemeral = { runId: agentSessionId, request };
			this.scheduleFlush();
			return { success: true, agentActivity: { id: "queued" } };
		}
		return this.sendActivity(agentSessionId, request);
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return;
		const wait = Math.max(
			0,
			MIN_ACTIVITY_INTERVAL_MS - (Date.now() - this.lastActivitySentAt),
		);
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			const pending = this.pendingEphemeral;
			this.pendingEphemeral = null;
			if (pending) {
				void this.sendActivity(pending.runId, pending.request).catch(() => {
					/* logged in sendActivity */
				});
			}
		}, wait + 100);
	}

	private async sendActivity(runId: string, request: any): Promise<any> {
		this.lastActivitySentAt = Date.now();
		try {
			const activity = await this.sdk.agentRuns.activities.create(
				this.config.workspaceSlug,
				runId,
				request,
			);
			return { success: true, agentActivity: activity };
		} catch (_error) {
			// One retry after backoff on rate-limit-ish failures
			await new Promise((resolvePromise) =>
				setTimeout(resolvePromise, MIN_ACTIVITY_INTERVAL_MS),
			);
			const activity = await this.sdk.agentRuns.activities.create(
				this.config.workspaceSlug,
				runId,
				request,
			);
			return { success: true, agentActivity: activity };
		}
	}

	async createAgentSessionOnIssue(input: any): Promise<any> {
		const run = await this.sdk.agentRuns.create(this.config.workspaceSlug, {
			agent_slug: this.config.agentSlug ?? "cyrus",
			issue: input.issueId,
			project: this.config.projectId,
		});
		return { success: true, agentSession: run };
	}

	async createAgentSessionOnComment(input: any): Promise<any> {
		const run = await this.sdk.agentRuns.create(this.config.workspaceSlug, {
			agent_slug: this.config.agentSlug ?? "cyrus",
			issue: input.issueId,
			project: this.config.projectId,
			source_comment: input.commentId,
		});
		return { success: true, agentSession: run };
	}

	async fetchAgentSession(sessionId: string): Promise<any> {
		return this.sdk.agentRuns.retrieve(this.config.workspaceSlug, sessionId);
	}

	async emitStopSignalEvent(_sessionId: string): Promise<void> {
		// no-op: stop signals arrive via Plane webhooks (mirrors LinearIssueTrackerService)
	}

	// --- not needed for the PoC ---
	async fetchIssueChildren(..._args: any[]): Promise<any> {
		return notImplemented("fetchIssueChildren");
	}
	async fetchIssueAttachments(..._args: any[]): Promise<any> {
		return notImplemented("fetchIssueAttachments");
	}
	async fetchComment(..._args: any[]): Promise<any> {
		return notImplemented("fetchComment");
	}
	async fetchCommentWithAttachments(..._args: any[]): Promise<any> {
		return notImplemented("fetchCommentWithAttachments");
	}
	async fetchTeams(..._args: any[]): Promise<any> {
		return notImplemented("fetchTeams");
	}
	async fetchTeam(..._args: any[]): Promise<any> {
		return notImplemented("fetchTeam");
	}
	async fetchLabels(..._args: any[]): Promise<any> {
		return notImplemented("fetchLabels");
	}
	async fetchLabel(..._args: any[]): Promise<any> {
		return notImplemented("fetchLabel");
	}
	async getIssueLabels(..._args: any[]): Promise<any> {
		return notImplemented("getIssueLabels");
	}
	async fetchWorkflowState(..._args: any[]): Promise<any> {
		return notImplemented("fetchWorkflowState");
	}
	async fetchUser(..._args: any[]): Promise<any> {
		return notImplemented("fetchUser");
	}
	async fetchCurrentUser(..._args: any[]): Promise<any> {
		return notImplemented("fetchCurrentUser");
	}
	async requestFileUpload(..._args: any[]): Promise<any> {
		return notImplemented("requestFileUpload");
	}
}
