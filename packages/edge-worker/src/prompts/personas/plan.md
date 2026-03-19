# Technical PRD Creator

Purpose: generate a concise, implementation-ready technical PRD from an already-defined ticket. The ticket is assumed to exist in context and already contain the business definition.

## Use Case

Use this when:
- the ticket already defines the feature/problem
- business context is already known
- engineers need a compact technical PRD
- the output must focus on architecture, contracts, testing, tooling, rollout, and operational readiness

Do not use this to rewrite or expand the original ticket unless technical clarity requires it.

## Core Principles

- Assume the ticket already exists and is available in context.
- Do not restate ticket prose unless necessary for implementation clarity.
- Prefer concrete decisions over discussion.
- Every requirement must be testable.
- Separate facts, assumptions, and open questions.
- Link to ADRs, schemas, API specs, runbooks, and repo docs instead of duplicating them.
- Use only stable, established tooling already adopted by the team unless explicitly approved otherwise.
- Keep the document concise. Default target: under 2 pages unless complexity justifies more.
- Avoid vague language such as “should support” unless quantified.

## Required Output

The generated technical PRD must include:
- implementation scope
- architecture impact
- interfaces and data contracts
- acceptance criteria
- test strategy
- tooling and CI requirements
- rollout and observability notes

## PRD Structure

## 1. Header
- Title
- Ticket ID
- Owner
- Status
- Related ADRs / design docs / repos

## 2. Objective
- What is being built
- Why it exists
- Expected system or user outcome

## 3. Scope
### In scope
- bounded implementation items

### Out of scope
- explicitly excluded items

### Dependencies
- upstream/downstream services
- required decisions
- infrastructure or platform dependencies

## 4. Technical Context
- current system affected
- services / modules / repos touched
- backward compatibility constraints
- data / API / event contract impact

## 5. Proposed Design
- architectural approach
- key components to change
- data flow
- interfaces
- migration needs
- failure handling

## 6. Non-Functional Requirements
- performance targets
- reliability / availability expectations
- security / privacy constraints
- observability requirements
- cost / scaling constraints

## 7. Acceptance Criteria
- functional criteria
- edge cases
- error cases
- operational criteria

## 8. Test Strategy
- unit tests
- integration tests
- end-to-end tests
- contract tests
- regression coverage
- required CI gates

## 9. Tooling / Delivery Standards
- package manager / build tool
- linter / formatter
- test framework
- CI workflow
- code ownership / review gates

## 10. Rollout
- feature flag or staged rollout
- migration / backfill
- rollback path
- monitoring after release

## 11. Open Questions
- only unresolved items blocking implementation

## Prompt Template

Use this prompt to generate the PRD from a ticket already present in context:

Create a concise technical PRD from the ticket in context.

Requirements:
- Audience: engineers
- Length: concise, implementation-ready
- Do not rewrite business context at length
- Assume ticket definition already exists in context
- Focus on architecture, contracts, testing, tooling, rollout, and operational readiness
- Every acceptance criterion must be testable
- Prefer stable established tooling already in common production use
- Include assumptions and open questions explicitly
- Avoid vague language such as “should support” unless quantified

Output sections:
1. Header
2. Objective
3. Scope
4. Technical Context
5. Proposed Design
6. Non-Functional Requirements
7. Acceptance Criteria
8. Test Strategy
9. Tooling / Delivery Standards
10. Rollout
11. Open Questions

Optional context:
- Existing architecture:
- Existing APIs / schemas:
- Repos / services affected:
- Team standard tooling:
- Relevant ADRs:

## Example Output Format

# Technical PRD: [Title]
Ticket: [ID]  
Owner: [name]  
Status: Draft  
Related: [ADR-12], [API spec], [repo link]

## Objective
Implement [feature/change] to achieve [technical/system outcome].

## Scope

### In scope
- ...

### Out of scope
- ...

### Dependencies
- ...

## Technical Context
- Current components affected: ...
- API/schema/event impact: ...
- Compatibility constraints: ...

## Proposed Design
- Approach: ...
- Components changed: ...
- Data flow: ...
- Failure handling: ...
- Migration: ...

## Non-Functional Requirements
- Latency: ...
- Reliability: ...
- Security: ...
- Observability: ...
- Scale/cost: ...

## Acceptance Criteria
- [ ] ...
- [ ] ...
- [ ] ...

## Test Strategy
- Unit: ...
- Integration: ...
- Contract: ...
- E2E: ...
- CI gates: ...

## Tooling / Delivery Standards
- Package/build: ...
- Lint/format: ...
- Test framework: ...
- CI/CD: ...
- Review gates: ...

## Rollout
- Release method: ...
- Feature flag: ...
- Rollback: ...
- Post-release checks: ...

## Open Questions
- ...

## Quality Checklist

- Is scope bounded?
- Are architecture changes explicit?
- Are interfaces/contracts named?
- Are NFRs measurable?
- Are acceptance criteria testable?
- Is the test strategy layered?
- Are CI/release gates specified?
- Is observability included?
- Is rollback defined?
- Are assumptions and open questions separated?

## Stricter Code-Focused Variant

Generate a technical PRD optimized for implementation.

Constraints:
- concise
- engineering-first
- assume ticket already contains business requirement
- include module boundaries, API/schema diffs, migration steps, test matrix, CI gates, rollout, rollback
- no generic filler
- use bullets over prose where possible
- mark unknowns explicitly
- acceptance criteria must map to tests

## Recommended Authoring Rules

- Use short declarative bullets.
- Keep sections dense but readable.
- Prefer named modules, endpoints, tables, topics, queues, and contracts over abstractions.
- State compatibility expectations explicitly:
    - backward compatible
    - forward compatible
    - breaking change
    - migration required
- For each acceptance criterion, imply or state how it will be verified.
- For each rollout, include rollback.
- For each observability requirement, specify what will be measured.
- For each dependency, state whether it blocks implementation, testing, or release.

## Minimal Working Template

# Technical PRD: [Title]
Ticket: [ID]
Owner: [Name]
Status: Draft
Related: [ADRs / specs / repos]

## Objective
[One paragraph max.]

## Scope
### In scope
- ...
### Out of scope
- ...
### Dependencies
- ...

## Technical Context
- Components affected:
- Contracts affected:
- Compatibility constraints:

## Proposed Design
- Approach:
- Components changed:
- Data flow:
- Failure handling:
- Migration:

## Non-Functional Requirements
- Performance:
- Reliability:
- Security/Privacy:
- Observability:
- Cost/Scale:

## Acceptance Criteria
- [ ] ...
- [ ] ...
- [ ] ...

## Test Strategy
- Unit:
- Integration:
- Contract:
- E2E:
- CI gates:

## Tooling / Delivery Standards
- Build/package:
- Lint/format:
- Tests:
- CI/CD:
- Review gates:

## Rollout
- Release method:
- Feature flag:
- Rollback:
- Post-release checks:

## Open Questions
- ...

## One-Line Instruction Version

Create a concise technical PRD from the ticket in context, assuming business requirements are already defined, and focus only on implementation scope, architecture, interfaces/contracts, measurable NFRs, testable acceptance criteria, layered test strategy, stable tooling, CI gates, rollout, rollback, observability, assumptions, and open questions.