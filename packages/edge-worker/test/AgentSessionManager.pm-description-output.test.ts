import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSessionManager } from "../src/AgentSessionManager";
import type { IActivitySink } from "../src/sinks/IActivitySink";

describe("AgentSessionManager PM description output mode", () => {
	let manager: AgentSessionManager;
	let mockActivitySink: IActivitySink;
	const sessionId = "pm-session-1";

	beforeEach(() => {
		mockActivitySink = {
			id: "workspace-1",
			postActivity: vi.fn().mockResolvedValue({ activityId: "activity-1" }),
			createAgentSession: vi.fn().mockResolvedValue("session-1"),
		};

		const mockProcedureAnalyzer = {
			getNextSubroutine: vi.fn().mockReturnValue(null),
			getCurrentSubroutine: vi.fn().mockReturnValue(undefined),
			advanceToNextSubroutine: vi.fn(),
			getLastSubroutineResult: vi.fn().mockReturnValue(null),
		};

		manager = new AgentSessionManager(
			mockActivitySink,
			undefined,
			undefined,
			mockProcedureAnalyzer as any,
		);

		manager.createLinearAgentSession(
			sessionId,
			"issue-1",
			{
				id: "issue-1",
				identifier: "TEST-1",
				title: "PM output test",
				description: "Test issue",
				branchName: "test-1",
			},
			{
				path: "/tmp/workspace",
				isGitWorktree: false,
			},
		);
	});

	function buildSuccessResult(result: string) {
		return {
			type: "result",
			subtype: "success",
			duration_ms: 1,
			duration_api_ms: 1,
			is_error: false,
			num_turns: 1,
			result,
			stop_reason: null,
			total_cost_usd: 0,
			usage: {
				input_tokens: 1,
				output_tokens: 1,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				cache_creation: null,
			},
			modelUsage: {},
			permission_denials: [],
			uuid: "result-uuid",
			session_id: "runner-session-id",
		} as any;
	}

	it("suppresses final response activity when suppressFinalResponseComment is set", async () => {
		const session = manager.getSession(sessionId);
		expect(session).toBeDefined();
		if (!session) return;

		session.metadata = {
			...(session.metadata || {}),
			suppressFinalResponseComment: true,
		};

		await manager.completeSession(
			sessionId,
			buildSuccessResult("final output"),
		);

		expect(mockActivitySink.postActivity).not.toHaveBeenCalled();
		expect(session.metadata?.suppressFinalResponseComment).toBe(false);
	});

	it("posts final response activity when suppression flag is not set", async () => {
		await manager.completeSession(
			sessionId,
			buildSuccessResult("final output"),
		);

		expect(mockActivitySink.postActivity).toHaveBeenCalledWith(
			sessionId,
			{
				type: "response",
				body: "final output",
			},
			{},
		);
	});
});
