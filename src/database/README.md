# ElectraFlow AI — Database (Phase 3)

Quick reference for setting up the Supabase backend.
Full step-by-step guide: [`docs/phase-3-supabase-setup.md`](../../docs/phase-3-supabase-setup.md)

## Files

| File               | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `schema.sql`       | DDL — create all tables, enums, triggers, indexes |
| `rls-policies.sql` | Row-Level Security policies per role              |
| `seed.sql`         | Sample data for development / testing             |

## Run order

1. `schema.sql`
2. `rls-policies.sql`
3. `seed.sql` _(dev/test only)_

## Tables (Phase 3 scope)

### Core SaaS

- `organizations` — company accounts
- `profiles` — user accounts (maps to auth.uid() in Phase 4)
- `organization_members` — M:M org ↔ profile membership
- `invitations` — pending email invites
- `audit_logs` — immutable action log

### Projects

- `clients` — external client companies
- `projects` — project records with status/budget
- `project_members` — who is on which project
- `project_milestones` — project schedule milestones

### Documents

- `documents` — files with status/revision tracking
- `document_versions` — version history
- `document_approvals` — approval workflow records

### Engineering Workflows

- `submittals` / `submittal_items` / `submittal_reviews`
- `rfi` / `rfi_responses`
- `ncr` / `ncr_actions`

### HR / Resources

- `employees` — employee directory
- `employee_skills` — skills matrix
- `resource_allocations` — who is allocated to which project

## Phase 4 checklist (not yet implemented)

- [ ] Wire Clerk JWT as Supabase auth bearer
- [ ] Replace `auth.uid()` placeholder with real Clerk sub claim
- [ ] Migrate pages one module at a time using React Query hooks
- [ ] Add storage bucket for document file uploads
- [ ] Add AI tables: `document_chunks`, `embeddings_metadata`, `ai_chat_sessions`
