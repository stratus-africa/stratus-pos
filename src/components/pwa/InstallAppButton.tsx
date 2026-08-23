import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, ExternalLink, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallAppButtonProps {
  children?: ReactNode;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  icon?: "download" | "smartphone" | "none";
  hideWhenUnavailable?: boolean;
  onInstallResult?: (result: { outcome: "accepted" | "dismissed"; platform: string }) => void;
}

const isStandalone = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
};

const isIos = () => {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

const isSafari = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|android|crios|fxios|edgios/i.test(ua);
};

export function InstallAppButton({
  children = "Install App",
  className,
  variant = "default",
  size = "default",
  icon = "download",
  hideWhenUnavailable = false,
  onInstallResult,
}: InstallAppButtonProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const device = useMemo(() => {
    if (typeof navigator === "undefined") return "other";
    if (isIos() && isSafari()) return "ios-safari";
    if (/android/i.test(navigator.userAgent)) return "android";
    return "other";
  }, []);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
      setInstructionsOpen(false);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt || installing) {
      if (!installPrompt && !hideWhenUnavailable) setInstructionsOpen(true);
      return;
    }
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      onInstallResult?.(result);
      if (result.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  }, [installPrompt, installing, hideWhenUnavailable, onInstallResult]);

  if (installed) return null;
  if (!installPrompt && hideWhenUnavailable) return null;

  const Icon = icon === "smartphone" ? Smartphone : icon === "none" ? null : Download;

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={handleInstall} disabled={installing}>
        {Icon && <Icon className="mr-2 h-4 w-4" />}
        {installing ? "Installing…" : children}
      </Button>

      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Install StratusPOS
            </DialogTitle>
            <DialogDescription>
              {device === "ios-safari"
                ? "Safari on iPhone and iPad does not expose the automatic install prompt. Add StratusPOS to your Home Screen instead."
                : "Your browser does not expose the automatic install prompt. Use the browser's Install or Add to Home Screen option."}
            </DialogDescription>
          </DialogHeader>
          {device === "ios-safari" ? (
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li><strong>1.</strong> Tap the <span className="font-medium text-foreground">Share</span> button in Safari.</li>
              <li><strong>2.</strong> Select <span className="font-medium text-foreground">Add to Home Screen</span>.</li>
              <li><strong>3.</strong> Tap <span className="font-medium text-foreground">Add</span>.</li>
            </ol>
          ) : (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Open your browser menu and choose <span className="font-medium text-foreground">Install StratusPOS</span> or <span className="font-medium text-foreground">Add to Home Screen</span>.</p>
              <p className="flex items-center gap-1"><ExternalLink className="h-4 w-4" /> The exact wording depends on your browser.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default InstallAppButton;
