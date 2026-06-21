# Claims Workflow Orchestrator

A state machine-based workflow engine built with **NestJS** that orchestrates claim lifecycle transitions with preconditions, side effects, role-based authorization, and a complete audit trail.

## Tech Stack

- **Framework:** NestJS v11 (TypeScript)
- **Testing:** Jest + ts-jest (22 tests)
- **API Docs:** Swagger UI (`/api`)
- **Config:** JSON-driven state machine (no hardcoded logic)

## Quick Start

```bash
npm install
npm run build
npm run start

# Swagger UI → http://localhost:3000/api
```

## Running Tests

```bash
npm test          # run all tests
npm test -- --verbose  # with details
```

## Project Structure

```
├── config/
│   ├── workflow.json           # State machine config (states, transitions, cycle rules)
│   ├── mock-claims.json        # [NEW] Mock claims data for seeding
│   └── mock-audit.json         # [NEW] Mock audit history entries
├── src/
│   ├── app.module.ts
│   ├── main.ts                 # Entry point with Swagger setup
│   ├── types/index.ts          # TypeScript interfaces
│   ├── workflow/
│   │   ├── workflow.module.ts
│   │   ├── workflow.service.ts # Core state machine engine
│   │   ├── workflow.controller.ts
│   │   └── dto/index.ts
│   ├── audit/
│   │   ├── audit.module.ts
│   │   ├── audit.service.ts    # Immutable audit trail
│   │   └── audit.controller.ts
│   ├── preconditions/
│   │   └── precondition.service.ts
│   └── side-effects/
│       └── side-effect.service.ts
├── test/
│   └── workflow.spec.ts        # 22 tests covering all scenarios (including Mock Data Seeding)
└── jest.config.js
```

## Mock Data for Verification (Swagger UI)

To make it easy to verify from Swagger UI (`/api`), the application automatically seeds the following **4 sample claims** and their corresponding **audit history** at startup:

1. **`d3b07384-d113-4ec6-a558-4cbb3035418b`** (State: `SUBMITTED`)
   - Audit trail is empty `[]`.
2. **`8f070129-450f-4f27-84bc-87c2f0f423ab`** (State: `UNDER_ASSESSMENT`)
   - Audit trail contains **2 transitions**: `SUBMITTED` &rarr; `DOCUMENTS_VERIFIED` &rarr; `UNDER_ASSESSMENT`.
3. **`c0f993d0-0863-4903-b0fc-1b4e13589b2b`** (State: `APPROVED`)
   - Audit trail contains **3 transitions**: `SUBMITTED` &rarr; `DOCUMENTS_VERIFIED` &rarr; `UNDER_ASSESSMENT` &rarr; `APPROVED`.
4. **`e02d6a5a-8b83-4927-a068-07b9a528e12c`** (State: `CLOSED`)
   - Audit trail contains **5 transitions**: Full claim lifecycle complete from `SUBMITTED` all the way to `CLOSED`.

Use these IDs on Swagger endpoints `/claims/{id}` or `/audit/{claimId}` to test query and transition flows.

## API Endpoints

| Method | Endpoint                 | Description                               |
| ------ | ------------------------ | ----------------------------------------- |
| `POST` | `/claims`                | Create a new claim                        |
| `GET`  | `/claims`                | List all claims (seeded with mock data)   |
| `GET`  | `/claims/:id`            | Get claim details + available transitions |
| `POST` | `/claims/:id/transition` | Advance claim to a new state              |
| `GET`  | `/audit/:claimId`        | View audit trail for a claim              |

## State Machine

### States

`SUBMITTED` → `DOCUMENTS_VERIFIED` → `UNDER_ASSESSMENT` → `APPROVED`/`REJECTED`/`PENDING_INFO` → `PAYMENT_INITIATED` → `CLOSED`

### Role Authorization

| Transition                                        | Authorized Role |
| ------------------------------------------------- | --------------- |
| SUBMITTED → DOCUMENTS_VERIFIED                    | document_clerk  |
| DOCUMENTS_VERIFIED → UNDER_ASSESSMENT             | team_lead       |
| UNDER_ASSESSMENT → APPROVED/REJECTED/PENDING_INFO | assessor        |
| PENDING_INFO → DOCUMENTS_VERIFIED                 | document_clerk  |
| APPROVED → PAYMENT_INITIATED                      | finance         |
| PAYMENT_INITIATED → CLOSED                        | finance         |
| REJECTED → CLOSED                                 | system          |

### Cycle Detection

The UNDER_ASSESSMENT → PENDING_INFO → DOCUMENTS_VERIFIED loop is limited to **3 cycles**. On the 4th attempt, the transition is rejected with: _"Maximum information requests exceeded — escalate to team lead"_.

## Adding a New State or Transition (Config-only Change)

To add a new `ESCALATED` state reachable from `UNDER_ASSESSMENT`:

```diff
--- config/workflow.json
+++ config/workflow.json
@@ states
+    "ESCALATED": {
+      "description": "Claim escalated to senior assessor"
+    },
@@ transitions
+    {
+      "from": "UNDER_ASSESSMENT",
+      "to": "ESCALATED",
+      "preconditions": ["assessment_report_complete"],
+      "sideEffects": ["notify_senior_assessor"],
+      "authorizedRoles": ["team_lead"]
+    },
```

No application code changes required — only config.

## Test Results Summary (22 tests)

- **5 required scenarios**: Happy path, Rejection path, Info loop, Invalid transition, Unauthorized role
- **5 precondition tests**: Missing docs, Amount exceeds limit, No rejection reason, No assessor, No payment request
- **2 cycle detection tests**: 3 cycles allowed, 4th rejected
- **3 audit trail tests**: Logs failures, Includes user/role, Entries immutable
- **2 role authorization tests**: Assessor can't pay, Clerk can't approve
- **3 config-driven tests**: Available transitions from state, Multiple from UNDER_ASSESSMENT, None from CLOSED
- **1 edge case test**: Non-existent claim
- **1 mock data seeding test**: Verifies mock claims and audit entries load and map correctly
