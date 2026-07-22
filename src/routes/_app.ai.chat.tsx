/**
 * AI Chat — session list / empty state — Phase 15C
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AIBackendBanner } from "@/components/ai/AIBackendBanner";
import { ChatSidebar } from "@/components/ai/ChatSidebar";
import { SuggestedPrompts } from "@/components/ai/SuggestedPrompts";
import { ChatComposer } from "@/components/ai/ChatComposer";
import { useAuth } from "@/contexts/auth-context";
import { isAIReadOnly } from "@/types/ai-view";
import { ArrowLeft, Menu, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/ai/chat")({
  head: () => ({ meta: [{ title: "AI Chat — ElectraFlow AI" }] }),
  component: AIChatIndexPage,
});

function AIChatIndexPage() {
  const { role } = useAuth();
  const readOnly = isAIReadOnly(role);
  const [draft, setDraft] = useState("");

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="h-12 border-b flex items-center px-3 gap-2 shrink-0 bg-card">
        <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex">
          <Link to="/ai">
            <ArrowLeft className="h-4 w-4 mr-1" />
            AI Hub
          </Link>
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72">
            <ChatSidebar canManage={!readOnly} />
          </SheetContent>
        </Sheet>
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">AI Chat</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:flex">
          <ChatSidebar canManage={!readOnly} />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-3 border-b">
            <AIBackendBanner />
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <SuggestedPrompts onSelect={setDraft} />
              <p className="text-sm text-muted-foreground text-center">
                Select a prompt or start a new chat from the sidebar.
              </p>
            </div>
          </div>
          {!readOnly && (
            <ChatComposer
              onSend={async () => {
                /* composer disabled on index — user must create session first */
              }}
              disabled
            />
          )}
          {draft && (
            <p className="text-xs text-center text-muted-foreground pb-2">
              Prompt selected — create a new chat to send.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
