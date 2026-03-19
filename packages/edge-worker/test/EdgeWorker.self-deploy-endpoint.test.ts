import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeWorker } from "../src/EdgeWorker.js";
import type { EdgeWorkerConfig, RepositoryConfig } from "../src/types.js";

// Mock fs/promises
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
	rename: vi.fn(),
	readdir: vi.fn().mockResolvedValue([]),
}));

// Mock dependencies
vi.mock("cyrus-claude-runner");
vi.mock("cyrus-codex-runner");
vi.mock("cyrus-gemini-runner");
vi.mock("cyrus-linear-event-transport");
vi.mock("@linear/sdk");
vi.mock("../src/SharedApplicationServer.js", () => ({
	SharedApplicationServer: vi.fn().mockImplementation(() => ({
		initializeFastify: vi.fn(),
		getFastifyInstance: vi.fn().mockReturnValue({
			get: vi.fn(),
			post: vi.fn(),
		}),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		getWebhookUrl: vi.fn().mockReturnValue("http://localhost:3456/webhook"),
	})),
}));
vi.mock("../src/AgentSessionManager.js", () => ({
	AgentSessionManager: vi.fn().mockImplementation(() => ({
		getAllAgentRunners: vi.fn().mockReturnValue([]),
		getAllSessions: vi.fn().mockReturnValue([]),
		createLinearAgentSession: vi.fn(),
		getSession: vi.fn(),
		getActiveSessionsByIssueId: vi.fn().mockReturnValue([]),
		on: vi.fn(),
		emit: vi.fn(),
	})),
}));
vi.mock("cyrus-core", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		isAgentSessionCreatedWebhook: vi.fn().mockReturnValue(false),
		isAgentSessionPromptedWebhook: vi.fn().mockReturnValue(false),
		isIssueAssignedWebhook: vi.fn().mockReturnValue(false),
		isIssueCommentMentionWebhook: vi.fn().mockReturnValue(false),
		isIssueNewCommentWebhook: vi.fn().mockReturnValue(false),
		isIssueUnassignedWebhook: vi.fn().mockReturnValue(false),
		PersistenceManager: vi.fn().mockImplementation(() => ({
			loadEdgeWorkerState: vi.fn().mockResolvedValue(null),
			saveEdgeWorkerState: vi.fn().mockResolvedValue(undefined),
		})),
	};
});
vi.mock("file-type");
vi.mock("chokidar", () => ({
	watch: vi.fn().mockReturnValue({
		on: vi.fn().mockReturnThis(),
		close: vi.fn().mockResolvedValue(undefined),
	}),
}));

