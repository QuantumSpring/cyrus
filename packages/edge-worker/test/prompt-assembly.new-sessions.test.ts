/**
 * Prompt Assembly Tests - New Sessions
 *
 * Tests prompt assembly for new (initial) sessions with full issue context.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { createTestWorker, scenario } from "./prompt-assembly-utils.js";

describe("Prompt Assembly - New Sessions", () => {
	it("assignment-based (no labels) - should have system prompt with shared instructions", async () => {
		const worker = createTestWorker();

		// Create minimal test data
		const session = {
			issueId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
			workspace: { path: "/test" },
			metadata: {},
		};

		const issue = {
			id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
			identifier: "CEE-123",
			title: "Fix authentication bug",
			description: "Users cannot log in",
		};

		const repository = {
			id: "repo-uuid-1234-5678-90ab-cdef12345678",
			path: "/test/repo",
		};

		await scenario(worker)
			.newSession()
			.assignmentBased()
			.withSession(session)
			.withIssue(issue)
			.withRepository(repository)
			.withUserComment("")
			.withLabels()
			.expectUserPrompt(`<context>
  <repository>undefined</repository>
  <working_directory>/test/repo</working_directory>
  <base_branch>main</base_branch>
</context>

<linear_issue>
  <id>a1b2c3d4-e5f6-7890-abcd-ef1234567890</id>
  <identifier>CEE-123</identifier>
  <title>Fix authentication bug</title>
  <description>
Users cannot log in
  </description>
  <state>Unknown</state>
  <priority>None</priority>
  <url></url>
  <assignee>
    <linear_display_name></linear_display_name>
    <linear_profile_url></linear_profile_url>
    <github_username></github_username>
    <github_user_id></github_user_id>
    <github_noreply_email></github_noreply_email>
  </assignee>
</linear_issue>

<linear_comments>
No comments yet.
</linear_comments>`)
			.expectSystemPrompt(`<task_management_instructions>
CRITICAL: You MUST use the TodoWrite and TodoRead tools extensively:
- IMMEDIATELY create a comprehensive task list at the beginning of your work
- Break down complex tasks into smaller, actionable items
- Mark tasks as 'in_progress' when you start them
- Mark tasks as 'completed' immediately after finishing them
- Only have ONE task 'in_progress' at a time
- Add new tasks as you discover them during your work
- Your first response should focus on creating a thorough task breakdown

Remember: Your first message is internal planning. Use this time to:
1. Thoroughly analyze the issue and requirements
2. Create detailed todos using TodoWrite
3. Plan your approach systematically
</task_management_instructions>`)
			.expectPromptType("fallback")
			.expectComponents("issue-context")
			.verify();
	});

	it("assignment-based (with user comment) - should include user comment in XML wrapper", async () => {
		const worker = createTestWorker();

		// Create minimal test data
		const session = {
			issueId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
			workspace: { path: "/test" },
			metadata: {},
		};

		const issue = {
			id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
			identifier: "CEE-456",
			title: "Implement new feature",
			description: "Add payment processing",
		};

		const repository = {
			id: "repo-uuid-2345-6789-01bc-def123456789",
			path: "/test/repo",
		};

		await scenario(worker)
			.newSession()
			.assignmentBased()
			.withSession(session)
			.withIssue(issue)
			.withRepository(repository)
			.withUserComment("Please add Stripe integration")
			.withLabels()
			.expectUserPrompt(`<context>
  <repository>undefined</repository>
  <working_directory>/test/repo</working_directory>
  <base_branch>main</base_branch>
</context>

<linear_issue>
  <id>b2c3d4e5-f6a7-8901-bcde-f12345678901</id>
  <identifier>CEE-456</identifier>
  <title>Implement new feature</title>
  <description>
Add payment processing
  </description>
  <state>Unknown</state>
  <priority>None</priority>
  <url></url>
  <assignee>
    <linear_display_name></linear_display_name>
    <linear_profile_url></linear_profile_url>
    <github_username></github_username>
    <github_user_id></github_user_id>
    <github_noreply_email></github_noreply_email>
  </assignee>
</linear_issue>

<linear_comments>
No comments yet.
</linear_comments>

<user_comment>
Please add Stripe integration
</user_comment>`)
			.expectSystemPrompt(`<task_management_instructions>
CRITICAL: You MUST use the TodoWrite and TodoRead tools extensively:
- IMMEDIATELY create a comprehensive task list at the beginning of your work
- Break down complex tasks into smaller, actionable items
- Mark tasks as 'in_progress' when you start them
- Mark tasks as 'completed' immediately after finishing them
- Only have ONE task 'in_progress' at a time
- Add new tasks as you discover them during your work
- Your first response should focus on creating a thorough task breakdown

Remember: Your first message is internal planning. Use this time to:
1. Thoroughly analyze the issue and requirements
2. Create detailed todos using TodoWrite
3. Plan your approach systematically
</task_management_instructions>`)
			.expectPromptType("fallback")
			.expectComponents("issue-context", "user-comment")
			.verify();
	});

	it("assignment-based with PM persona - should use deterministic PM system prompt, strip #pm tag, and load pm-analysis subroutine", async () => {
		const worker = createTestWorker();
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = dirname(__filename);
		const pmAnalysisSubroutinePrompt = readFileSync(
			join(__dirname, "..", "src", "prompts", "subroutines", "pm-analysis.md"),
			"utf-8",
		);

		// Session includes procedure metadata as it would after initializeProcedureMetadata
		// sets up the pm-analysis procedure (currentSubroutineIndex: 0 = pm-analysis subroutine)
		const session = {
			issueId: "c3d4e5f6-a7b8-9012-cdef-123456789012",
			workspace: { path: "/test" },
			metadata: {
				persona: "pm",
				procedure: {
					procedureName: "pm-analysis",
					currentSubroutineIndex: 0,
					subroutineHistory: [],
				},
			},
		};

		const issue = {
			id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
			identifier: "CEE-789",
			title: "Plan migration",
			description: "Migrate payment provider",
		};

		const repository = {
			id: "repo-uuid-3456-7890-12cd-ef1234567890",
			path: "/test/repo",
		};

		await scenario(worker)
			.newSession()
			.assignmentBased()
			.withSession(session)
			.withIssue(issue)
			.withRepository(repository)
			.withUserComment("#pm Please create a migration plan")
			.withLabels()
			.expectUserPrompt(`<context>
  <repository>undefined</repository>
  <working_directory>/test/repo</working_directory>
  <base_branch>main</base_branch>
</context>

<linear_issue>
  <id>c3d4e5f6-a7b8-9012-cdef-123456789012</id>
  <identifier>CEE-789</identifier>
  <title>Plan migration</title>
  <description>
Migrate payment provider
  </description>
  <state>Unknown</state>
  <priority>None</priority>
  <url></url>
  <assignee>
    <linear_display_name></linear_display_name>
    <linear_profile_url></linear_profile_url>
    <github_username></github_username>
    <github_user_id></github_user_id>
    <github_noreply_email></github_noreply_email>
  </assignee>
</linear_issue>

<linear_comments>
No comments yet.
</linear_comments>

${pmAnalysisSubroutinePrompt}

<user_comment>
Please create a migration plan
</user_comment>`)
			.expectSystemPrompt(`You are in deterministic PM mode.
Follow only the active PM subroutine instructions.
Do not implement code, edit files, run commands, or create PRs.
Return analysis output only.`)
			.expectPromptType("fallback")
			.expectComponents("issue-context", "subroutine-prompt", "user-comment")
			.verify();
	});

	it("assignment-based with plan persona - should use deterministic plan system prompt, strip #plan tag, and load preparation subroutine", async () => {
		const worker = createTestWorker();
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = dirname(__filename);
		const preparationSubroutinePrompt = readFileSync(
			join(__dirname, "..", "src", "prompts", "subroutines", "preparation.md"),
			"utf-8",
		);

		const session = {
			issueId: "c3d4e5f6-a7b8-9012-cdef-123456789013",
			workspace: { path: "/test" },
			metadata: {
				persona: "plan",
				procedure: {
					procedureName: "plan-mode",
					currentSubroutineIndex: 0,
					subroutineHistory: [],
				},
			},
		};

		const issue = {
			id: "c3d4e5f6-a7b8-9012-cdef-123456789013",
			identifier: "CEE-790",
			title: "Plan auth refactor",
			description: "Refactor auth pipeline safely",
		};

		const repository = {
			id: "repo-uuid-3456-7890-12cd-ef1234567891",
			path: "/test/repo",
		};

		await scenario(worker)
			.newSession()
			.assignmentBased()
			.withSession(session)
			.withIssue(issue)
			.withRepository(repository)
			.withUserComment("#plan Please create an implementation plan")
			.withLabels()
			.expectUserPrompt(`<context>
  <repository>undefined</repository>
  <working_directory>/test/repo</working_directory>
  <base_branch>main</base_branch>
</context>

<linear_issue>
  <id>c3d4e5f6-a7b8-9012-cdef-123456789013</id>
  <identifier>CEE-790</identifier>
  <title>Plan auth refactor</title>
  <description>
Refactor auth pipeline safely
  </description>
  <state>Unknown</state>
  <priority>None</priority>
  <url></url>
  <assignee>
    <linear_display_name></linear_display_name>
    <linear_profile_url></linear_profile_url>
    <github_username></github_username>
    <github_user_id></github_user_id>
    <github_noreply_email></github_noreply_email>
  </assignee>
</linear_issue>

<linear_comments>
No comments yet.
</linear_comments>

${preparationSubroutinePrompt}

<user_comment>
Please create an implementation plan
</user_comment>`)
			.expectSystemPrompt(`You are in deterministic coding plan mode.
Follow only the active planning subroutine instructions.
Do not implement code, edit files, run commands, or create PRs.
Return implementation plan output only.`)
			.expectPromptType("fallback")
			.expectComponents("issue-context", "subroutine-prompt", "user-comment")
			.verify();
	});
});
