---
name: feature-creation-pm
description: Product management workflow for creating new features in Linear. ALWAYS use this skill when the user mentions creating features, new functionality, enhancements, or user stories. Trigger phrases include "create a feature", "new feature", "add functionality", "user story", "enhancement", "new capability", "implement feature", or any mention of adding new product capabilities. This skill handles the complete workflow from user story definition through Linear issue creation and optional implementation triggering.
---

# Feature Creation PM

## Triggering This Skill

This skill should be used automatically whenever the user mentions:

- New features or functionality (e.g., "create a feature", "new feature", "add a feature")
- User stories (e.g., "create a user story", "user story for", "write a user story")
- Enhancements or capabilities (e.g., "enhancement", "new capability", "add functionality")
- Feature requests (e.g., "feature request", "implement feature", "build feature")

Start the workflow immediately when any of these phrases are detected.

## Overview

This skill guides the feature creation workflow from initial user story definition through Linear issue creation and optional implementation setup. It ensures consistent feature documentation using standardized user story templates and automates the handoff to development.

## Workflow

The feature creation process follows these sequential steps:

1. Identify the project in Linear
2. Collect feature information using the user story template
3. Review and confirm details with user
4. Create Linear issue with proper formatting and labels
5. Optionally trigger implementation workflow

**Important**: Begin this workflow immediately when triggered. Don't ask the user if they want to use this workflow - start by retrieving projects from Linear and asking which project the feature relates to.

## Step 1: Project Identification

Use `Linear:list_projects` to retrieve all available projects.

Present the list to the user and ask which project this feature relates to. Validate the selected project exists in Linear before proceeding.

Once the user has selected a project, use `Linear:get_project` to load the full project details including the project description. This provides essential context about the project's scope, goals, and technical details that will inform better feature specifications and acceptance criteria.

## Step 2: Template Selection and Data Collection

Check if a project-specific feature template exists for the selected project. If no project-specific template exists, use the general user story template below.

### General User Story Template

Collect the following information from the user conversationally:

**Title**: Brief, action-oriented description of the feature

**Overview**: Brief explanation of the functionality in English (1-3 sentences)

**User Story**:
- As a: [Actor/Role - who is the user?]
- I want to: [Action/Capability - what do they want to do?]
- So that: [Benefit/Outcome - why do they want to do it?]

**Acceptance Criteria**: Numbered list of specific, testable requirements
1. [Criterion 1]
2. [Criterion 2]
3. [Criterion 3]

**Technical Notes**: Implementation details, API references, system interactions (optional)

**Additional Context**: Any extra information, mockups, or relevant details (optional)

Guide the user through each section, asking clarifying questions as needed to gather complete information. Be particularly thorough with acceptance criteria to ensure they are specific and testable.

## Step 3: Review and Confirmation

Display the complete feature specification to the user in a formatted view matching the template structure.

Ask the user to confirm the information or request edits. If edits are requested, update the relevant sections and show the updated report again for confirmation.

## Step 4: Create Linear Issue

Once confirmed, create the Linear issue using `Linear:create_issue` with:

**Title**: Use the title from the collected data

**Description**: Format the issue description as follows:

```
## TLDR
[Generate a 1-2 sentence summary of the feature]

# Feature Specification

## Overview
[Overview from template]

## User Story

**As a**: [Actor/Role]  
**I want to**: [Action/Capability]  
**So that**: [Benefit/Outcome]

## Acceptance Criteria
[Numbered list of criteria from template]

## Technical Notes
[Technical notes from template, if provided]

## Additional Context
[Additional context from template, if provided]

## Definition of Done
- [ ] All existing tests pass successfully in CI/CD
- [ ] Code adheres to agreed coding standards and linting rules
- [ ] The Product Manager has reviewed and approved the implementation on dev environment
- [ ] The feature is deployed and functional on app.echota.ai
```

**Team**: Use the team associated with the selected project

**Project**: Use the project ID from Step 1

**Labels**: Add the existing "Feature" label (use `Linear:list_issue_labels` to find the Feature label ID - do not create new labels if one exists)

After creating the issue, note the issue ID for the next step.

## Step 5: Implementation Setup (Optional)

Ask the user: "Should I start the implementation workflow for this feature?"

If the user confirms:

### 5a. Repository Label Assignment

Use `Linear:list_issue_labels` to load all labels that contain "repo" in their name.

Based on the project name, select the most appropriate repository label. Present your selection to the user for confirmation:

"I've selected the label '[label-name]' for this issue. Does this look correct?"

Wait for user confirmation before proceeding.

### 5b. Add Label and Trigger Implementation

Once confirmed:
1. Update the issue with `Linear:update_issue` to add the selected repo label
2. Use `Linear:create_comment` to add the following comment to the issue:

```
\@claude start implementing this feature
```

Confirm to the user that the implementation workflow has been triggered.
