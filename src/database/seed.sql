-- ============================================================================
-- ElectraFlow AI — Seed Data (Phase 3)
-- Run AFTER schema.sql and rls-policies.sql.
-- This data is for development/testing — do not run in production.
-- ============================================================================

-- ─── Organisation ────────────────────────────────────────────────────────────

insert into organizations (id, name, slug, plan, industry, country) values
  ('00000000-0000-0000-0000-000000000001',
   'ElectraFlow Demo Co.',
   'electraflow-demo',
   'pro',
   'Electrical Engineering',
   'US');

-- ─── Profiles ────────────────────────────────────────────────────────────────

insert into profiles (id, organization_id, full_name, email, role, department, title, onboarding_done) values
  ('10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'Alice Chen',         'admin@electraflow.ai',              'admin',
   'Management',        'Chief Operating Officer',           true),
  ('10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'Bob Martinez',      'pm@electraflow.ai',                 'project_manager',
   'Projects',          'Senior Project Manager',            true),
  ('10000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   'Carol Zhang',       'senior.engineer@electraflow.ai',    'senior_electrical_engineer',
   'Engineering',       'Senior Electrical Engineer',        true),
  ('10000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000001',
   'David Lee',         'engineer@electraflow.ai',           'electrical_engineer',
   'Engineering',       'Electrical Engineer II',            true),
  ('10000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000001',
   'Emma Patel',        'qa@electraflow.ai',                 'qa_qc_engineer',
   'Quality',           'QA/QC Lead',                        true),
  ('10000000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000001',
   'Frank Ortega',      'hr@electraflow.ai',                 'hr',
   'Human Resources',   'HR Manager',                        true),
  ('10000000-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000001',
   'Grace Kim',         'executive@electraflow.ai',          'executive',
   'Executive',         'VP of Engineering',                 true),
  ('10000000-0000-0000-0000-000000000008',
   '00000000-0000-0000-0000-000000000001',
   'Henry Ford',        'client@electraflow.ai',             'client',
   null,                'Project Stakeholder',               true);

-- ─── Client ──────────────────────────────────────────────────────────────────

insert into clients (id, organization_id, name, contact_name, contact_email, country) values
  ('20000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'Metro Transit Authority',
   'James Whitfield',
   'j.whitfield@metatransit.example',
   'US'),
  ('20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'Pacific Commercial Developments',
   'Sarah Novak',
   's.novak@pcd.example',
   'US');

-- ─── Projects ────────────────────────────────────────────────────────────────

insert into projects
  (id, organization_id, project_number, name, description, client_id,
   status, priority, risk_level, location, discipline,
   start_date, end_date, budget, progress_percent, pm_id,
   created_by, updated_by)
values
  ('30000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'EF-2024-001',
   'Metro Station Electrical Upgrade',
   'Full HV/LV upgrade for 12 metro stations including UPS, BMS integration.',
   '20000000-0000-0000-0000-000000000001',
   'active', 'high', 'medium',
   'Downtown Metro Network, CA',
   'Division 26 - Electrical',
   '2024-01-15', '2024-12-31',
   4200000.00, 62,
   '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'EF-2024-002',
   'Pacific Tower Data Centre',
   'Tier-3 data centre power distribution design and commissioning.',
   '20000000-0000-0000-0000-000000000002',
   'active', 'critical', 'high',
   'San Francisco, CA',
   'Division 26 - Electrical',
   '2024-03-01', '2025-06-30',
   8900000.00, 35,
   '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   'EF-2023-007',
   'Bayview Hospital HVAC Controls',
   'BAS/BMS integration for new wing electrical and mechanical systems.',
   null,
   'completed', 'medium', 'low',
   'Bayview, CA',
   'Division 23 - HVAC',
   '2023-06-01', '2024-02-28',
   1750000.00, 100,
   '10000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002');

-- ─── Project members ─────────────────────────────────────────────────────────

