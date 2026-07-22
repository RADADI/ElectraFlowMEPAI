/**
 * Suggested prompts — Phase 15C (fills composer only, never auto-replies)
 */

import { Card } from "@/components/ui/card";
import {
  FileText,
  FileSearch,
  MessageSquare,
  MailPlus,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";

const PROMPTS = [
  { icon: FileText, text: "Summarize specifications for this project" },
  { icon: FileSearch, text: "Compare spec vs submittal requirements" },
  { icon: MessageSquare, text: "Generate review comments for submittal" },
  { icon: MailPlus, text: "Draft client status email" },
  { icon: ClipboardList, text: "Summarize recent meeting action items" },
  { icon: AlertTriangle, text: "List open RFIs for this project" },
];

interface SuggestedPromptsProps {
  onSelect: (text: string) => void;
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <Card className="p-4 md:p-6">
      <p className="text-sm font-semibold mb-3">Suggested prompts</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PROMPTS.map(({ icon: Icon, text }) => (
          <button
            key={text}
            type="button"
            onClick={() => onSelect(text)}
            className="flex items-center gap-2 p-3 rounded-md border text-left hover:bg-muted text-sm transition-colors"
          >
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <span>{text}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
