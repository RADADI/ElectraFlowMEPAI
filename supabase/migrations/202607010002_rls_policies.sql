-- ============================================================================
-- ElectraFlow AI — Row-Level Security Policies (Phase 3)
-- Run AFTER schema.sql, BEFORE seed.sql.
-- ============================================================================
-- Strategy:
--   1. Every table has RLS enabled.
--   2. All authenticated users can only see rows belonging to THEIR organisation.
--   3. Role-specific write restrictions are layered on top.
--   4. Phase 4 will tighten policies once Clerk JWTs are wired in.
--
-- The helper function get_my_org_id() reads from the profiles table using
-- auth.uid(), which resolves to the Clerk sub claim in Phase 4.
-- ============================================================================

-- ─── Helper function ─────────────────────────────────────────────────────────

create or replace function get_my_org_id()
returns uuid language sql stable security definer as $$
  select organization_id from profiles where id = auth.uid() limit 1;
$$;

-- ─── Helper: current user role ───────────────────────────────────────────────

create or replace function get_my_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid() limit 1;
$$;

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

alter table organizations         enable row level security;
alter table profiles              enable row level security;
alter table organization_members  enable row level security;
alter table invitations           enable row level security;
alter table audit_logs            enable row level security;
alter table clients               enable row level security;
alter table projects              enable row level security;
alter table project_members       enable row level security;
alter table project_milestones    enable row level security;
alter table documents             enable row level security;
alter table document_versions     enable row level security;
alter table document_approvals    enable row level security;
alter table submittals            enable row level security;
alter table submittal_items       enable row level security;
alter table submittal_reviews     enable row level security;
alter table rfi                   enable row level security;
alter table rfi_responses         enable row level security;
alter table ncr                   enable row level security;
alter table ncr_actions           enable row level security;
alter table employees             enable row level security;
alter table employee_skills       enable row level security;
alter table resource_allocations  enable row level security;

-- ─── Organizations ───────────────────────────────────────────────────────────

create policy "org: member can view own org"
  on organizations for select
  using (id = get_my_org_id());

create policy "org: admin can update own org"
  on organizations for update
  using (id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Profiles ────────────────────────────────────────────────────────────────

create policy "profiles: member can view org profiles"
  on profiles for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "profiles: user can update own profile"
  on profiles for update
  using (id = auth.uid());

create policy "profiles: admin can insert profiles"
  on profiles for insert
  with check (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Organization members ─────────────────────────────────────────────────────

create policy "org_members: member can view org members"
  on organization_members for select
  using (organization_id = get_my_org_id());

create policy "org_members: admin can manage members"
  on organization_members for all
  using (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Invitations ─────────────────────────────────────────────────────────────

create policy "invitations: admin/pm can view org invitations"
  on invitations for select
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

create policy "invitations: admin can manage invitations"
  on invitations for all
  using (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Audit logs ──────────────────────────────────────────────────────────────

create policy "audit: admin/executive can read logs"
  on audit_logs for select
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'executive'));

create policy "audit: service role can insert"
  on audit_logs for insert
  with check (organization_id = get_my_org_id());

-- ─── Clients ─────────────────────────────────────────────────────────────────

create policy "clients: member can view org clients"
  on clients for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "clients: admin/pm can manage clients"
  on clients for all
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

-- ─── Projects ────────────────────────────────────────────────────────────────

create policy "projects: member can view accessible projects"
  on projects for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and (
      -- Admin and Executive see all
      get_my_role() in ('admin', 'executive')
      -- PM sees projects they manage
      or (get_my_role() = 'project_manager' and pm_id = auth.uid())
      -- Engineers/QA see projects they are members of
      or exists (
        select 1 from project_members pm
        where pm.project_id = projects.id
          and pm.profile_id = auth.uid()
          and pm.deleted_at is null
      )
    )
  );

create policy "projects: admin/pm can insert"
  on projects for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager')
  );

create policy "projects: admin/pm can update"
  on projects for update
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager')
    and deleted_at is null
  );