insert into project_members (organization_id, project_id, profile_id, role) values
  ('00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   'senior_electrical_engineer'),
  ('00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000004',
   'electrical_engineer'),
  ('00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000005',
   'qa_qc_engineer'),
  ('00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000003',
   'senior_electrical_engineer'),
  ('00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000004',
   'electrical_engineer');

-- ─── Documents ───────────────────────────────────────────────────────────────

insert into documents
  (id, organization_id, project_id, title, document_number, discipline, document_type, revision, status, created_by)
values
  ('40000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'Single Line Diagram — Zone A',
   'EF-2024-001-SLD-001',
   'Division 26 - Electrical',
   'Drawing',
   'C', 'approved',
   '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'Panel Schedule — MDB-01',
   'EF-2024-001-PS-001',
   'Division 26 - Electrical',
   'Specification',
   'B', 'under_review',
   '10000000-0000-0000-0000-000000000004'),
  ('40000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002',
   'Power Distribution Report',
   'EF-2024-002-RPT-001',
   'Division 26 - Electrical',
   'Report',
   'A', 'draft',
   '10000000-0000-0000-0000-000000000003');

-- ─── Submittals ───────────────────────────────────────────────────────────────

insert into submittals
  (id, organization_id, project_id, submittal_number, title, discipline,
   spec_section, status, submitted_date, required_date, submitted_by, reviewer_id, created_by)
values
  ('50000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'S-001', 'UPS Battery Pack — Zone A',
   'Division 26 - Electrical',
   '26 33 53',
   'approved',
   '2024-03-10', '2024-03-20',
   '10000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000004'),
  ('50000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'S-002', 'LED Luminaires — Platforms',
   'Division 26 - Electrical',
   '26 51 00',
   'revise_and_resubmit',
   '2024-04-01', '2024-04-15',
   '10000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000004');

-- ─── RFIs ────────────────────────────────────────────────────────────────────

insert into rfi
  (id, organization_id, project_id, rfi_number, title, description,
   discipline, status, priority, submitted_by, assigned_to,
   submitted_date, required_date, cost_impact, schedule_impact, created_by)
values
  ('60000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'RFI-001',
   'Clarification on UPS bypass switching sequence',
   'Drawing EF-2024-001-SLD-001 Rev C does not indicate the manual bypass procedure for MDB-01. Please clarify.',
   'Division 26 - Electrical',
   'answered', 'high',
   '10000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003',
   '2024-05-01', '2024-05-08',
   false, true,
   '10000000-0000-0000-0000-000000000004'),
  ('60000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002',
   'RFI-001',
   'Conduit routing conflict at level B2',
   'Structural beam at grid G-5 conflicts with proposed conduit run. Rerouting options required.',
   'Division 26 - Electrical',
   'open', 'critical',
   '10000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003',
   '2024-06-20', '2024-06-27',
   true, true,
   '10000000-0000-0000-0000-000000000004');

-- ─── NCRs ────────────────────────────────────────────────────────────────────

insert into ncr
  (id, organization_id, project_id, ncr_number, title, description,
   discipline, status, severity, raised_by, assigned_to,
   raised_date, due_date, created_by)
values
  ('70000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'NCR-001',
   'Cable tray installed without bonding jumper',
   'Section 3B cable tray run installed without required bonding jumpers per NEC 250.96.',
   'Division 26 - Electrical',
   'action_required', 'high',
   '10000000-0000-0000-0000-000000000005',
   '10000000-0000-0000-0000-000000000004',
   '2024-06-01', '2024-06-15',
   '10000000-0000-0000-0000-000000000005');

-- ─── Employees ───────────────────────────────────────────────────────────────

insert into employees
  (id, organization_id, profile_id, employee_number, full_name, email,
   role, department, title, hire_date, employment_type, hourly_rate, created_by)
values
  ('80000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   'EMP-003',
   'Carol Zhang',
   'senior.engineer@electraflow.ai',
   'senior_electrical_engineer',
   'Engineering',
   'Senior Electrical Engineer',
   '2021-03-01', 'full_time', 95.00,
   '10000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000004',
   'EMP-004',
   'David Lee',
   'engineer@electraflow.ai',
   'electrical_engineer',
   'Engineering',
   'Electrical Engineer II',
   '2022-08-15', 'full_time', 70.00,
   '10000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   null,
   'EMP-009',
   'Maria Santos',
   'maria.santos@electraflow.ai',
   'electrical_engineer',
   'Engineering',
   'Electrical Engineer I',
   '2023-11-01', 'contractor', 65.00,
   '10000000-0000-0000-0000-000000000001');

-- ─── Resource allocations ────────────────────────────────────────────────────

insert into resource_allocations
  (organization_id, employee_id, project_id, role_on_project,
   allocation_percent, start_date, end_date, created_by)
values
  ('00000000-0000-0000-0000-000000000001',
   '80000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   'Lead Electrical Engineer', 60,
   '2024-01-15', '2024-12-31',
   '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001',
   '80000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000001',
   'Electrical Engineer', 80,
   '2024-01-15', '2024-12-31',
   '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000001',
   '80000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002',
   'Lead Electrical Engineer', 40,
   '2024-03-01', '2025-06-30',
   '10000000-0000-0000-0000-000000000001');
