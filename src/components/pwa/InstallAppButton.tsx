import { useCallback, useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface InstallAppButtonProps {
  /** Text shown on the button. */
  children?: React.ReactNode;
  /** Optional className passed to the Button. */
  className?: string;
  /** Button variant from the project's shadcn Button component. */
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  /** Button size from the project's shadcn Button component. */
  size?: "default" | "sm" | "lg" | "icon";
  /** Icon displayed before the label. */
  icon?: "download" | "smartphone" | "none";
  /** Hide the component when the browser cannot currently offer installation. */
  hideWhenUnavailable?: boolean;
  /** Called after the user accepts or dismisses the install prompt. */
  onInstallResult?: (result: {
    outcome: "accepted" | "dismissed";
    platform: string;
  }) => void;
}

const isStandalone = () => {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

export function InstallAppButton({
  children = "Install App",
  className,
  variant = "default",
  size = "default",
  icon = "download",
  hideWhenUnavailable = true,
  onInstallResult,
}: InstallAppButtonProps) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

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
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt || installing) return;

    setInstalling(true);

    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;

      onInstallResult?.(result);

      if (result.outcome === "accepted") {
        setInstalled(true);
      }

      // The prompt is single-use.
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  }, [installPrompt, installing, onInstallResult]);

  // Already installed: don't show an unnecessary install action.
  if (installed) return null;

  // Some browsers/platforms don't expose beforeinstallprompt.
  // In those cases the announcement can choose to hide this button.
  if (!installPrompt && hideWhenUnavailable) return null;

  const Icon =
    icon === "smartphone"
      ? Smartphone
      : icon === "none"
        ? null
        : Download;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleInstall}
      disabled={!installPrompt || installing}
      aria-label="Install StratusPOS app"
    >
      {Icon && <Icon className="mr-2 h-4 w-4" />}
      {installing ? "Installing…" : children}
    </Button>
  );
}

export default InstallAppButton;
