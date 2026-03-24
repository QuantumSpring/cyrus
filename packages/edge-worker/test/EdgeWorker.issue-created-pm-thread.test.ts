import { LinearClient } from "@linear/sdk";
import { createCyrusToolsServer } from "cyrus-mcp-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSessionManager } from "../src/AgentSessionManager.js";
import { EdgeWorker } from "../src/EdgeWorker.js";
import { SharedApplicationServer } from "../src/SharedApplicationServer.js";
import type { EdgeWorkerConfig, RepositoryConfig } from "../src/types.js";
import { TEST_CYRUS_HOME } from "./test-dirs.js";

vi.mock("cyrus-claude-runner");
vi.mock("cyrus-codex-runner");
vi.mock("cyrus-cursor-runner");
vi.mock("cyrus-gemini-runner");
vi.mock("@linear/sdk");
vi.mock("cyrus-mcp-tools");
vi.mock("../src/SharedApplicationServer.js");
vi.mock("../src/AgentSessionManager.js");
vi.mock("cyrus-core", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		PersistenceManager: vi.fn().mockImplementation(() => ({
			loadEdgeWorkerState: vi.fn().mockResolvedValue(null),
			saveEdgeWorkerState: vi.fn().mockResolvedValue(undefined),
		})),
	};
});

describe("EdgeWorker issue-created PM thread flow", () => {
	let edgeWorker: EdgeWorker;
	let mockConfig: EdgeWorkerConfig;
	let mockIssueTracker: any;

	const mockRepository: RepositoryConfig = {
		id: "test-repo",
		name: "Test Repo",
		repositoryPath: "/test/repo",
		workspaceBaseDir: "/test/workspaces",
		baseBranch: "main",
		linearToken: "test-token",
		linearWorkspaceId: "test-workspace",
		isActive: true,
		allowedTools: ["Read", "Edit"],
	};

	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(createCyrusToolsServer).mockReturnValue({} as any);

		vi.mocked(AgentSessionManager).mockImplementation(
			() =>
				({
					on: vi.fn(),
					getSessionsByIssueId: vi.fn().mockReturnValue([]),
					getActiveSessionsByIssueId: vi.fn().mockReturnValue([]),
				}) as any,
		);

		vi.mocked(SharedApplicationServer).mockImplementation(
			() =>
				({
					start: vi.fn().mockResolvedValue(undefined),
					stop: vi.fn().mockResolvedValue(undefined),
					getFastifyInstance: vi.fn().mockReturnValue({
						post: vi.fn(),
						get: vi.fn(),
						register: vi.fn(),
					}),
					getWebhookUrl: vi
						.fn()
						.mockReturnValue("http://localhost:3456/webhook"),
					registerOAuthCallbackHandler: vi.fn(),
				}) as any,
		);

		vi.mocked(LinearClient).mockImplementation(
			() =>
				({
					issue: vi.fn(),
					updateIssue: vi.fn().mockResolvedValue({ success: true }),
					createComment: vi.fn().mockResolvedValue({ success: true }),
					agentSessionCreateOnComment: vi.fn().mockResolvedValue({
						success: true,
					}),
				}) as any,
		);

		mockConfig = {
			proxyUrl: "http://localhost:3000",
			cyrusHome: TEST_CYRUS_HOME,
			repositories: [mockRepository],
			handlers: {
				createWorkspace: vi.fn().mockResolvedValue({
					path: "/test/workspaces/TEST-1",
					isGitWorktree: false,
				}),
			},
		};

		edgeWorker = new EdgeWorker(mockConfig);

		mockIssueTracker = {
			fetchIssue: vi.fn(),
			fetchTeam: vi.fn(),
			updateIssue: vi.fn().mockResolvedValue({}),
			createComment: vi.fn().mockResolvedValue({ id: "comment-123" }),
			createAgentSessionOnComment: vi.fn().mockResolvedValue({ success: true }),
		};

		(edgeWorker as any).issueTrackers.set("test-repo", mockIssueTracker);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createIssueCreatedWebhook(overrides: any = {}) {
		return {
			type: "Issue",
			action: "create",
			createdAt: new Date().toISOString(),
			organizationId: "test-workspace",
			data: {
				id: "issue-123",
				identifier: "TEST-123",
				title: "Test Issue",
				description: "Issue body",
				...overrides.data,
			},
			...overrides,
		};
	}

	it("assigns Product Owner and starts PM comment-thread session on issue create", async () => {
		const webhook = createIssueCreatedWebhook();
		const issue = {
			id: "issue-123",
			identifier: "TEST-123",
			description: "Issue body",
			project: Promise.resolve({
				description:
					"Project Overview\nProduct Owner: https://linear.app/linear/profiles/alice",
			}),
			team: Promise.resolve({ id: "team-123" }),
		} as any;

		mockIssueTracker.fetchIssue.mockResolvedValue(issue);
		mockIssueTracker.fetchTeam.mockResolvedValue({
			members: vi.fn().mockResolvedValue({
				nodes: [
					{
						id: "user-123",
						name: "Alice",
						displayName: "Alice",
						email: "alice@example.com",
						url: "https://linear.app/linear/profiles/alice",
					},
				],
			}),
		});

		vi.spyOn(
			(edgeWorker as any).repositoryRouter,
			"determineRepositoryForWebhook",
		).mockResolvedValue({
			type: "selected",
			repository: mockRepository,
			routingMethod: "team-based",
		});

		await (edgeWorker as any).handleIssueCreatedWebhook(webhook, [
			mockRepository,
		]);

		expect(mockIssueTracker.updateIssue).toHaveBeenCalledWith("issue-123", {
			assigneeId: "user-123",
		});
		expect(mockIssueTracker.createComment).toHaveBeenCalledWith(
			"issue-123",
			expect.objectContaining({
				body: expect.stringContaining("#pm"),
			}),
		);
		expect(mockIssueTracker.createComment).toHaveBeenCalledWith(
			"issue-123",
			expect.objectContaining({
				body: expect.stringContaining(
					"Product Owner: https://linear.app/linear/profiles/alice",
				),
			}),
		);
		expect(mockIssueTracker.createAgentSessionOnComment).toHaveBeenCalledWith({
			commentId: "comment-123",
		});
	});

	it("asks for Product Owner in thread when overview does not provide one", async () => {
		const webhook = createIssueCreatedWebhook();
		const issue = {
			id: "issue-123",
			identifier: "TEST-123",
			description: "Issue body",
			project: Promise.resolve({
				description: "Project Overview without owner",
			}),
			team: Promise.resolve({ id: "team-123" }),
		} as any;

		mockIssueTracker.fetchIssue.mockResolvedValue(issue);
		mockIssueTracker.fetchTeam.mockResolvedValue({
			members: vi.fn().mockResolvedValue({ nodes: [] }),
		});

		vi.spyOn(
			(edgeWorker as any).repositoryRouter,
			"determineRepositoryForWebhook",
		).mockResolvedValue({
			type: "selected",
			repository: mockRepository,
			routingMethod: "team-based",
		});

		await (edgeWorker as any).handleIssueCreatedWebhook(webhook, [
			mockRepository,
		]);

		expect(mockIssueTracker.updateIssue).not.toHaveBeenCalled();
		expect(mockIssueTracker.createComment).toHaveBeenCalledWith(
			"issue-123",
			expect.objectContaining({
				body: expect.stringContaining(
					"Product Owner could not be resolved from project overview.",
				),
			}),
		);
		expect(mockIssueTracker.createAgentSessionOnComment).toHaveBeenCalledWith({
			commentId: "comment-123",
		});
	});
});
