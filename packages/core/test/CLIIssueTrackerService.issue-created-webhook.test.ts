import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "../src/issue-tracker/AgentEvent";
import { CLIIssueTrackerService } from "../src/issue-tracker/adapters/CLIIssueTrackerService";

describe("CLIIssueTrackerService - Issue created webhook emission", () => {
	let service: CLIIssueTrackerService;

	beforeEach(() => {
		service = new CLIIssueTrackerService();
		service.seedDefaultData();
	});

	it("emits an Issue/create webhook event when a ticket is created", async () => {
		const transport = service.createEventTransport({
			platform: "cli",
			fastifyServer: {} as FastifyInstance,
		});

		const events: AgentEvent[] = [];
		transport.on("event", (event) => {
			events.push(event);
		});

		const createdIssue = await service.createIssue({
			teamId: "team-default",
			title: "Test issue create webhook",
			description: "Created from CLI",
		});

		expect(events).toHaveLength(1);

		const event = events[0];
		expect(event).toMatchObject({
			type: "Issue",
			action: "create",
			organizationId: "cli-workspace",
			data: {
				id: createdIssue.id,
				identifier: createdIssue.identifier,
				title: createdIssue.title,
				description: createdIssue.description,
				teamId: "team-default",
				team: {
					key: "DEF",
				},
			},
		});
	});
});
