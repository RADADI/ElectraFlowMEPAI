/**
 * Chat composer — Phase 15C
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface ChatComposerProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  isPending?: boolean;
  initialValue?: string;
}

export function ChatComposer({ onSend, disabled, isPending, initialValue }: ChatComposerProps) {
  const [input, setInput] = useState("");

  useEffect(() => {
    if (initialValue) setInput(initialValue);
  }, [initialValue]);

  async function handleSend() {
    const text = input.trim();
    if (!text || disabled || isPending) return;
    setInput("");
    await onSend(text);
  }

  return (
    <div className="border-t p-3 bg-card">
      <div className="max-w-3xl mx-auto flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask a question…"
          className="min-h-[44px] max-h-32 resize-none"
          disabled={disabled || isPending}
          rows={1}
        />
        <Button
          onClick={() => void handleSend()}
          disabled={disabled || isPending || !input.trim()}
          className="shrink-0"
        >
          <Send className="h-4 w-4 mr-2" />
          Send
        </Button>
      </div>
    </div>
  );
}
