# Convert API Integration Worklog

This log tracks implementation of the Convert.com project & experiment workflow requested on 2025-10-05.

## Task Checklist
- [x] Establish API integration architecture (client helper, auth, error handling)
- [x] Add service worker messaging for accounts/projects/experiences CRUD
- [x] Redesign sidepanel controls for project + experiment selection, creation, and editing
- [x] Sync Convert experience code into the AI workflow (load, edit, push updates)
- [x] Ensure AI/manual edits trigger robust verification runs
- [x] Document usage, testing expectations, and limitations

## Notes
- 2025-10-05: Added bearer-auth Convert API client in the service worker with shared request helper and error handling.
- 2025-10-05: Exposed messaging endpoints for listing accounts, projects, experiences, and for creating/updating Convert experiences & variations.
- 2025-10-05: Rebuilt side panel Convert section with API credential selection, dynamic account/project/experience pickers, draft creation fields, and pull/push buttons.
- 2025-10-05: Implemented Convert experience import/export pipeline including baseline preservation, custom code extraction, and validation gating prior to push.
- 2025-10-05: Added automatic validation runs after AI refinements or manual saves plus a manual "Run Current Variation" tester that surfaces errors in the log and Convert status banner.
- 2025-10-05: Corrected Convert API base URL to `/api/v2` to align with the officially published endpoints so account/project lookups succeed.
- 2025-10-05: Added automatic fallback to HMAC request signing to support API keys that require signed Convert API requests, including correct header casing for `Convert-Application-ID`.
- 2025-10-05: Instrumented detailed Convert API logging (auth attempts, payload size, response status) to troubleshoot remaining authorization errors.
- 2025-10-05: Adjusted HMAC headers to use the documented `Expire` name to match Convert's authentication expectations.
- 2025-10-05: Capped project/experience pagination requests to Convert's 50 item maximum to avoid 422 validation errors.
- 2025-10-05: Normalized `include`/`expand` query params to arrays to satisfy Convert's validation during experience fetches.
- 2025-10-05: Updated query serialization to send array params as `param[]=` entries per Convert's expectation.
