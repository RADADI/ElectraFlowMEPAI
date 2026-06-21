import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ROLES, DISCIPLINES, ACTION_CODES } from "@/lib/dummy-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — MEPFlow AI" }] }),
  component: SettingsPage,
});

const users = [
  { n: "Ahmed Hassan", e: "ahmed@acme.eng", r: "Admin", s: "Active" },
  { n: "Linda Park", e: "linda@acme.eng", r: "Project Manager", s: "Active" },
  { n: "Sara Khan", e: "sara@acme.eng", r: "Senior Engineer", s: "Active" },
  { n: "Hassan Ali", e: "hassan@acme.eng", r: "Electrical Engineer", s: "Invited" },
];
const perms = ["View projects","Edit projects","Approve submittals","Generate reports","Manage users","Access financials"];

function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Administer users, roles, templates and company settings." />
      <Tabs defaultValue="users">
        <TabsList className="mb-4 flex-wrap h-auto">
          {["users","roles","permissions","disciplines","actions","email","reports","company","audit"].map(t => (
            <TabsTrigger key={t} value={t} className="capitalize">{t === "email" ? "Email Templates" : t === "actions" ? "Action Codes" : t === "reports" ? "Report Templates" : t === "audit" ? "Audit Logs" : t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="users">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["Name","Email","Role","Status",""].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{users.map(u => <tr key={u.e} className="border-t"><td className="py-2.5 px-3 font-medium">{u.n}</td><td className="py-2.5 px-3">{u.e}</td><td className="py-2.5 px-3">{u.r}</td><td className="py-2.5 px-3"><Badge variant="outline">{u.s}</Badge></td><td className="py-2.5 px-3"><Button size="sm" variant="ghost">Edit</Button></td></tr>)}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card><CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
            {ROLES.map(r => <div key={r} className="p-3 border rounded-md flex items-center justify-between"><span>{r}</span><Badge variant="outline">System</Badge></div>)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="permissions">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground"><tr><th className="py-2.5 px-3 font-medium">Permission</th>{ROLES.slice(0,5).map(r => <th key={r} className="py-2.5 px-3 font-medium text-center">{r}</th>)}</tr></thead>
              <tbody>{perms.map(p => <tr key={p} className="border-t"><td className="py-2.5 px-3 font-medium">{p}</td>{ROLES.slice(0,5).map(r => <td key={r} className="py-2.5 px-3 text-center"><Switch defaultChecked={r === "Admin" || (p.startsWith("View") && true)} /></td>)}</tr>)}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="disciplines">
          <Card><CardContent className="p-4 space-y-2">
            {DISCIPLINES.map(d => <div key={d} className="p-3 border rounded-md flex items-center justify-between"><span>{d}</span><Switch defaultChecked /></div>)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card><CardContent className="p-4 space-y-2">
            {ACTION_CODES.map(a => <div key={a} className="p-3 border rounded-md flex items-center justify-between"><span className="font-mono">{a}</span><Button size="sm" variant="ghost">Edit</Button></div>)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="email">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {["Submittal Review Complete","RFI Issued","Weekly Project Status","Client Approval Request"].map(t => <div key={t} className="p-3 border rounded-md"><div className="font-medium">{t}</div><div className="text-xs text-muted-foreground">Last edited 2 weeks ago</div></div>)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {["Default Submittal Report","Executive Monthly Report","Resource Forecast Report"].map(t => <div key={t} className="p-3 border rounded-md"><div className="font-medium">{t}</div><div className="text-xs text-muted-foreground">PDF · DOCX</div></div>)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="company">
          <Card>
            <CardHeader><CardTitle className="text-base">Company Settings</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Company name</Label><Input defaultValue="Acme Engineering Co." /></div>
              <div className="space-y-1.5"><Label>Currency</Label><Input defaultValue="USD" /></div>
              <div className="space-y-1.5"><Label>Time zone</Label><Input defaultValue="Asia/Riyadh" /></div>
              <div className="space-y-1.5 col-span-2"><Label>Address</Label><Textarea defaultValue="King Fahd Road, Riyadh, KSA" /></div>
              <div className="col-span-2"><Button onClick={() => toast.success("Settings saved")}>Save changes</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["Time","User","Action","Target"].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{[
                { t: "2025-06-24 10:14", u: "Ahmed H.", a: "Approved submittal", g: "SUB-2025-0148" },
                { t: "2025-06-24 09:02", u: "Linda P.", a: "Created project", g: "MEP-2025-012" },
                { t: "2025-06-23 17:30", u: "Sara K.", a: "Edited document", g: "v3.2 — Electrical Spec" },
                { t: "2025-06-23 16:11", u: "System", a: "Daily backup", g: "OK" },
              ].map((r,i) => <tr key={i} className="border-t"><td className="py-2.5 px-3 font-mono text-xs">{r.t}</td><td className="py-2.5 px-3">{r.u}</td><td className="py-2.5 px-3">{r.a}</td><td className="py-2.5 px-3">{r.g}</td></tr>)}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
