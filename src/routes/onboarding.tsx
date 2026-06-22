import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2,
  UserCheck,
  Settings2,
  FolderPlus,
  Users,
  ArrowRight,
  ArrowLeft,
  Check,
  Zap,
  CheckCircle2,
} from "lucide-react";
import {
  getStoredRole,
  getStoredUser,
  setOnboardingDone,
  updateRegisteredUser,
} from "@/contexts/auth-context";
import { getDefaultRoute } from "@/lib/permissions";
import { DISCIPLINES } from "@/lib/dummy-data";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up your workspace — ElectraFlow AI" }] }),
  beforeLoad: () => {
    // Onboarding requires a role to be set (i.e., user just signed up)
    if (typeof window !== "undefined" && !localStorage.getItem("mep-role")) {
      throw redirect({ to: "/signup" });
    }
  },
  component: OnboardingPage,
});

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 1,
    icon: Building2,
    title: "Company Profile",
    description: "Tell us about your organization",
  },
  {
    id: 2,
    icon: UserCheck,
    title: "Your Role",
    description: "Confirm your role and department",
  },
  {
    id: 3,
    icon: Settings2,
    title: "Workspace Setup",
    description: "Configure your preferences",
  },
  {
    id: 4,
    icon: FolderPlus,
    title: "First Project",
    description: "Create your first project",
  },
  {
    id: 5,
    icon: Users,
    title: "Invite Team",
    description: "Add your colleagues",
  },
] as const;

const INDUSTRIES = [
  "Electrical Engineering",
  "MEP Engineering",
  "Civil & Structural Engineering",
  "Architecture",
  "General Contracting",
  "Project Management",
  "Facilities Management",
  "Government / Public Sector",
  "Real Estate Development",
  "Other",
];

const COMPANY_SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"];

const DEPARTMENTS = [
  "Engineering",
  "Project Management",
  "Quality Assurance",
  "Human Resources",
  "Executive / Leadership",
  "Finance",
  "Operations",
  "IT",
  "Other",
];

