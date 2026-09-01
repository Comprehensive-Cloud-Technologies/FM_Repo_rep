# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** – incompatible changes to data, APIs, or workflows.
- **MINOR** – new features / behaviour, backward compatible.
- **PATCH** – backward-compatible bug fixes only.

## [Unreleased]

_Changes merged to `develop` that have not yet been released. Move them under a
new version heading when you cut a release tag._

### Added
- **Asset Pro Intelligence is now a guided chat assistant.** A step-by-step flow:
  personalised greeting → "What would you like a report on?" → pick a module →
  module-specific questions → the report, with **Back** and **Restart** at every
  step. Plus free-text and voice input, chat-bubble answers with a plain-language
  summary, inline bar charts for grouped reports, a collapsible data table,
  Excel/PDF download, and contextual follow-up chips that refine the previous
  answer. New report types: assets with the most downtime, MTTR by department,
  warranty/AMC expiring soon, and assets never maintained.

## [1.1.0] - 2026-08-31

### Added
- **Versioning & automated deployment.** Semantic versioning, a `VERSION` file,
  this changelog, a tag-triggered GitHub Actions deploy to EC2, and a CI build
  check on every push/PR. Backend now reports its version at `/api/version` and
  in `/api/health`.
- **SLA gating.** SLA columns, scores, and the SLA Dashboard only appear when the
  SLA module is enabled for a company **and** an SLA policy is attached.
  New `GET /api/company-portal/sla/active`.

### Changed
- **SLA attendance window** is now measured from when a ticket is *assigned to an
  engineer* until the engineer marks it *In Progress* — no longer from when the
  ticket was raised.
- Attachment URLs (ticket-master images, training documents) are now served as
  time-limited pre-signed S3 URLs.

### Fixed
- Total downtime now accumulates correctly across reopen cycles and no longer
  resets to zero on assignment.
- Reopening a ticket recalculates downtime, resolution time, TAT, and cutoff.
- Cutoff time no longer shifts to the wrong value after a page refresh (timezone).
- The **Acknowledge** button now reports failures instead of silently doing nothing.
- The **Back** button on the asset-details page returns correctly when the page
  was opened in a new tab.
- **Add Asset** image uploads no longer fail with "invalid image" / broken images
  (the upload requests were missing their authorization header).
- Attachments in the ticket master and Training no longer fail with S3
  "Access Denied".
- Assigning a **PMS** now shows up for the engineer in the mobile app (the
  engineer assignment is propagated to each scheduled asset).

[Unreleased]: https://github.com/Comprehensive-Cloud-Technologies/FM_Repo_rep/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Comprehensive-Cloud-Technologies/FM_Repo_rep/releases/tag/v1.1.0
