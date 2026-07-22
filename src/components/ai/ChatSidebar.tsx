/**
 * Chat session sidebar — Phase 15C
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useChatSessions,
  useCreateChatSession,
  useDeleteChatSession,
  useRenameChatSession,
} from "@/hooks/api/useAI";
import { Plus, Pencil, Trash2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ChatSessionListItemView } from "@/types/ai-view";

interface ChatSidebarProps {
  activeId?: string;
  canManage?: boolean;
}

export function ChatSidebar({ activeId, canManage = true }: ChatSidebarProps) {
  const navigate = useNavigate();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useChatSessions();
  const createMut = useCreateChatSession();
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sessions = data?.pages.flatMap((p) => p.data?.items ?? []) ?? [];

  async function handleNewChat() {
    const res = await createMut.mutateAsync({ title: "New chat" });
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    if (res.data) {
      void navigate({ to: "/ai/chat/$id", params: { id: res.data.id } });
    }
  }

  return (
    <aside className="flex flex-col h-full border-r bg-card w-full md:w-72 shrink-0">
      <div className="p-3 border-b">
        {canManage && (
          <Button
            className="w-full"
            onClick={() => void handleNewChat()}
            disabled={createMut.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            New chat
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-xs uppercase text-muted-foreground">Recent</div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-4">No conversations yet.</p>
        ) : (
          sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === activeId}
              canManage={canManage}
              onRename={() => {
                setRenameId(s.id);
                setRenameTitle(s.title);
              }}
              onDelete={() => setDeleteId(s.id)}
            />
          ))
        )}
        {hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            Load more
          </Button>
        )}
      </div>

      {renameId && (
        <RenameSessionDialog
          sessionId={renameId}
          initialTitle={renameTitle}
          open={!!renameId}
          onOpenChange={(o) => !o && setRenameId(null)}
        />
      )}

      {deleteId && (
        <DeleteSessionDialog
          sessionId={deleteId}
          open={!!deleteId}
          onOpenChange={(o) => !o && setDeleteId(null)}
          onDeleted={() => {
            if (activeId === deleteId) void navigate({ to: "/ai/chat" });
            setDeleteId(null);
          }}
        />
      )}
    </aside>
  );
}

function SessionRow({
  session,
  active,
  canManage,
  onRename,
  onDelete,
}: {
  session: ChatSessionListItemView;
  active: boolean;
  canManage: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1 rounded-md ${active ? "bg-muted" : "hover:bg-muted/60"}`}
    >
      <Link
        to="/ai/chat/$id"
        params={{ id: session.id }}
        className="flex-1 flex items-center gap-2 p-2 text-sm min-w-0"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{session.title}</span>
      </Link>
      {canManage && (
        <div className="flex opacity-0 group-hover:opacity-100 pr-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRename}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function RenameSessionDialog({
  sessionId,
  initialTitle,
  open,
  onOpenChange,
}: {
  sessionId: string;
  initialTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const renameMut = useRenameChatSession(sessionId);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rename chat</AlertDialogTitle>
        </AlertDialogHeader>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              const res = await renameMut.mutateAsync(title.trim() || "Untitled chat");
              if (res.error) toast.error(res.error.message);
              else toast.success("Renamed");
              onOpenChange(false);
            }}
          >
            Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteSessionDialog({
  sessionId,
  open,
  onOpenChange,
  onDeleted,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const deleteMut = useDeleteChatSession(sessionId);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This conversation will be removed from your list. Messages are retained for audit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async () => {
              const res = await deleteMut.mutateAsync();
              if (res.error) toast.error(res.error.message);
              else {
                toast.success("Chat deleted");
                onDeleted();
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
