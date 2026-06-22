import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Plus,
  Paperclip,
  Send,
  MessageSquare,
  FileText,
  FileSearch,
  MailPlus,
  ClipboardList,
  AlertTriangle,
  FolderSearch,
  TrendingDown,
} from "lucide-react";
import { projects } from "@/lib/dummy-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ai")({
  head: () => ({ meta: [{ title: "AI Assistant — ElectraFlow AI" }] }),
  component: AI,
});

const history = [
  "Compare AHU-12 submittal vs spec",
  "Summarize Section 26 05 19",
  "Draft client status email — Riyadh Metro",
  "Identify missing documents for SUB-0148",
  "Predict budget overrun — Dubai Mall",
];

const prompts = [
  { i: FileText, t: "Summarize specifications" },
  { i: FileSearch, t: "Compare spec vs submittal" },
  { i: MessageSquare, t: "Generate review comments" },
  { i: MailPlus, t: "Generate client email" },
  { i: ClipboardList, t: "Generate meeting minutes" },
  { i: AlertTriangle, t: "Create an RFI" },
  { i: FolderSearch, t: "Identify missing documents" },
  { i: TrendingDown, t: "Predict budget overrun" },
];

type Msg = { role: "user" | "ai"; text: string };

function AI() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: "Hi, I'm ElectraFlow AI. Ask me about your projects, specs, submittals, financials or upload a document to analyze.",
    },
  ]);
  const [input, setInput] = useState("");

  const send = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setMsgs((m) => [
      ...m,
      { role: "user", text: t },
      {
        role: "ai",
        text: `Here is a draft response for: "${t}". (Demo output — connect your AI provider to generate real answers.)`,
      },
    ]);
    setInput("");
  };

  return (
    <div className="-m-6 h-[calc(100vh-3.5rem)] flex">
      <aside className="hidden md:flex w-72 shrink-0 flex-col border-r bg-card">
        <div className="p-3 border-b">
          <Button
            className="w-full"
            onClick={() => setMsgs([{ role: "ai", text: "New conversation started." }])}
          >
            <Plus className="h-4 w-4 mr-2" />
            New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-xs uppercase text-muted-foreground">History</div>
          {history.map((h, i) => (
            <button
              key={i}
              className="w-full text-left text-sm p-2 rounded-md hover:bg-muted truncate"
            >
              {h}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b flex items-center px-4 gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="font-semibold">AI Assistant</div>
          <div className="ml-auto flex gap-2">
            <Select defaultValue="gpt-4o">
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">ElectraFlow GPT-4o</SelectItem>
                <SelectItem value="claude">Claude 3.5 Sonnet</SelectItem>
                <SelectItem value="gemini">Gemini 2.5 Pro</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue={projects[0].id}>
              <SelectTrigger className="h-9 w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {msgs.length === 1 && (
              <Card className="p-6">
                <div className="text-sm font-semibold mb-3">Suggested prompts</div>
                <div className="grid grid-cols-2 gap-2">
                  {prompts.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => send(p.t)}
                      className="flex items-center gap-2 p-3 rounded-md border text-left hover:bg-muted text-sm"
                    >
                      <p.i className="h-4 w-4 text-primary shrink-0" />
                      <span>{p.t}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t p-3 bg-card">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <Button variant="outline" size="icon" onClick={() => toast.success("File attached")}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask ElectraFlow AI…"
              className="h-11"
            />
            <Button onClick={() => send()} className="h-11">
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
