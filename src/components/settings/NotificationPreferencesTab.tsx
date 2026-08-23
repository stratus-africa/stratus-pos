import { useEffect, useState } from "react";
import { Bell, MessageCircle, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { areNotificationTonesEnabled, setNotificationTonesEnabled } from "@/lib/notificationTone";

type Preferences = {
  receipt_delivery: "whatsapp" | "sms" | "none";
  subscription_reminders: boolean;
  whats_new_frequency: "every_release" | "weekly" | "never";
};

const defaults: Preferences = {
  receipt_delivery: "whatsapp",
  subscription_reminders: true,
  whats_new_frequency: "every_release",
};

export function NotificationPreferencesTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notificationTones, setNotificationTones] = useState(() => areNotificationTonesEnabled());

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("user_notification_preferences")
        .select("receipt_delivery, subscription_reminders, whats_new_frequency")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) setPrefs({ ...defaults, ...data });
      setLoading(false);
    })();
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await (supabase as any).from("user_notification_preferences").upsert({
      user_id: user.id,
      ...prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Notification preferences saved");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
        <CardDescription>Choose how and when you want to hear from StratusPOS.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Receipt delivery</Label>
          <Select value={prefs.receipt_delivery} onValueChange={(value) => setPrefs({ ...prefs, receipt_delivery: value as Preferences["receipt_delivery"] })} disabled={loading}>
            <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp receipt</SelectItem>
              <SelectItem value="sms">SMS receipt</SelectItem>
              <SelectItem value="none">Do not send receipts</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Applied to receipts you send from this account.</p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div><Label className="text-base">Subscription reminders</Label><p className="text-sm text-muted-foreground">Let us remind you before your plan expires.</p></div>
          <Switch checked={prefs.subscription_reminders} onCheckedChange={(checked) => setPrefs({ ...prefs, subscription_reminders: checked })} disabled={loading} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label className="text-base">Notification tones</Label>
            <p className="text-sm text-muted-foreground">Play a short sound when a new StratusPOS notification arrives.</p>
          </div>
          <Switch
            checked={notificationTones}
            onCheckedChange={(checked) => {
              setNotificationTones(checked);
              setNotificationTonesEnabled(checked);
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>What's New frequency</Label>
          <Select value={prefs.whats_new_frequency} onValueChange={(value) => setPrefs({ ...prefs, whats_new_frequency: value as Preferences["whats_new_frequency"] })} disabled={loading}>
            <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="every_release">Every release</SelectItem>
              <SelectItem value="weekly">At most once a week</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={save} disabled={loading || saving}>{saving ? "Saving…" : <><Save className="mr-2 h-4 w-4" /> Save preferences</>}</Button>
      </CardContent>
    </Card>
  );
}
