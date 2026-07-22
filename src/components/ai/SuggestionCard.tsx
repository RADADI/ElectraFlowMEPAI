/**
 * AI suggestion card — Phase 15C
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeMarkdown } from "@/lib/safe-markdown";
import { SUGGESTION_STATUS_LABEL, SUGGESTION_TYPE_LABEL } from "@/types/ai-view";
import type { AISuggestionView } from "@/types/ai-view";
import { Check, X, EyeOff } from "lucide-react";

interface SuggestionCardProps {
  suggestion: AISuggestionView;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onDismiss?: (id: string) => void;
  isPending?: boolean;
}

export function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onDismiss,
  isPending,
}: SuggestionCardProps) {
  const terminal = suggestion.status !== "pending";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{suggestion.title}</CardTitle>
          <Badge variant="outline">{SUGGESTION_TYPE_LABEL[suggestion.suggestion_type]}</Badge>
          <Badge variant={suggestion.status === "pending" ? "default" : "secondary"}>
            {SUGGESTION_STATUS_LABEL[suggestion.status]}
          </Badge>
          {!suggestion.created_by_ai && <Badge variant="outline">Manual</Badge>}
        </div>
        {suggestion.confidence != null && (
          <p className="text-xs text-muted-foreground">
            Confidence: {Math.round(suggestion.confidence * 100)}%
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <SafeMarkdown content={suggestion.content} className="text-sm text-muted-foreground" />
        {suggestion.can_review && !terminal && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onAccept?.(suggestion.id)} disabled={isPending}>
              <Check className="h-4 w-4 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject?.(suggestion.id)}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDismiss?.(suggestion.id)}
              disabled={isPending}
            >
              <EyeOff className="h-4 w-4 mr-1" />
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
