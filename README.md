# IT Operations Platform

> A full-stack internal platform built to replace fragmented manual IT administration workflows with centralized, auditable, and automation-friendly tooling.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![PowerShell](https://img.shields.io/badge/PowerShell-5.1+-5391FE?logo=powershell&logoColor=white)](https://microsoft.com/powershell)
[![SQLite](https://img.shields.io/badge/SQLite-Audit--Log-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)

---

## Why I Built This

At my company, many IT processes still relied on large PowerShell scripts, manual Active Directory operations, disconnected CSV exports, and no centralized audit trail. The result was significant operational friction:

- Onboarding/offboarding took too long
- Support staff manually logged into multiple enterprise systems for routine operations
- Every account or device change required navigating separate administrative interfaces
- Operational changes were difficult to trace afterward
- Repetitive workflows consumed large amounts of time
- Fragmented tooling increased context switching and overhead
- Support staff had inconsistent permissions

That meant constant context switching between Active Directory tools, Citrix administration, inventory systems, and internal management portals — with no single source of truth.

This platform centralizes and standardizes those operations into a single product with a clean web interface, role-based access control, centralized audit logging, reusable backend actions, automation hooks, and operational observability.

> I strongly believe internal tools deserve the same product thinking as customer-facing software. Poor operational tooling creates hidden friction that compounds daily across support and infrastructure teams.

---

## Core Features

| Feature | Description |
|---|---|
| **AD User Management** | Search, enable/disable, unlock, reset passwords, edit metadata, manage group memberships |
| **Computer Management** | Search AD computers, enable/disable machines, associate devices with sessions |
| **Citrix Session Monitoring** | Import active sessions from CSV, map users to client machines |
| **Asset Tracking** | Docusnap CSV import pipeline, device status tracking, QR-code workflows, inventory visibility |
| **RBAC** | Three roles: `helpdesk`, `it-admin`, `it-lead` — enforced server-side |
| **Audit Logging** | Every operation logged with actor, target, timestamp, result, request ID, and metadata |
| **Global Search** | Unified search across users and computers |

---

## Product Thinking

This project was intentionally designed like a product, not just an internal script collection.

| Goal | Implementation |
|---|---|
| Reduce operational toil | Centralized workflows + automation |
| Prevent unsafe operations | RBAC + validation layers |
| Make actions traceable | Structured audit logs |
| Improve developer velocity | Modular action architecture |
| Support future integrations | Service-oriented backend |
| Keep ops simple | Minimal infrastructure requirements |

A major focus was balancing developer ergonomics, operational safety, extensibility, and low deployment complexity.

---

## Architecture

### Frontend

**Stack:** React 18, Vite, Tailwind CSS, React Router

The frontend is intentionally thin — business logic lives in backend actions. Design goals: operational speed, low cognitive overhead, minimal clicks for repetitive tasks, fast rendering for large result sets.

### Backend

**Stack:** Node.js, Express, PowerShell integration layer, SQLite, Winston

The backend acts as the orchestration layer between Active Directory, Citrix exports, Docusnap data, and internal automation workflows. A key architectural decision was separating routes, actions, services, and middleware — this made the codebase significantly easier to extend.

### Action-Based Architecture

One of the most important architectural decisions was introducing isolated backend actions:

```
routes/users.js
  → actions/user/disableUser.js
    → services/adClient.js
      → PowerShell worker
```

Benefits: easier testing, smaller failure surface, reusable business logic, centralized audit logging, cleaner authorization boundaries.

### PowerShell Worker Pool

Active Directory operations run through a PowerShell bridge with a worker abstraction layer, centralized execution, structured error handling, and isolated operational actions — reducing duplicated logic and shell execution risks while leveraging existing enterprise tooling.

---

## Auditability & Observability

Every critical action writes a structured log entry:

```json
{
  "action": "USER_DISABLE",
  "actor": "admin.user",
  "target": "employee.user",
  "result": "success",
  "requestId": "uuid"
}
```

The logging pipeline includes SQLite audit persistence, rotating Winston log files, request correlation IDs, structured metadata, and CSV exports — making it possible to investigate incidents, track operational changes, debug workflows, and identify permission issues.

---

## Security

- Server-side RBAC
- Session-based authentication
- Input validation (Zod)
- Credential encryption
- Request auditing
- Middleware-based authorization
- Role separation

API security test collections (Bruno) cover unauthorized access, validation failures, RBAC bypass attempts, and invalid session handling.

---

## Technical Tradeoffs

**SQLite instead of Postgres** — chosen for deployment simplicity: the workload is operational rather than analytical, audit writes are append-heavy with low concurrency, and reducing infrastructure overhead increased internal adoption. For larger scale or multi-tenant usage, I would migrate to Postgres.

**PowerShell integration instead of LDAP rewrite** — the organization depended heavily on existing PowerShell AD workflows. Rather than replacing everything at once, I built an abstraction layer that allowed incremental migration, operational continuity, and lower risk. This dramatically reduced implementation risk.

---

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Logging | Winston |
| Database | SQLite |
| Automation | PowerShell |
| Validation | Zod |
| Testing | Bruno |
| Session Management | express-session |

---

## Getting Started

**Backend**
```bash
cd backend
npm install
npm run dev
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## Roadmap

The platform is actively evolving based on operational feedback and newly identified workflow bottlenecks.

### ITSM Integration (In Planning)
Integrating with our ITSM/ticketing system via API to automatically process HR-driven lifecycle events (onboarding, offboarding, department changes, role changes) — enabling the platform to orchestrate downstream AD updates, permission adjustments, group membership changes, asset reassignment, and audit logging automatically. This will reduce manual coordination between HR, IT support, and infrastructure teams.

### Asset Handover Automation (In Planning)
Dynamically generated PDF handover documents based on assigned devices, inventory data, and employee information — with digital signatures, approval workflows, and compliance archival. This will significantly reduce manual paperwork and improve asset traceability.

### What's Next

**Product Analytics** — Instrumenting the platform with PostHog for workflow completion funnels, operational bottlenecks, feature usage, session replay for support flows, and role-specific usage patterns.

**Infrastructure** — Migrating audit storage to Postgres, adding queue-based background jobs, containerizing services, and improving CI/CD automation.

**Frontend** — Implementing optimistic UI updates, better filtering, real-time operational updates, and keyboard-first workflows.

---

## Key Takeaways

This project required full-stack ownership — frontend UX, backend architecture, authentication, audit systems, infrastructure decisions, and deployment scripts. It reinforced that internal tools benefit from the same product discipline as customer-facing software: reduce friction, improve feedback loops, instrument behavior, ship quickly, and iterate continuously.
