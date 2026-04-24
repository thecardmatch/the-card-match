import { useEffect, useState } from "react";
import { Download, Share, Plus } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/.test(ua);
  // iPadOS 13+ reports as Macintosh but supports touch — detect that too.
  const isIPadOS =
    /Macintosh/.test(ua) &&
    "maxTouchPoints" in navigator &&
    (navigator as Navigator).maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari uses a non-standard navigator.standalone flag.
  return Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Hide entirely once the app is installed / opened in standalone mode.
  if (installed) return null;
  const ios = isIOS();

  async function handleClick() {
    if (installEvent) {
      // Native Android / Chromium prompt
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallEvent(null);
      return;
    }
    if (ios) setShowIOSHint((v) => !v);
  }

  // No native prompt available and not iOS → nothing useful to show.
  if (!installEvent && !ios) return null;

  return (
    <div className="px-3 pb-3 pt-1">
      <button
        onClick={handleClick}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover-elevate active-elevate-2"
      >
        <span className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Install App
        </span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          PWA
        </span>
      </button>

      {ios && showIOSHint && (
        <div className="mt-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 text-xs text-sidebar-foreground/90 leading-relaxed">
          <p className="font-semibold mb-1">Add to Home Screen</p>
          <p className="flex items-center gap-1.5 flex-wrap">
            Tap{" "}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background/40 font-semibold">
              <Share className="w-3 h-3" /> Share
            </span>{" "}
            then{" "}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background/40 font-semibold">
              <Plus className="w-3 h-3" /> Add to Home Screen
            </span>
          </p>
        </div>
      )}
    </div>
  );
}