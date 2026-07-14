import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneIssueTrackerService } from "../src/PlaneIssueTrackerService.js";

const CONFIG = {
	apiUrl: "http://localhost:8000",
	apiKey: "plane_api_test",
	workspaceSlug: "quantum",
	projectId: "51de0000-0000-0000-0000-000000000006",
	webUrl: "http://localhost",
};

const jsonResponse = (data: unknown, status = 200) =>
	({
		ok: status < 400,
		status,
		json: async () => data,
		text: async () => JSON.stringify(data),
	}) as Response;

describe("PlaneIssueTrackerService", () => {
	let service: PlaneIssueTrackerService;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		service = new PlaneIssueTrackerService(CONFIG);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("getPlatformType returns plane", () => {
		expect(service.getPlatformType()).toBe("plane");
	});

	it("fetchIssue GETs the v1 issue endpoint with the API key and maps the shape", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				id: "77aa",
				name: "Fix it",
				sequence_id: 42,
				description_html: "<p>d</p>",
				state: "0aa1",
			}),
		);
		const issue = await service.fetchIssue("77aa");
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe(
			`${CONFIG.apiUrl}/api/v1/workspaces/quantum/projects/${CONFIG.projectId}/issues/77aa/`,
		);
		expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe(
			CONFIG.apiKey,
		);
		expect(issue.id).toBe("77aa");
		expect(issue.title).toBe("Fix it");
	});

	it("createComment POSTs comment_html", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ id: "c1", comment_html: "<p>hello</p>" }, 201),
		);
		const comment = await service.createComment("77aa", { body: "hello" });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain("/issues/77aa/comments/");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string).comment_html).toContain("hello");
		expect(comment.id).toBe("c1");
	});

	it("updateIssue PATCHes state", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				id: "77aa",
				state: "s2",
				name: "Fix it",
				sequence_id: 42,
			}),
		);
		await service.updateIssue("77aa", { stateId: "s2" });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain("/issues/77aa/");
		expect(init.method).toBe("PATCH");
		expect(JSON.parse(init.body as string)).toEqual({ state: "s2" });
	});

	it("fetchWorkflowStates maps Plane state groups to Linear-style types", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				results: [
					{ id: "s1", name: "In Review", group: "started", sequence: 2 },
				],
			}),
		);
		const states = await service.fetchWorkflowStates("any-team-id");
		expect(states.nodes[0]).toMatchObject({
			id: "s1",
			name: "In Review",
			type: "started",
		});
	});

	it("throws a descriptive error on non-2xx", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "not found" }, 404));
		await expect(service.fetchIssue("nope")).rejects.toThrow(/404/);
	});

	it("unimplemented methods throw not-implemented", async () => {
		await expect(service.fetchTeams()).rejects.toThrow(/not implemented/i);
	});
});

describe("createAgentActivity", () => {
	let sdkMock: {
		agentRuns: {
			activities: { create: ReturnType<typeof vi.fn> };
			retrieve: ReturnType<typeof vi.fn>;
			create: ReturnType<typeof vi.fn>;
		};
	};
	let service: PlaneIssueTrackerService;

	beforeEach(() => {
		vi.useFakeTimers();
		sdkMock = {
			agentRuns: {
				activities: { create: vi.fn().mockResolvedValue({ id: "act-1" }) },
				retrieve: vi.fn(),
				create: vi.fn(),
			},
		};
		service = new PlaneIssueTrackerService(CONFIG, sdkMock as any);
	});
	afterEach(() => vi.useRealTimers());

	it("maps thought to an ephemeral activity with signal continue", async () => {
		const result = await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "thought", body: "planning" },
		});
		expect(result.success).toBe(true);
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledWith(
			"quantum",
			"run-1",
			{
				type: "thought",
				content: { type: "thought", body: "planning" },
				ephemeral: true,
				signal: "continue",
			},
		);
	});

	it("maps a final response with signal stop, non-ephemeral", async () => {
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "response", body: "done" },
			signal: "stop",
		});
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledWith(
			"quantum",
			"run-1",
			{
				type: "response",
				content: { type: "response", body: "done" },
				ephemeral: false,
				signal: "stop",
			},
		);
	});

	it("maps elicitation to signal select", async () => {
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "elicitation", body: "which repo?" },
		});
		expect(sdkMock.agentRuns.activities.create.mock.calls[0][2].signal).toBe(
			"select",
		);
	});

	it("coalesces rapid ephemeral activities (rate limit: 60 req/min)", async () => {
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "thought", body: "one" },
		});
		// within the 2s window: queued, not sent
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "thought", body: "two" },
		});
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "thought", body: "three" },
		});
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2100);
		// only the latest queued ephemeral goes out
		expect(sdkMock.agentRuns.activities.create).toHaveBeenCalledTimes(2);
		expect(
			sdkMock.agentRuns.activities.create.mock.calls[1][2].content.body,
		).toBe("three");
	});

	it("non-ephemeral activities are never dropped by the throttle", async () => {
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "thought", body: "one" },
		});
		await service.createAgentActivity({
			agentSessionId: "run-1",
			content: { type: "response", body: "done" },
			signal: "stop",
		});
		await vi.advanceTimersByTimeAsync(2100);
		const sentTypes = sdkMock.agentRuns.activities.create.mock.calls.map(
			(call) => call[2].type,
		);
		expect(sentTypes).toContain("response");
	});
});
