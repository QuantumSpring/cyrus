# Bug Reporting PM

## Triggering This Skill

This skill should be used automatically whenever the user mentions:

- Bug reports or defects (e.g., "I found a bug", "there's a bug in", "report a bug")
- Software not working correctly (e.g., "not working", "broken", "doesn't work")
- Unexpected behavior (e.g., "unexpected behavior", "wrong behavior", "acting weird")
- Errors or issues (e.g., "error in", "issue with", "problem with")
- Creating bug tickets (e.g., "create a bug issue", "file a bug", "log this bug")

Start the workflow immediately when any of these phrases are detected.

## Overview

This skill guides the bug reporting workflow from initial information gathering through Linear issue creation and optional implementation setup. It ensures consistent bug documentation using standardized templates and automates the handoff to development.

## Workflow

The bug reporting process follows these sequential steps:

1. Identify the project in Linear
2. Collect bug information using the appropriate template
3. Review and confirm details with user
4. Create Linear issue with proper formatting and labels
5. Optionally trigger implementation workflow

**Important**: Begin this workflow immediately when triggered. Don't ask the user if they want to use this workflow - start by retrieving projects from Linear and asking which project the bug relates to.

## Step 1: Project Identification

Use `Linear:list_projects` to retrieve all available projects.

Present the list to the user and ask which project this bug relates to. Validate the selected project exists in Linear before proceeding.

Once the user has selected a project, use `Linear:get_project` to load the full project details including the project description. This provides essential context about the project's scope, goals, and technical details that will inform better bug documentation and help identify the expected behavior.

## Step 2: Template Selection and Data Collection

Check if a project-specific bug template exists for the selected project. If no project-specific template exists, use the general bug template below.

### General Bug Template

Collect the following information from the user conversationally:

**Title**: Brief description of the bug

**Steps to reproduce**: 
1. [First step]
2. [Second step]
3. [Third step]

**Actual behavior**: What currently happens

**Expected behavior**: What should happen instead

**Additional notes**: Any extra context, screenshots, or relevant information

Guide the user through each section, asking clarifying questions as needed to gather complete information.

## Step 3: Review and Confirmation

Display the complete bug report to the user in a formatted view matching the template structure.

Ask the user to confirm the information or request edits. If edits are requested, update the relevant sections and show the updated report again for confirmation.

## Step 4: Create Linear Issue

Once confirmed, create the Linear issue using `Linear:create_issue` with:

**Title**: Use the title from the collected data

**Description**: Format the issue description as follows:

```
## TLDR
[Generate a 1-2 sentence summary of the bug]

# Bug Report

## 1. Title
[Title from template]

## 2. Steps to reproduce
[Steps from template]

## 3. Actual behavior
[Actual behavior from template]

## 4. Expected behavior
[Expected behavior from template]

## 5. Additional notes
[Additional notes from template]
```

**Team**: Use the team associated with the selected project

**Project**: Use the project ID from Step 1

**Labels**: Add the existing "Bug" label (use `Linear:list_issue_labels` to find the Bug label ID - do not create new labels)

After creating the issue, note the issue ID for the next step.

## Step 5: Implementation Setup (Optional)

Ask the user: "Should I start the implementation workflow for this bug fix?"

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
