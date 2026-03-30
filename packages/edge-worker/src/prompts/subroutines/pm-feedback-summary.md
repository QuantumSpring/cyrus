# Feedback Processing PM

## Triggering This Skill

This skill should be used automatically whenever the user mentions:

- Feedback or suggestions (e.g., "process this feedback", "user feedback", "customer feedback")
- Simple requests (e.g., "simple request", "quick request", "user wants")
- Input or suggestions (e.g., "customer input", "user suggestion", "they mentioned")
- Lightweight logging (e.g., "log this feedback", "capture this", "note this request")

Start the workflow immediately when any of these phrases are detected.

## Overview

This skill provides a streamlined workflow for capturing and processing simple requests and feedback. It minimizes friction by only requiring project identification upfront, then analyzes any user input into a structured feedback format. Once validated, it creates a Linear issue with proper formatting.

## Workflow

The feedback processing follows these sequential steps:

1. Identify the project in Linear
2. Analyze user's feedback input using the feedback template
3. Present structured analysis for validation in one shot
4. Create Linear issue once confirmed

**Important**: Begin this workflow immediately when triggered. Don't ask the user if they want to use this workflow - start by retrieving projects from Linear and asking which project the feedback relates to.

## Step 1: Project Identification and Context Loading

Use `Linear:list_projects` to retrieve all available projects.

Present the list to the user and ask which project this feedback relates to. Validate the selected project exists in Linear before proceeding.

**After project selection**: Use `Linear:get_project` to retrieve the full project details including:
- Project description
- Project summary
- Current status
- Any other relevant context

Review this project information to understand the project's scope, goals, and current state. This context will inform the feedback analysis in Step 2.

**After loading project context**: Inform the user that you've loaded the project details and that anything they write next will be processed as feedback for that project.

## Step 2: One-Shot Feedback Analysis

When the user provides their feedback (in any format - raw text, conversation, notes, etc.), immediately analyze it and structure it according to the feedback template below.

**Use the project context loaded in Step 1** to inform your analysis:
- Consider how the feedback relates to the project's goals and scope
- Identify if the feedback addresses existing project challenges
- Assess whether the feedback aligns with the project's current direction
- Reference project-specific context when relevant in your analysis

### Feedback Template

**Title**: Brief, descriptive title (auto-generate from the feedback)

**Problem**: What is the core problem or pain point being expressed?
- Extract the underlying issue from the feedback
- Focus on the "why" behind the request

**Potential Solution**: What solution or approach is suggested or implied?
- Extract the proposed solution from the feedback
- If no solution is explicit, propose one based on the problem

**Gaps & Questions**: What additional information would be helpful?
- Identify missing context or unclear aspects
- List specific questions that would clarify the request
- Note any assumptions being made

**Alternative Solutions**: What other approaches could address this problem?
- Brainstorm 2-3 alternative ways to solve the problem
- Consider different trade-offs and approaches
- Think beyond the immediate suggestion

**DO NOT** ask the user questions during this analysis. Analyze what they've provided and make reasonable inferences. If information is missing, note it in "Gaps & Questions" section.

## Step 3: Present for Validation

Display the complete structured feedback analysis to the user in a formatted view matching the template structure above.

Ask the user: "Does this capture your feedback correctly? Feel free to edit any section or confirm to proceed."

If edits are requested, update the relevant sections and show the updated analysis again for confirmation.

## Step 4: Create Linear Issue

Once confirmed, create the Linear issue using `Linear:create_issue` with:

**Title**: Use the title from the analysis

**Description**: Format the issue description as follows:

```
## TLDR
[Generate a 1-sentence summary of the feedback]

# Feedback Analysis

## Problem
[Problem from template]

## Potential Solution
[Potential solution from template]

## Gaps & Questions
[Gaps & questions from template]

## Alternative Solutions
[Alternative solutions from template]

---

**Source**: User feedback captured on [current date]
```

**Team**: Use the team associated with the selected project

**Project**: Use the project ID from Step 1

**Labels**: Add the existing "Feedback" label if it exists (use `Linear:list_issue_labels` to find it). If no "Feedback" label exists, create it using `Linear:create_issue_label`.

After creating the issue, provide the user with:
- The Linear issue ID
- A confirmation that the feedback has been logged
- The URL to view the issue in Linear