const EXPERIENCE_LEVELS = ["Less than 1 year", "1–3 years", "3–5 years", "5–10 years", "10+ years"];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Step {current} of {total}
        </span>
        <span className="text-muted-foreground font-medium">
          {Math.round((current / total) * 100)}% complete
        </span>
      </div>
      <Progress value={(current / total) * 100} className="h-1.5" />
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((step) => {
          const isDone = step.id < current;
          const isActive = step.id === current;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-1.5 shrink-0 text-xs transition-colors ${
                isActive
                  ? "text-foreground font-medium"
                  : isDone
                    ? "text-primary"
                    : "text-muted-foreground/50"
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center border text-[10px] font-semibold transition-colors ${
                  isDone
                    ? "bg-primary border-primary text-primary-foreground"
                    : isActive
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30 text-muted-foreground/50"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : step.id}
              </div>
              <span className="hidden sm:inline">{step.title}</span>
              {step.id < STEPS.length && (
                <div
                  className={`hidden sm:block h-px w-6 ${isDone ? "bg-primary" : "bg-border"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 1: Company Profile ──────────────────────────────────────────────────

interface Step1Data {
  company: string;
  industry: string;
  companySize: string;
}

function Step1({ data, onChange }: { data: Step1Data; onChange: (d: Partial<Step1Data>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ob-company">Company name</Label>
        <Input
          id="ob-company"
          value={data.company}
          onChange={(e) => onChange({ company: e.target.value })}
          placeholder="Acme Engineering Co."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Industry</Label>
        <Select value={data.industry} onValueChange={(v) => onChange({ industry: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select your industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Company size</Label>
        <Select value={data.companySize} onValueChange={(v) => onChange({ companySize: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Number of employees" />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s} employees
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Step 2: Your Role ────────────────────────────────────────────────────────

interface Step2Data {
  department: string;
  experience: string;
}

function Step2({
  role,
  data,
  onChange,
}: {
  role: string;
  data: Step2Data;
  onChange: (d: Partial<Step2Data>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Current role</Label>
        <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-muted/40">
          <Badge variant="secondary" className="text-xs">
            {role}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Set at signup — contact admin to change
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Department</Label>
        <Select value={data.department} onValueChange={(v) => onChange({ department: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select your department" />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Years of experience</Label>
        <Select value={data.experience} onValueChange={(v) => onChange({ experience: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select experience level" />
          </SelectTrigger>
          <SelectContent>
            {EXPERIENCE_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Step 3: Workspace Setup ──────────────────────────────────────────────────

interface Step3Data {
  discipline: string;
  notifyEmail: boolean;
  notifyInApp: boolean;
}

function Step3({ data, onChange }: { data: Step3Data; onChange: (d: Partial<Step3Data>) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Primary engineering discipline</Label>
        <Select value={data.discipline} onValueChange={(v) => onChange({ discipline: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select discipline" />
          </SelectTrigger>
          <SelectContent>
            {DISCIPLINES.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Notification preferences</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              checked={data.notifyEmail}
              onCheckedChange={(v) => onChange({ notifyEmail: !!v })}
            />
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">
                Receive updates about your projects and tasks
              </p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <Checkbox
              checked={data.notifyInApp}
              onCheckedChange={(v) => onChange({ notifyInApp: !!v })}
            />
            <div>
              <p className="text-sm font-medium">In-app notifications</p>
              <p className="text-xs text-muted-foreground">
                Real-time alerts while using ElectraFlow AI
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: First Project ────────────────────────────────────────────────────

interface Step4Data {
  projectName: string;
  projectType: string;
  projectCreated: boolean;
}

const PROJECT_TYPES = [
  "Electrical Design",
  "MEP Coordination",
  "Substation",
  "Power Distribution",
  "Lighting Design",
  "Fire Alarm",
  "Low Voltage Systems",
  "Other",
];

function Step4({
  data,
  onChange,
  onSkip,
}: {
  data: Step4Data;
  onChange: (d: Partial<Step4Data>) => void;
  onSkip: () => void;
}) {
  if (data.projectCreated) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <p className="font-semibold text-foreground">&ldquo;{data.projectName}&rdquo; created!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your first project is ready. You can add more details from the Projects page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Create your first project now, or skip and do it later from the Projects page.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="ob-proj">Project name</Label>
        <Input
          id="ob-proj"
          value={data.projectName}
          onChange={(e) => onChange({ projectName: e.target.value })}
          placeholder="e.g. Riyadh Office Complex – Electrical"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Project type</Label>
        <Select value={data.projectType} onValueChange={(v) => onChange({ projectType: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select project type" />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          className="flex-1"
          disabled={!data.projectName.trim()}
          onClick={() => {
            onChange({ projectCreated: true });
            toast.success(`Project "${data.projectName}" created!`);
          }}
        >
          <FolderPlus className="h-4 w-4 mr-2" />
          Create project
        </Button>
        <Button type="button" variant="outline" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

// ─── Step 5: Invite Team ──────────────────────────────────────────────────────

interface Step5Data {
  inviteEmails: [string, string, string];
  invitesSent: boolean;
}

function Step5({ data, onChange }: { data: Step5Data; onChange: (d: Partial<Step5Data>) => void }) {
  function updateEmail(idx: number, val: string) {
    const next = [...data.inviteEmails] as [string, string, string];
    next[idx] = val;
    onChange({ inviteEmails: next });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Invite colleagues to collaborate on your workspace. You can always invite more later from
        Settings.
      </p>

      {data.invitesSent ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
          <CheckCircle2 className="h-6 w-6 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Invitations sent!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your team members will receive an email shortly.
          </p>
        </div>
      ) : (
        <>
          {([0, 1, 2] as const).map((idx) => (
            <div key={idx} className="space-y-1.5">
              <Label htmlFor={`invite-${idx}`}>
                {idx === 0 ? "Team member email" : `Team member ${idx + 1} (optional)`}
              </Label>
              <Input
                id={`invite-${idx}`}
                type="email"
                value={data.inviteEmails[idx]}
                onChange={(e) => updateEmail(idx, e.target.value)}
                placeholder="colleague@company.com"
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!data.inviteEmails[0].trim()}
            onClick={() => {
              onChange({ invitesSent: true });
              const count = data.inviteEmails.filter((e) => e.trim()).length;
              toast.success(`${count} invitation${count !== 1 ? "s" : ""} sent!`);
            }}
          >
            <Users className="h-4 w-4 mr-2" />
            Send invitations
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Main onboarding page ─────────────────────────────────────────────────────

function OnboardingPage() {
  const navigate = useNavigate();
  const role = getStoredRole();
  const storedUser = getStoredUser();

  const [currentStep, setCurrentStep] = useState(1);

  // Per-step state
  const [step1, setStep1] = useState<Step1Data>({
    company: storedUser?.company || "",
    industry: "",
    companySize: "",
  });
  const [step2, setStep2] = useState<Step2Data>({ department: "", experience: "" });
  const [step3, setStep3] = useState<Step3Data>({
    discipline: "",
    notifyEmail: true,
    notifyInApp: true,
  });
  const [step4, setStep4] = useState<Step4Data>({
    projectName: "",
    projectType: "",
    projectCreated: false,
  });
  const [step5, setStep5] = useState<Step5Data>({
    inviteEmails: ["", "", ""],
    invitesSent: false,
  });

  const totalSteps = STEPS.length;
  const step = STEPS[currentStep - 1];
  const StepIcon = step.icon;

  function handleNext() {
    if (currentStep < totalSteps) {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    }
  }

  function handleComplete() {
    setOnboardingDone();
    // Persist onboardingDone in the registry so returning users aren't
    // redirected through onboarding again on future logins.
    const session = getStoredUser();
    if (session?.id) {
      updateRegisteredUser(session.id, { onboardingDone: true });
    }
    toast.success("Workspace ready! Welcome to ElectraFlow AI.");
    navigate({ to: getDefaultRoute(role), replace: true });
  }

  function handleSkipAll() {
    setOnboardingDone();
    navigate({ to: getDefaultRoute(role), replace: true });
  }

  const isLastStep = currentStep === totalSteps;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="shrink-0 border-b bg-card px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary grid place-items-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm">ElectraFlow AI</span>
        </div>
        <button
          type="button"
          onClick={handleSkipAll}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
        >
          Skip setup
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-xl space-y-8">
          {/* Greeting */}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {storedUser?.fullName
                ? `Welcome, ${storedUser.fullName.split(" ")[0]}!`
                : "Welcome to ElectraFlow AI!"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Let&apos;s get your workspace set up in a few quick steps.
            </p>
          </div>

          {/* Step indicator */}
          <StepIndicator current={currentStep} total={totalSteps} />

          {/* Step card */}
          <Card className="border shadow-sm">
            <CardContent className="p-6 space-y-6">
              {/* Step header */}
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <StepIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">{step.title}</h2>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>

              <div className="border-t" />

              {/* Step content */}
              {currentStep === 1 && (
                <Step1 data={step1} onChange={(d) => setStep1((s) => ({ ...s, ...d }))} />
              )}
              {currentStep === 2 && (
                <Step2
                  role={role || ""}
                  data={step2}
                  onChange={(d) => setStep2((s) => ({ ...s, ...d }))}
                />
              )}
              {currentStep === 3 && (
                <Step3 data={step3} onChange={(d) => setStep3((s) => ({ ...s, ...d }))} />
              )}
              {currentStep === 4 && (
                <Step4
                  data={step4}
                  onChange={(d) => setStep4((s) => ({ ...s, ...d }))}
                  onSkip={handleNext}
                />
              )}
              {currentStep === 5 && (
                <Step5 data={step5} onChange={(d) => setStep5((s) => ({ ...s, ...d }))} />
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="min-w-[100px]"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              {/* Skip step (steps 3, 4 only — step 5 has "Go to Dashboard") */}
              {(currentStep === 3 || currentStep === 4) && !step4.projectCreated && (
                <Button type="button" variant="ghost" size="sm" onClick={handleNext}>
                  Skip this step
                </Button>
              )}

              {isLastStep ? (
                <Button type="button" onClick={handleComplete} className="min-w-[160px]">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Button>
              ) : (
                <Button type="button" onClick={handleNext} className="min-w-[100px]">
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
