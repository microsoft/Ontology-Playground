# Ontology School Human Review Workflow

This workflow marks lessons as pending human review and removes that marker only after issue-based approval.

## 1) Tag a lesson as pending review

In the lesson frontmatter (for example in `content/learn/<course>/<lesson>.md`), add:

```md
reviewStatus: under-human-review
```

Example:

```md
---
title: Collateral and Schedules
slug: collateral-and-schedules
description: Add security agreements and repayment cadence using collateral and payment schedule entities.
order: 3
embed: official/fibo-loans-step-2
reviewStatus: under-human-review
---
```

## 2) Open a review issue

Use the issue template:

- `.github/ISSUE_TEMPLATE/ontology-school-review.yml`

Required fields:

- `Lesson Path` (must be under `content/learn/`)
- `Source Pull Request`
- `Reviewer Notes`

Template applies label `ontology-school-review`.

## 3) Approve and trigger automation

There are two ways to approve a lesson:

### Option A — Comment trigger
Post a comment containing `#approved` on the review issue. The workflow will automatically add the `ontology-school-approved` label, close the issue, and create the approval PR.

### Option B — Manual label + close
1. Add issue label `ontology-school-approved`
2. Close the issue

Either option triggers the workflow:

- `.github/workflows/ontology-school-review-approval.yml`

The workflow will:

- Parse `Lesson Path` from issue body
- Remove `reviewStatus: under-human-review` from that lesson
- Recompile `public/learn.json`
- Open an automated PR with the change

## 4) Merge approval PR

Merge the bot-created PR through normal branch + PR flow.

## Required repository labels

Create these labels in GitHub (once):

- `ontology-school-review`
- `ontology-school-approved`

## Notes

- The automation only runs when the issue is **closed** and has label `ontology-school-approved`.
- If the lesson path is invalid or missing, the workflow fails without changing files.
- The marker removal is idempotent; if already removed, the PR may be empty.
