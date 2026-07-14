import { describe, expect, it } from "vitest";
import { PlaneWebhookTranslator } from "../src/PlaneWebhookTranslator.js";
import { createdWebhookFixture, promptedWebhookFixture } from "./fixtures.js";

describe("PlaneWebhookTranslator", () => {
	const translator = new PlaneWebhookTranslator();

	it("translates action=created into an AgentSessionEvent created webhook", () => {
		const event = translator.toAgentSessionEvent(createdWebhookFixture);
		expect(event.type).toBe("AgentSessionEvent");
		expect(event.action).toBe("created");
		expect(event.organizationId).toBe(createdWebhookFixture.data.workspace);
		expect(event.agentSession.id).toBe(createdWebhookFixture.data.id);
		expect(event.agentSession.issue.id).toBe(createdWebhookFixture.data.issue);
		expect(event.agentSession.issue.identifier).toBe("QS-42");
		expect(event.agentSession.issue.title).toBe("Fix failing test");
		expect(event.agentSession.issue.branchName).toMatch(/^qs-42/);
		expect(event.agentSession.comment?.body).toBe(
			"fix the failing test in packages/x",
		);
	});

	it("carries team key and labels for routing", () => {
		const event = translator.toAgentSessionEvent(createdWebhookFixture);
		expect(event.agentSession.issue.team?.key).toBe("QS");
		expect(event.agentSession.issue.labels).toEqual({ nodes: [] });
	});

	it("translates action=prompted into an AgentSessionEvent prompted webhook", () => {
		const event = translator.toAgentSessionEvent(promptedWebhookFixture);
		expect(event.action).toBe("prompted");
		expect(event.agentActivity?.content?.body).toBe("also update the README");
	});

	it("synthesizes issue prompt as comment body for assignment runs", () => {
		const assignment = {
			...createdWebhookFixture,
			data: {
				...createdWebhookFixture.data,
				type: "assignment" as const,
				source_comment_detail: null,
			},
		};
		const event = translator.toAgentSessionEvent(assignment);
		expect(event.agentSession.comment?.body).toBe(assignment.data.prompt);
	});
});
