/**
 * Manual suggestion modal — Phase 15C
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AISuggestionCreateInput, AISuggestionType } from "@/types/ai-view";
import { SUGGESTION_TYPE_LABEL } from "@/types/ai-view";
import { Loader2 } from "lucide-react";

const TYPES = Object.keys(SUGGESTION_TYPE_LABEL) as AISuggestionType[];

interface ManualSuggestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AISuggestionCreateInput) => Promise<void>;
  isPending?: boolean;
}

export function ManualSuggestionModal({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: ManualSuggestionModalProps) {
  const [suggestionType, setSuggestionType] = useState<AISuggestionType>("document_summary");
  const [entityType, setEntityType] = useState("document");
  const [entityId, setEntityId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function handleSubmit() {
    if (!title.trim() || !content.trim() || !entityId.trim()) return;
    await onSubmit({
      suggestion_type: suggestionType,
      entity_type: entityType,
      entity_id: entityId.trim(),
      title: title.trim(),
      content: content.trim(),
      created_by_ai: false,
    });
    setTitle("");
    setContent("");
    setEntityId("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create manual suggestion</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select
              value={suggestionType}
              onValueChange={(v) => setSuggestionType(v as AISuggestionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {SUGGESTION_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Entity type</Label>
              <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} />
            </div>
            <div>
              <Label>Entity ID</Label>
              <Input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="UUID"
              />
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Content</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
