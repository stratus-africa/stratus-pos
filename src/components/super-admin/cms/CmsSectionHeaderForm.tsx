import { ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  initialTitle: string;
  initialSubtitle: string;
  initialVisible: boolean;
  visibleLabel: string;
  titleLabel?: string;
  subtitleLabel?: string;
  subtitleAsTextarea?: boolean;
  extra?: ReactNode;
  onSave: (values: { title: string; subtitle: string; is_visible: boolean }) => Promise<void> | void;
}

export function CmsSectionHeaderForm({
  initialTitle, initialSubtitle, initialVisible, visibleLabel,
  titleLabel = "Section title", subtitleLabel = "Section subtitle",
  subtitleAsTextarea, extra, onSave,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [visible, setVisible] = useState(initialVisible);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Section title is required"); return; }
    setSaving(true);
    try { await onSave({ title, subtitle, is_visible: visible }); toast.success("Section saved"); }
    catch (e: any) { toast.error("Failed to save: " + (e?.message || "unknown")); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4" /> Section header
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{titleLabel}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{subtitleLabel}</Label>
            {subtitleAsTextarea ? (
              <Textarea rows={2} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            ) : (
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            )}
          </div>
        </div>

        {extra}

        <div className="flex items-center gap-2 pt-1">
          <Checkbox id="sec-visible" checked={visible} onCheckedChange={(c) => setVisible(!!c)} />
          <Label htmlFor="sec-visible" className="cursor-pointer">{visibleLabel}</Label>
        </div>

        <div className="border-t pt-4">
          <Button onClick={handleSave} disabled={saving} variant="secondary">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save section
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
