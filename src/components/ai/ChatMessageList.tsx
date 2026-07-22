/**
 * Chat message list with safe markdown — Phase 15C
 */

import { useEffect, useRef } from "react";
import { SafeMarkdown } from "@/lib/safe-markdown";
import { CitationCard } from "@/components/ai/CitationCard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";
import type { ChatMessageView } from "@/types/ai-view";

interface ChatMessageListProps {
  messages: ChatMessageView[];
  isSending?: boolean;
}

const COLLAPSE_LINES = 20;

export function ChatMessageList({ messages, isSending }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isSending]);

  if (messages.length === 0 && !isSending) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
        <p className="text-sm">No messages yet. Send a question to start.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isSending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageView }) {
  const isUser = message.role === "user";
  const isLong = message.content.split("\n").length > COLLAPSE_LINES;

  const body = (
    <SafeMarkdown
      content={message.content}
      className="text-sm"
      collapseAfterLines={isLong ? COLLAPSE_LINES : undefined}
    />
  );

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isLong && !isUser ? (
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-1 mb-1 -ml-1">
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                Expand message
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>{body}</CollapsibleContent>
          </Collapsible>
        ) : (
          body
        )}
        {!isUser && message.citations.length > 0 && (
          <div className="mt-3 space-y-2 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">Sources</p>
            {message.citations.map((c, i) => (
              <CitationCard key={`${c.chunk_id}-${i}`} citation={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
