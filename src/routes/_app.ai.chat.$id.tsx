/**
 * AI Chat session detail — Phase 15C
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { AIBackendBanner } from "@/components/ai/AIBackendBanner";
import { ChatSidebar } from "@/components/ai/ChatSidebar";
import { ChatMessageList } from "@/components/ai/ChatMessageList";
import { ChatComposer } from "@/components/ai/ChatComposer";
import { SuggestedPrompts } from "@/components/ai/SuggestedPrompts";
import { useChatSession, useMessages, useSendMessage } from "@/hooks/api/useAI";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft, Menu, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ai/chat/$id")({
  head: () => ({ meta: [{ title: "Chat — ElectraFlow AI" }] }),
  component: AIChatDetailPage,
});

function AIChatDetailPage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const sessionQuery = useChatSession(id);
  const messagesQuery = useMessages(id);
  const sendMut = useSendMessage(id);
  const [composerDraft, setComposerDraft] = useState("");

  const session = sessionQuery.data?.data;

  const messages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    const all = pages.flatMap((p) => p.data?.items ?? []);
    return [...all].reverse();
  }, [messagesQuery.data]);

  if (sessionQuery.isLoading) {
    return <Skeleton className="h-64 w-full m-6" />;
  }

  if (sessionQuery.isError || !session) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Chat not found"
        description="This session may have been deleted or you don't have access."
        action={
          <Button variant="outline" asChild>
            <Link to="/ai/chat">Back to chat</Link>
          </Button>
        }
      />
    );
  }

  async function handleSend(content: string) {
    const text = content.trim() || composerDraft.trim();
    if (!text) return;
    setComposerDraft("");
    const res = await sendMut.mutateAsync(text);
    if (res.error) toast.error(res.error.message);
  }

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
            <ChatSidebar activeId={id} canManage={session.can_send} />
          </SheetContent>
        </Sheet>
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-sm truncate">{session.title}</span>
        {session.is_read_only && (
          <span className="text-xs text-muted-foreground ml-auto">Read-only</span>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:flex">
          <ChatSidebar activeId={id} canManage={session.can_send} />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-3 border-b shrink-0">
            <AIBackendBanner onRetry={() => sessionQuery.refetch()} />
          </div>

          {messages.length === 0 && session.can_send && (
            <div className="p-4 max-w-3xl mx-auto w-full">
              <SuggestedPrompts onSelect={setComposerDraft} />
            </div>
          )}

          {messagesQuery.isLoading ? (
            <Skeleton className="flex-1 m-4" />
          ) : (
            <ChatMessageList messages={messages} isSending={sendMut.isPending} />
          )}

          {messagesQuery.hasNextPage && (
            <div className="text-center py-2">
              <Button variant="ghost" size="sm" onClick={() => messagesQuery.fetchNextPage()}>
                Load older messages
              </Button>
            </div>
          )}

          {session.can_send ? (
            <ChatComposer
              onSend={handleSend}
              isPending={sendMut.isPending}
              disabled={session.is_read_only}
              initialValue={composerDraft}
            />
          ) : (
            <div className="border-t p-3 text-center text-sm text-muted-foreground bg-card">
              You cannot send messages in this session.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
