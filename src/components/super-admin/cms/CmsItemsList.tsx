import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical, Loader2 } from "lucide-react";

interface Column<T> {
  header: string;
  className?: string;
  render: (item: T, index: number) => ReactNode;
}

interface ItemsListProps<T> {
  title: string;
  icon?: ReactNode;
  items: T[];
  columns: Column<T>[];
  newItemFactory: () => T;
  renderEditor: (item: T, setItem: (i: T) => void) => ReactNode;
  validateItem?: (item: T) => string | null;
  onAdd: (item: T) => Promise<void> | void;
  onUpdate: (index: number, item: T) => Promise<void> | void;
  onDelete: (index: number) => Promise<void> | void;
  /** Optional. When provided, enables drag-and-drop reordering. Receives the new array. */
  onReorder?: (next: T[]) => Promise<void> | void;
  addLabel?: string;
  itemLabel?: string;
  emptyMessage?: string;
}

export function CmsItemsList<T>({
  title, icon, items, columns, newItemFactory, renderEditor, validateItem,
  onAdd, onUpdate, onDelete, onReorder, addLabel = "Add Item", itemLabel = "item",
  emptyMessage = "No items yet. Click Add to create one.",
}: ItemsListProps<T>) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDrop = async (target: number) => {
    if (!onReorder || dragIdx === null || dragIdx === target) {
      setDragIdx(null); setOverIdx(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target, 0, moved);
    setDragIdx(null); setOverIdx(null);
    await onReorder(next);
  };

  const openAdd = () => { setDraft(newItemFactory()); setEditIndex(-1); };
  const openEdit = (i: number) => { setDraft({ ...items[i] }); setEditIndex(i); };
  const close = () => { setEditIndex(null); setDraft(null); };

  const handleSave = async () => {
    if (!draft || editIndex === null) return;
    if (validateItem) {
      const err = validateItem(draft);
      if (err) { import("sonner").then(({ toast }) => toast.error(err)); return; }
    }
    setSaving(true);
    try {
      if (editIndex === -1) await onAdd(draft);
      else await onUpdate(editIndex, draft);
      close();
    } finally { setSaving(false); }
  };

  const handleConfirmDelete = async () => {
    if (deleteIdx === null) return;
    setDeleting(true);
    try { await onDelete(deleteIdx); setDeleteIdx(null); } finally { setDeleting(false); }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
            <Badge variant="outline" className="ml-1 text-[10px]">{items.length} items</Badge>
          </CardTitle>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" /> {addLabel}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                {columns.map((c, i) => (
                  <TableHead key={i} className={c.className}>{c.header}</TableHead>
                ))}
                <TableHead className="text-right w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 2} className="text-center py-10 text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : items.map((item, i) => (
                <TableRow
                  key={i}
                  draggable={!!onReorder}
                  onDragStart={onReorder ? (e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; } : undefined}
                  onDragOver={onReorder ? (e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); } : undefined}
                  onDragLeave={onReorder ? () => { if (overIdx === i) setOverIdx(null); } : undefined}
                  onDrop={onReorder ? (e) => { e.preventDefault(); handleDrop(i); } : undefined}
                  onDragEnd={onReorder ? () => { setDragIdx(null); setOverIdx(null); } : undefined}
                  className={
                    (onReorder ? "cursor-move " : "") +
                    (dragIdx === i ? "opacity-50 " : "") +
                    (overIdx === i && dragIdx !== null && dragIdx !== i ? "bg-primary/5 outline outline-1 outline-primary/30 " : "")
                  }
                >
                  <TableCell className="text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <GripVertical className={`h-3.5 w-3.5 ${onReorder ? "text-muted-foreground" : "text-muted-foreground/50"}`} />
                      {i + 1}
                    </div>
                  </TableCell>
                  {columns.map((c, ci) => (
                    <TableCell key={ci} className={c.className}>{c.render(item, i)}</TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(i)}>Edit</Button>
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setDeleteIdx(i)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editIndex !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editIndex === -1 ? `Add ${itemLabel}` : `Edit ${itemLabel}`}</DialogTitle>
          </DialogHeader>
          {draft && renderEditor(draft, setDraft)}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editIndex === -1 ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteIdx !== null} onOpenChange={(o) => !o && setDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {itemLabel}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
