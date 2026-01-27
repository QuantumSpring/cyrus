# Cyrus Workflow: End-to-End Process

This document explains the complete lifecycle of how Cyrus processes Linear issues, from initial assignment through to completion.

---

## Table of Contents

1. [How to Trigger Cyrus](#1-how-to-trigger-cyrus)
2. [Repository Configuration](#2-repository-configuration--cloning)
3. [Repository Routing](#3-repository-routing)
4. [Git Worktree Creation](#4-git-worktree-creation)
5. [Session Initialization](#5-session-initialization--ai-routing)
6. [Claude Runner Execution](#6-claude-runner-execution)
7. [Conversation Continuity](#7-conversation-continuity--artifacts)
8. [Mid-Implementation Prompting](#8-mid-implementation-prompting)
9. [Validation Loops](#9-validation-loops)
10. [Completion & Cleanup](#10-completion--cleanup)
11. [Full Lifecycle Visualization](#11-full-lifecycle-visualization)

---

## 1. How to Trigger Cyrus

There are **two ways** to trigger Cyrus on a Linear issue:

### A. Delegation (Recommended)
- In Linear, **assign the issue to Cyrus** (the bot user)
- This is the primary workflow and automatically applies **label-based routing**
- Triggers `AgentSessionCreated` webhook with full procedure system

### B. @Mention
- In a Linear comment, **@mention the Cyrus bot**
- More conversational mode, skips label-based system prompts by default
- Use `/label-based-prompt` command to explicitly enable label routing
- Useful for follow-up questions or quick interactions

---

## 2. Repository Configuration & Cloning

### Where Repositories Live

Cyrus **DOES NOT clone repositories** each time. Instead:

1. **Configuration File**: `~/.cyrus/config.json` defines all repositories
2. **Repository Path**: Each repo has a `repositoryPath` pointing to an **existing local clone**
3. **One-Time Setup**: You manually clone the repository once

**Example Configuration**:
```json
{
  "repositories": [{
    "id": "my-app",
    "name": "My Application",
    "repositoryPath": "/home/user/repos/my-app",  // Must exist!
    "baseBranch": "main",
    "workspaceBaseDir": "/home/user/repos/my-app/worktrees",
    "linearWorkspaceId": "abc-123",
    "linearToken": "lin_api_...",
    "teamKeys": ["BACKEND"],
    "routingLabels": ["api", "backend"]
  }]
}
```

### Initial Setup Steps

1. **Manually clone** the repository:
   ```bash
   git clone https://github.com/org/repo.git /path/to/repo
   ```

2. **Configure in Cyrus**:
   - Use `cyrus self-add-repo` command for self-hosted
   - Or managed automatically for hosted Cyrus

3. **Cyrus maintains the clone**:
   - Runs `git fetch origin` before creating worktrees
   - Keeps repository up-to-date automatically
   - Never modifies the main repository files directly

---

## 3. Repository Routing

When a Linear webhook arrives, Cyrus determines which repository should handle the issue using a **priority-based routing system**.

### Routing Priority Order

1. **Priority 0: Existing Active Session** - If issue already has a session, reuse that repository
2. **Priority 1: Description Tag** - Explicit `[repo=my-app]` in issue description
3. **Priority 2: Routing Labels** - Issue labels matching `routingLabels` config
4. **Priority 3: Project-Based** - Issue project matching `projectKeys` config
5. **Priority 4: Team-Based** - Issue team matching `teamKeys` config
6. **Priority 5: Catch-All** - First configured repository for the workspace

### Example Configuration

```json
{
  "repositories": [
    {
      "id": "backend-api",
      "name": "Backend API",
      "routingLabels": ["backend", "api"],  // Match these labels
      "projectKeys": ["API Service"],       // Or these projects
      "teamKeys": ["BACKEND"]               // Or this team
    },
    {
      "id": "frontend-app",
      "name": "Frontend App",
      "routingLabels": ["frontend", "ui"],
      "teamKeys": ["FRONTEND"]
    }
  ]
}
```

### User Selection Flow

If no routing match is found:
1. Cyrus posts a **Linear "select signal"** with repository options
2. User chooses from dropdown in Linear
3. Selection triggers `agentSessionPrompted` webhook
4. Session starts with selected repository

### Issue-to-Repository Cache

Once a repository is selected for an issue:
- Mapping cached in `~/.cyrus/state/edge-worker-state.json`
- Future prompts on same issue automatically use cached repository
- Cache persists across Cyrus restarts
- Prevents re-routing during active work

---

## 4. Git Worktree Creation

### Why Worktrees?

Each issue gets a **completely isolated workspace** to enable:
- Concurrent work on multiple issues without conflicts
- Clean separation per issue
- Independent branch management
- Safe testing without affecting other work

### Worktree Creation Process

```bash
# Main repository at:
/home/user/repos/my-app/

# When issue DEF-123 is assigned:
# 1. Fetch latest from remote
git fetch origin

# 2. Create isolated worktree
git worktree add \
  /home/user/repos/my-app/worktrees/DEF-123 \  # Workspace path
  -b DEF-123-fix-login-bug \                    # New branch name
  origin/main                                    # Base branch

# Directory structure:
/home/user/repos/my-app/
├── .git/              # Shared git metadata
├── src/               # Main repo files
├── worktrees/
│   ├── DEF-123/       # Issue-specific workspace
│   │   ├── src/       # Full repo copy on its own branch
│   │   └── ...
│   └── DEF-124/       # Another issue's workspace
```

### Key Features

**Branch Naming**:
- Uses Linear's preferred branch name if available
- Otherwise generates: `{identifier}-{title}` (sanitized, max 30 chars)
- Example: `DEF-123-fix-login-bug`

**Parent Issue Support**:
- If issue has a parent, uses parent's branch as base instead of `main`
- Enables sub-issue workflows
- Falls back to default base branch if parent branch doesn't exist

**Branch Reuse**:
- If branch already exists locally or remotely, reuses it
- No duplicate branch creation
- Resumes work on existing branches

**Setup Scripts**:
- Automatically runs `cyrus-setup.sh` if present in repository root
- Use for: dependency installation, database setup, environment configuration
- Also supports global setup script via `global_setup_script` config
- Script receives environment variables: `LINEAR_ISSUE_ID`, `LINEAR_ISSUE_IDENTIFIER`, `LINEAR_ISSUE_TITLE`
- 5-minute timeout, execution continues if script fails

---

## 5. Session Initialization & AI Routing

### Procedure Selection

Cyrus uses **AI classification** to determine the optimal workflow:

```typescript
// AI analyzes issue title + description
const classification = await analyzeIssue(issue);

// Selects procedure based on classification
const procedures = {
  "code":          "full-development",      // Feature/bug → code → tests → PR
  "question":      "simple-question",       // Q&A without code changes
  "documentation": "documentation-edit",    // Doc updates
  "debugger":      "debugger-full",        // Systematic bug investigation
  "orchestrator":  "orchestrator-full",    // Decompose & delegate sub-issues
  "user-testing":  "user-testing",         // Manual testing guidance
  "release":       "release",              // Release coordination
  "planning":      "plan-mode",            // Clarification before execution
};
```

### Label Overrides

Labels can override AI routing:
- `Bug` label → `debugger-full` (skip AI routing)
- `Orchestrator` label → `orchestrator-full`
- Custom labels via `labelPrompts` config

### Subroutine Execution

Each procedure contains **subroutines** executed sequentially:

**Example: `full-development` Procedure**
```
1. coding-activity     → Implement feature/fix
2. verifications       → Run tests, linting (with validation loop)
3. changelog-update    → Update CHANGELOG.md
4. git-commit          → Commit changes
5. gh-pr               → Create GitHub pull request
6. concise-summary     → Post final summary to Linear
```

**Example: `debugger-full` Procedure**
```
1. debugger-reproduction → Reproduce the bug
2. debugger-fix          → Implement fix
3. verifications         → Verify fix with tests
4. changelog-update      → Document fix
5. git-commit            → Commit changes
6. gh-pr                 → Create PR
7. concise-summary       → Post summary
```

### Subroutine Features

Each subroutine can have special properties:
- `singleTurn: true` - Run with `maxTurns: 1` for quick operations
- `requiresApproval: true` - Wait for user approval before proceeding
- `skipLinearPost: true` - Don't post activities to Linear
- `suppressThoughtPosting: true` - Only post final summary
- `disallowAllTools: true` - Text-only mode (no tool execution)
- `disallowedTools: [...]` - Block specific tools
- `usesValidationLoop: true` - Enable automatic retry on failures

---

## 6. Claude Runner Execution

### ClaudeRunner Initialization

```typescript
const runner = new ClaudeRunner({
  workspace: "/home/user/repos/my-app/worktrees/DEF-123",
  cyrusHome: "~/.cyrus",
  allowedTools: ["Read(**)", "Edit(**)", "Bash(git:*)", "Task"],
  systemPrompt: labelBasedPrompt || subroutinePrompt,
  mcpConfigPaths: [".mcp.json"],  // Auto-loaded from repo
  linearToken: "lin_api_...",      // Auto-configures Linear MCP
});

await runner.startStreaming();  // Streaming mode for mid-session prompts
```

### Key Features

**Streaming Prompts**:
- User can add comments while Claude is working
- Comments queued and delivered in real-time
- Enables mid-implementation guidance

**MCP Server Integration**:
- Auto-loads `.mcp.json` from repository
- Linear MCP automatically configured with OAuth token
- Supports multiple MCP config files (composed together)
- Tools accessible via `mcp__servername__toolname` pattern

**Environment Variables**:
- Loads `.env` from repository before session starts
- Existing `process.env` variables take precedence
- Secrets and configuration available to Claude

**Session Logging**:
- Complete conversation saved to `~/.cyrus/logs/<workspace>/<session-id>.jsonl`
- Human-readable markdown version also generated
- Version tracking for Claude models used

**Tool Permissions**:
- Dynamic tool filtering based on prompt type (debugger/builder/scoper)
- Subroutine-level tool restrictions
- AskUserQuestion tool intercepted for Linear UI integration

---

## 7. Conversation Continuity & Artifacts

### Where Conversations Are Preserved

#### A. Linear Activities (Live Streaming)

Every Claude message is posted to Linear immediately:
- **Thoughts**: `<text>` messages displayed as agent thoughts
- **Actions**: `<tool_use>` calls formatted as markdown code blocks
- **Results**: `<tool_result>` outputs (truncated if large)

Activities provide:
- Real-time visibility into agent progress
- Complete audit trail of all actions
- Context for user to provide feedback

#### B. Local Session Logs

```bash
~/.cyrus/logs/
└── DEF-123/
    ├── session-abc123-20260126-143022.jsonl  # Complete conversation
    ├── session-abc123-20260126-143022.md     # Human-readable markdown
    └── session-abc123-versions.txt           # Claude versions used
```

JSONL format contains:
- Full SDK message objects
- Timestamps for each message
- Token usage and costs
- Tool calls and results

#### C. Persistent State

```bash
~/.cyrus/state/
└── edge-worker-state.json  # Survives restarts
```

**State Contents**:
```json
{
  "agentSessions": {
    "my-app": {
      "session-abc123": {
        "linearAgentActivitySessionId": "session-abc123",
        "issueId": "def-123",
        "claudeSessionId": "c5c1fc00-...",  // For --continue flag
        "workspace": { "path": ".../worktrees/DEF-123" },
        "status": "active",
        "metadata": {
          "procedure": {
            "procedureName": "full-development",
            "currentSubroutineIndex": 2,
            "subroutineHistory": [
              {
                "subroutine": "coding-activity",
                "completedAt": 1706281234567,
                "claudeSessionId": "c5c1fc00-..."
              }
            ]
          },
          "totalCostUsd": 1.23
        }
      }
    }
  },
  "issueRepositoryCache": {
    "def-123": "my-app"  // Issue-to-repo mapping
  }
}
```

### Session Resumption

When transitioning between subroutines or continuing after user prompts:

```typescript
await runner.startStreaming({
  resumeSessionId: "c5c1fc00-...",  // Continues exact conversation
  initialPrompt: "Now run the verifications subroutine..."
});
```

**Conversation continuity maintained through**:
1. **Claude SDK session IDs** - Actual conversation memory
2. **Linear thread** - User sees entire history
3. **Persistent state** - Survives Cyrus restarts
4. **Session logs** - Complete audit trail

---

## 8. Mid-Implementation Prompting

### Real-Time Interaction Flow

```
User adds comment while Claude is active
   ↓
Linear sends agentSessionPrompted webhook
   ↓
EdgeWorker.addStreamMessage("Also add a modulo method")
   ↓
StreamingPrompt queue → Claude receives in next turn
   ↓
Claude incorporates feedback and continues
```

### Example Timeline

```
10:00 AM - User: "Add a calculator class"
10:01 AM - Claude: "Creating Calculator class with add/subtract..."
10:02 AM - User: "Also add multiply and divide"  ← Mid-session!
10:02 AM - Claude: "Adding multiply and divide methods..."
10:03 AM - Claude: "All methods implemented, running tests..."
```

### Technical Implementation

**StreamingPrompt Class**:
- Implements `AsyncIterable<SDKUserMessage>`
- Queue-based message handling
- Yields messages to Claude SDK as they arrive
- Supports both initial prompt and dynamic additions

**Webhook Handling**:
```typescript
// Branch 3: Normal prompt on existing session
if (existingSession && !isPendingSelection && !isStopSignal) {
  const repository = getCachedRepository(issueId);
  const runner = getAgentRunner(sessionId);

  // Add message to streaming prompt
  runner.addStreamMessage(commentBody);
}
```

### Use Cases

- **Clarification**: "Use TypeScript instead of JavaScript"
- **Additional Requirements**: "Also handle edge case X"
- **Direction Change**: "Actually, let's try approach Y instead"
- **Feedback**: "The tests are failing because..."

---

## 9. Validation Loops

For subroutines with `usesValidationLoop: true` (e.g., `verifications`):

### Validation Loop Flow

```typescript
// 1. Run tests
const result = await runVerifications();

// 2. Parse result (expects JSON with pass/reason)
if (result.pass === false) {
  // 3. Run fixer with failure context
  await runFixerSubroutine({
    prompt: `Previous verification failed:\n${result.reason}\n\nFix the issues.`
  });

  // 4. Re-run verifications
  iteration++;
  if (iteration < maxIterations) {
    goto step 1;
  }
}

// 5. Proceed to next subroutine
```

### Validation Result Format

Expected JSON output from verification subroutine:
```json
{
  "pass": true,
  "reason": "All tests passed successfully",
  "fixes": [],
  "nextSteps": ["Proceed to next subroutine"]
}
```

Or on failure:
```json
{
  "pass": false,
  "reason": "3 test failures in authentication module",
  "fixes": [
    "Fix login token validation",
    "Update session expiry handling"
  ],
  "nextSteps": ["Run validation-fixer subroutine"]
}
```

### Configuration

**Default Settings**:
- `maxIterations: 3` - Maximum retry attempts
- Fixer subroutine: `validation-fixer`
- After max iterations, proceeds anyway with warning

**Session Metadata Tracking**:
```typescript
session.metadata.procedure.validationLoop = {
  iteration: 2,
  inFixerMode: false,
  attempts: [
    { iteration: 1, pass: false, reason: "Tests failed", timestamp: 123456 },
    { iteration: 2, pass: false, reason: "Linting errors", timestamp: 123457 }
  ]
};
```

### Benefits

- **Automatic Recovery**: Common issues fixed without user intervention
- **Iterative Improvement**: Multiple passes to achieve passing tests
- **Context Preservation**: Fixer receives full failure context
- **Bounded Retry**: Prevents infinite loops with max iterations

---

## 10. Completion & Cleanup

### When Subroutines Complete

```typescript
// Final subroutine (e.g., concise-summary) posts to Linear
await postFinalSummary(session);

// Session marked as completed
session.status = "completed";
session.metadata.procedure.completedAt = Date.now();

// Persist final state
await persistenceManager.saveEdgeWorkerState(state);
```

### What Happens at Completion

**Git Changes**:
- Branch pushed to remote (if `git-commit` subroutine ran)
- All changes committed with Co-Authored-By attribution
- Clean commit history preserved

**Pull Request**:
- Created via GitHub CLI (if `gh-pr` subroutine ran)
- PR linked in Linear via final summary
- PR description includes issue context

**Linear Updates**:
- Final summary posted as agent activity
- Issue remains assigned to Cyrus (user can manually unassign)
- Complete activity log available in thread

**Worktree Status**:
- Worktree **remains** at `worktrees/DEF-123/` for inspection
- Branch available for further manual work
- Must be manually cleaned up when no longer needed

### Worktree Cleanup

**Manual Cleanup**:
```bash
# Remove specific worktree
git worktree remove worktrees/DEF-123

# Or prune all removed worktrees
git worktree prune

# List all worktrees
git worktree list
```

**Why Keep Worktrees**:
- Allows post-completion debugging
- Manual testing in isolated environment
- Additional commits if needed
- Review Claude's changes locally

### Session Logs Retention

All logs remain permanently:
```bash
~/.cyrus/logs/
└── DEF-123/
    ├── session-abc123-20260126-143022.jsonl
    ├── session-abc123-20260126-143022.md
    └── session-abc123-versions.txt
```

**Use Cases**:
- Debugging unexpected behavior
- Analyzing cost and token usage
- Understanding agent decision-making
- Training and improvement

---

## 11. Full Lifecycle Visualization

```
┌─────────────────────────────────────────────────────────────┐
│ 1. LINEAR: Assign issue DEF-123 to Cyrus                    │
│    Trigger: User delegates issue in Linear UI               │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. WEBHOOK: AgentSessionCreated received                    │
│    Linear → EdgeWorker.handleWebhook()                      │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. ROUTING: Match issue → repository                        │
│    Priority: labels > projects > teams > catch-all          │
│    Result: issueRepositoryCache["def-123"] = "my-app"       │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. GIT WORKTREE: Create isolated workspace                  │
│    $ git fetch origin                                        │
│    $ git worktree add worktrees/DEF-123 -b ... origin/main  │
│    $ bash cyrus-setup.sh (if exists)                         │
│    Workspace: /repos/my-app/worktrees/DEF-123               │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. AI ROUTING: Analyze issue → select procedure             │
│    Classification: "code" → Procedure: "full-development"   │
│    Alternative: Label override (Bug → debugger-full)        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. SESSION INIT: Create CyrusAgentSession                   │
│    - linearAgentActivitySessionId: "session-abc123"         │
│    - workspace: { path: "worktrees/DEF-123" }               │
│    - metadata.procedure.name: "full-development"            │
│    - metadata.procedure.currentSubroutineIndex: 0           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. CLAUDE RUNNER: Start first subroutine (coding-activity)  │
│    ClaudeRunner.startStreaming(prompt)                       │
│    - Load .mcp.json, .env from repository                    │
│    - Configure Linear MCP automatically                      │
│    - Execute in streaming mode (accepts mid-session prompts) │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. STREAMING: Claude works, user can prompt mid-session     │
│    - Every SDK message → Linear activity (thoughts/actions)  │
│    - User comments → StreamingPrompt queue                   │
│    - Logs: ~/.cyrus/logs/DEF-123/session-*.jsonl            │
│    - State: ~/.cyrus/state/edge-worker-state.json           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. SUBROUTINE COMPLETION: Advance to next                   │
│    Event: "subroutineComplete" → EdgeWorker.handleTransition│
│    Metadata: currentSubroutineIndex++ (0 → 1)               │
│    Next: "verifications" subroutine                          │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. VALIDATION LOOP (for verifications subroutine)          │
│     - Run tests → parse result JSON                          │
│     - If pass=false: run "validation-fixer" subroutine       │
│     - Re-run verifications (max 3 iterations)                │
│     - Continue to next subroutine when passed or max reached │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. REMAINING SUBROUTINES: changelog → git → gh-pr → summary│
│     - Update CHANGELOG.md with changes                       │
│     - Commit with Co-Authored-By: Claude Sonnet             │
│     - Create GitHub pull request                             │
│     - Post concise summary to Linear                         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 12. COMPLETION: Finalize session                            │
│     session.status = "completed"                             │
│     Persist state to ~/.cyrus/state/edge-worker-state.json  │
│     Worktree remains at worktrees/DEF-123/                   │
│     Branch pushed, PR created, Linear updated                │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Architecture Principles

### 1. No Repository Cloning
- Repositories cloned **once manually**
- Cyrus reuses and maintains them
- `git fetch` keeps repos up-to-date

### 2. Git Worktree Isolation
- Each issue = isolated workspace
- Format: `worktrees/ISSUE-ID/`
- Enables concurrent work without conflicts

### 3. Smart Routing
- Priority-based matching (labels > projects > teams)
- Issue-to-repository caching
- User selection when no match found

### 4. Conversation Preservation
- Linear activities (real-time streaming)
- Session logs (JSONL + markdown)
- Persistent state (survives restarts)

### 5. Streaming Architecture
- User can provide feedback mid-session
- Comments queued and delivered to Claude
- Real-time collaboration

### 6. Multi-Step Procedures
- Workflows composed of subroutines
- Sequential execution with transitions
- Context preserved across steps

### 7. Automatic Validation
- Validation loops for test/lint subroutines
- Fixer subroutine attempts repairs
- Bounded retries prevent infinite loops

### 8. Tool Integration
- MCP servers auto-loaded from `.mcp.json`
- Linear MCP configured automatically
- Dynamic tool filtering per subroutine

### 9. State Management
- Persistent state survives Cyrus restarts
- Issue-to-repo cache prevents re-routing
- Procedure metadata tracks progress

### 10. Distributed Work
- Multiple issues processed concurrently
- Per-repository session managers
- Independent worktrees prevent conflicts

---

## Summary

Cyrus provides a complete end-to-end workflow for AI-powered development:

✅ **Trigger**: Delegate issue or @mention in Linear
✅ **Route**: Intelligent repository matching with caching
✅ **Isolate**: Git worktrees for concurrent, conflict-free work
✅ **Execute**: Multi-step procedures with AI classification
✅ **Stream**: Real-time collaboration with mid-session prompts
✅ **Validate**: Automatic retry loops with specialized fixers
✅ **Persist**: Complete conversation history and state management
✅ **Integrate**: Linear activities, MCP servers, environment variables
✅ **Complete**: Git commits, PRs, and comprehensive summaries

This architecture enables seamless Linear ↔ AI development with full visibility, control, and collaboration! 🚀
