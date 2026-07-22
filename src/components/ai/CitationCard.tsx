/**
 * Citation card — Phase 15C
 */

import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import type { ChatCitation } from "@/types/ai-view";

interface CitationCardProps {
  citation: ChatCitation;
}

export function CitationCard({ citation }: CitationCardProps) {
  return (
    <Card className="text-sm">
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{citation.document_title ?? "Document"}</span>
          <Badge variant="outline" className="text-xs">
            Chunk {citation.chunk_index + 1}
          </Badge>
          {citation.is_stale && (
            <Badge variant="secondary" className="text-xs">
              Stale
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs line-clamp-3">{citation.excerpt}</p>
        <Link
          to="/documents/$id"
          params={{ id: citation.document_id }}
          className="text-xs text-primary hover:underline"
        >
          View document
        </Link>
      </CardContent>
    </Card>
  );
}
