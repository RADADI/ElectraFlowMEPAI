import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileBarChart, FileText, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — ElectraFlow AI" }] }),
  component: Reports,
});

const reports = [
  {
    name: "Submittal Review Report",
    desc: "AI-generated review actions, comments and signatures.",
  },
  { name: "Project Status Report", desc: "Progress, milestones, risks across selected projects." },
  { name: "Financial Report", desc: "Revenue, costs, AR/AP, profit & cash flow." },
  { name: "Resource Utilization Report", desc: "Engineer allocation and hiring recommendations." },
  { name: "Employee Performance Report", desc: "KPIs, training, certifications and reviews." },
  { name: "Forecast Report", desc: "3 / 6 / 12 / 24 month projections." },
];

function Reports() {
  return (
    <>
      <PageHeader title="Reports" subtitle="Generate standard reports as PDF, DOCX or Excel." />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reports.map((r) => (
          <Card key={r.name} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 text-primary grid place-items-center">
                <FileBarChart className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{r.name}</div>
                <div className="text-sm text-muted-foreground">{r.desc}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => toast.success("PDF exported")}
              >
                <FileText className="h-4 w-4 mr-1" />
                PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => toast.success("DOCX exported")}
              >
                <Download className="h-4 w-4 mr-1" />
                DOCX
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => toast.success("Excel exported")}
              >
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Excel
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
