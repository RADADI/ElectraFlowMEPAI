import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { documents, statusColor } from "@/lib/dummy-data";
import { Upload, Folder, Download, Replace, Trash2, FileText, FileSpreadsheet, FileImage, FileArchive, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/documents")({
  head: () => ({ meta: [{ title: "Document Center — MEPFlow AI" }] }),
  component: DocumentsPage,
});

const folders = [
  { name: "Riyadh Metro", count: 124 }, { name: "NEOM Hotel", count: 87 },
  { name: "Dubai Mall", count: 213 }, { name: "Aramco HQ", count: 56 },
  { name: "King Salman Park", count: 41 }, { name: "Jeddah Airport", count: 78 },
];

const typeIcon = (t: string) => {
  if (["PDF","DOCX"].includes(t)) return FileText;
  if (t === "XLSX") return FileSpreadsheet;
  if (["JPG","PNG"].includes(t)) return FileImage;
  if (t === "ZIP") return FileArchive;
  return FileText;
};

function DocumentsPage() {
  const [drag, setDrag] = useState(false);
  const [selected, setSelected] = useState(documents[0]);

  return (
    <>
      <PageHeader title="Document Center" subtitle="Drawings, specifications and project files." actions={
        <Button><Upload className="h-4 w-4 mr-2" />Upload</Button>
      } />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Folders</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {folders.map(f => (
              <button key={f.name} className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm text-left">
                <Folder className="h-4 w-4 text-primary" />
                <span className="flex-1 truncate">{f.name}</span>
                <Badge variant="outline" className="text-xs">{f.count}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="col-span-12 lg:col-span-6 space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); toast.success(`${e.dataTransfer.files.length || 1} file(s) uploaded`); }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${drag ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <div className="font-medium">Drop files here, or click to upload</div>
            <div className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, DWG, ZIP, JPG, PNG · Max 250 MB</div>
          </div>

          <Card>
            <CardContent className="p-3">
              <div className="relative mb-3">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search files…" className="pl-9" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground"><tr className="border-b">{["File","Project","Disc.","Ver","Uploaded","Date","Status","Actions"].map(h => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {documents.map(d => {
                      const Icon = typeIcon(d.type);
                      return (
                        <tr key={d.id} className={`border-b last:border-0 cursor-pointer ${selected.id === d.id ? "bg-muted/50" : "hover:bg-muted/30"}`} onClick={() => setSelected(d)}>
                          <td className="py-2 px-2"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><span className="font-medium">{d.name}</span></div></td>
                          <td className="py-2 px-2">{d.project}</td>
                          <td className="py-2 px-2">{d.discipline}</td>
                          <td className="py-2 px-2 font-mono text-xs">{d.version}</td>
                          <td className="py-2 px-2">{d.uploader}</td>
                          <td className="py-2 px-2 whitespace-nowrap">{d.date}</td>
                          <td className="py-2 px-2"><Badge variant="outline" className={statusColor[d.status]}>{d.status}</Badge></td>
                          <td className="py-2 px-2"><div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); toast.success("Downloaded"); }}><Download className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); toast.info("Replace"); }}><Replace className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); toast.error("Deleted"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="col-span-12 lg:col-span-3">
          <CardHeader><CardTitle className="text-base">File Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-[3/4] rounded-md border bg-muted/30 grid place-items-center text-muted-foreground"><FileText className="h-10 w-10" /></div>
            <div>
              <div className="font-semibold truncate">{selected.name}</div>
              <div className="text-xs text-muted-foreground">{selected.project} · {selected.size}</div>
            </div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-medium">{selected.version}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{selected.type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Uploaded</span><span className="font-medium">{selected.date}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">By</span><span className="font-medium">{selected.uploader}</span></div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-2">Version history</div>
              <div className="space-y-1.5 text-xs">
                {["v3.2 — Sara Khan · 2d ago","v3.1 — Sara Khan · 1w ago","v3.0 — John Doe · 2w ago","v2.0 — Sara Khan · 1mo ago"].map(v =>
                  <div key={v} className="flex items-center justify-between p-1.5 rounded hover:bg-muted"><span>{v}</span><Button size="sm" variant="ghost" className="h-6">Restore</Button></div>)}
              </div>
            </div>
            <Button className="w-full"><Download className="h-4 w-4 mr-2" />Download</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