describe("EdgeWorker - Self Deploy Endpoint", () => {
	let edgeWorker: EdgeWorker;
	let mockConfig: EdgeWorkerConfig;

	const mockRepository: RepositoryConfig = {
		id: "test-repo",
		name: "Test Repo",
		repositoryPath: "/test/repo",
		workspaceBaseDir: "/test/workspaces",
		baseBranch: "main",
		linearToken: "test-token",
		linearWorkspaceId: "test-workspace",
		isActive: true,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.GITHUB_DEPLOY_WEBHOOK_SECRET = "test-self-deploy-secret";
		delete process.env.GITHUB_DEPLOY_BRANCH;

		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});

		mockConfig = {
			platform: "linear",
			cyrusHome: "/test/.cyrus",
			repositories: [mockRepository],
		};
	});

	afterEach(async () => {
		delete process.env.GITHUB_DEPLOY_WEBHOOK_SECRET;
		delete process.env.GITHUB_DEPLOY_BRANCH;
		if (edgeWorker) {
			try {
				await edgeWorker.stop();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	it("registers POST /api/self-deploy when webhook secret is configured", async () => {
		const mockPost = vi.fn();
		const mockFastify = {
			get: vi.fn(),
			post: mockPost,
		};

		const { SharedApplicationServer } = await import(
			"../src/SharedApplicationServer.js"
		);
		vi.mocked(SharedApplicationServer).mockImplementation(
			() =>
				({
					initializeFastify: vi.fn(),
					getFastifyInstance: vi.fn().mockReturnValue(mockFastify),
					start: vi.fn().mockResolvedValue(undefined),
					stop: vi.fn().mockResolvedValue(undefined),
					getWebhookUrl: vi
						.fn()
						.mockReturnValue("http://localhost:3456/webhook"),
				}) as any,
		);

		edgeWorker = new EdgeWorker(mockConfig);
		(edgeWorker as any).registerSelfDeployEndpoint();

		expect(mockPost).toHaveBeenCalledWith(
			"/api/self-deploy",
			expect.any(Function),
		);
	});

	it("returns ping acknowledgment for GitHub ping events", async () => {
		let capturedHandler: any = null;
		const mockPost = vi.fn((path: string, handler: any) => {
			if (path === "/api/self-deploy") {
				capturedHandler = handler;
			}
		});
		const mockFastify = {
			get: vi.fn(),
			post: mockPost,
		};

		const { SharedApplicationServer } = await import(
			"../src/SharedApplicationServer.js"
		);
		vi.mocked(SharedApplicationServer).mockImplementation(
			() =>
				({
					initializeFastify: vi.fn(),
					getFastifyInstance: vi.fn().mockReturnValue(mockFastify),
					start: vi.fn().mockResolvedValue(undefined),
					stop: vi.fn().mockResolvedValue(undefined),
					getWebhookUrl: vi
						.fn()
						.mockReturnValue("http://localhost:3456/webhook"),
				}) as any,
		);

		edgeWorker = new EdgeWorker(mockConfig);
		(edgeWorker as any).registerSelfDeployEndpoint();

		const rawBody = '{"zen":"pong"}';
		const secret = process.env.GITHUB_DEPLOY_WEBHOOK_SECRET!;
		const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

		const mockReply = {
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		};

		await capturedHandler(
			{
				rawBody,
				headers: {
					"x-hub-signature-256": signature,
					"x-github-event": "ping",
				},
				body: { zen: "pong" },
			},
			mockReply,
		);

		expect(mockReply.status).toHaveBeenCalledWith(200);
		expect(mockReply.send).toHaveBeenCalledWith({ ok: true, event: "ping" });
	});

	it("returns skipped=true for non-push events", async () => {
		let capturedHandler: any = null;
		const mockPost = vi.fn((path: string, handler: any) => {
			if (path === "/api/self-deploy") {
				capturedHandler = handler;
			}
		});
		const mockFastify = {
			get: vi.fn(),
			post: mockPost,
		};

		const { SharedApplicationServer } = await import(
			"../src/SharedApplicationServer.js"
		);
		vi.mocked(SharedApplicationServer).mockImplementation(
			() =>
				({
					initializeFastify: vi.fn(),
					getFastifyInstance: vi.fn().mockReturnValue(mockFastify),
					start: vi.fn().mockResolvedValue(undefined),
					stop: vi.fn().mockResolvedValue(undefined),
					getWebhookUrl: vi
						.fn()
						.mockReturnValue("http://localhost:3456/webhook"),
				}) as any,
		);

		edgeWorker = new EdgeWorker(mockConfig);
		(edgeWorker as any).registerSelfDeployEndpoint();

		const rawBody = '{"action":"opened"}';
		const secret = process.env.GITHUB_DEPLOY_WEBHOOK_SECRET!;
		const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

		const mockReply = {
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		};

		await capturedHandler(
			{
				rawBody,
				headers: {
					"x-hub-signature-256": signature,
					"x-github-event": "pull_request",
				},
				body: { action: "opened" },
			},
			mockReply,
		);

		expect(mockReply.status).toHaveBeenCalledWith(200);
		expect(mockReply.send).toHaveBeenCalledWith({ skipped: true });
	});

	it("returns 401 for invalid signature", async () => {
		let capturedHandler: any = null;
		const mockPost = vi.fn((path: string, handler: any) => {
			if (path === "/api/self-deploy") {
				capturedHandler = handler;
			}
		});
		const mockFastify = {
			get: vi.fn(),
			post: mockPost,
		};

		const { SharedApplicationServer } = await import(
			"../src/SharedApplicationServer.js"
		);
		vi.mocked(SharedApplicationServer).mockImplementation(
			() =>
				({
					initializeFastify: vi.fn(),
					getFastifyInstance: vi.fn().mockReturnValue(mockFastify),
					start: vi.fn().mockResolvedValue(undefined),
					stop: vi.fn().mockResolvedValue(undefined),
					getWebhookUrl: vi
						.fn()
						.mockReturnValue("http://localhost:3456/webhook"),
				}) as any,
		);

		edgeWorker = new EdgeWorker(mockConfig);
		(edgeWorker as any).registerSelfDeployEndpoint();

		const mockReply = {
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		};

		await capturedHandler(
			{
				rawBody: '{"ref":"refs/heads/main"}',
				headers: {
					"x-hub-signature-256": "sha256=bad",
					"x-github-event": "push",
				},
				body: { ref: "refs/heads/main" },
			},
			mockReply,
		);

		expect(mockReply.status).toHaveBeenCalledWith(401);
		expect(mockReply.send).toHaveBeenCalledWith({ error: "Invalid signature" });
	});
});