create policy "projects: admin can soft-delete"
  on projects for update
  using (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Project members ─────────────────────────────────────────────────────────

create policy "project_members: member can view"
  on project_members for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "project_members: admin/pm can manage"
  on project_members for all
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

-- ─── Project milestones ───────────────────────────────────────────────────────

create policy "milestones: project member can view"
  on project_milestones for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "milestones: admin/pm can manage"
  on project_milestones for all
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

-- ─── Documents ───────────────────────────────────────────────────────────────

create policy "docs: member can view org documents"
  on documents for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "docs: engineers/pm/admin can insert"
  on documents for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer'
    )
  );

create policy "docs: author/admin/pm can update"
  on documents for update
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and (created_by = auth.uid() or get_my_role() in ('admin', 'project_manager'))
  );

-- ─── Document versions ───────────────────────────────────────────────────────

create policy "doc_versions: member can view"
  on document_versions for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "doc_versions: author can insert"
  on document_versions for insert
  with check (organization_id = get_my_org_id());

-- ─── Document approvals ───────────────────────────────────────────────────────

create policy "doc_approvals: member can view"
  on document_approvals for select
  using (organization_id = get_my_org_id());

create policy "doc_approvals: approvers can insert"
  on document_approvals for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'senior_electrical_engineer', 'qa_qc_engineer')
  );

-- ─── Submittals ───────────────────────────────────────────────────────────────

create policy "submittals: member can view org submittals"
  on submittals for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "submittals: engineers/pm/admin can manage"
  on submittals for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── Submittal items ─────────────────────────────────────────────────────────

create policy "submittal_items: member can view"
  on submittal_items for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "submittal_items: engineers can manage"
  on submittal_items for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── Submittal reviews ───────────────────────────────────────────────────────

create policy "submittal_reviews: member can view"
  on submittal_reviews for select
  using (organization_id = get_my_org_id());

create policy "submittal_reviews: reviewers can insert"
  on submittal_reviews for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'senior_electrical_engineer', 'qa_qc_engineer')
  );

-- ─── RFI ─────────────────────────────────────────────────────────────────────

create policy "rfi: member can view org rfis"
  on rfi for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "rfi: engineers/pm/admin can manage"
  on rfi for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── RFI responses ───────────────────────────────────────────────────────────

create policy "rfi_responses: member can view"
  on rfi_responses for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "rfi_responses: respondents can insert"
  on rfi_responses for insert
  with check (organization_id = get_my_org_id());

-- ─── NCR ─────────────────────────────────────────────────────────────────────

create policy "ncr: member can view org ncrs"
  on ncr for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "ncr: qa/pm/admin can manage"
  on ncr for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'qa_qc_engineer', 'senior_electrical_engineer')
  );

-- ─── NCR actions ─────────────────────────────────────────────────────────────

create policy "ncr_actions: member can view"
  on ncr_actions for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "ncr_actions: qa/pm/admin can manage"
  on ncr_actions for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'qa_qc_engineer')
  );

-- ─── Employees ───────────────────────────────────────────────────────────────

create policy "employees: hr/admin/executive can view"
  on employees for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and get_my_role() in ('admin', 'hr', 'executive')
  );

create policy "employees: hr/admin can manage"
  on employees for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'hr')
  );

-- ─── Employee skills ─────────────────────────────────────────────────────────

create policy "employee_skills: hr/admin can view"
  on employee_skills for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and get_my_role() in ('admin', 'hr', 'executive')
  );

create policy "employee_skills: hr/admin can manage"
  on employee_skills for all
  using (organization_id = get_my_org_id() and get_my_role() in ('admin', 'hr'));

-- ─── Resource allocations ────────────────────────────────────────────────────

create policy "resource_allocations: pm/hr/admin can view"
  on resource_allocations for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and get_my_role() in ('admin', 'hr', 'project_manager', 'executive')
  );

create policy "resource_allocations: pm/hr/admin can manage"
  on resource_allocations for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'hr', 'project_manager')
  );
