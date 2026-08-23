const STORAGE_KEY = "stratus-notification-tones-enabled";
let audioContext: AudioContext | null = null;

export function areNotificationTonesEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setNotificationTonesEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
  if (enabled) void unlockNotificationAudio();
}

async function getAudioContext() {
  if (typeof window === "undefined") return null;
  audioContext ??= new window.AudioContext();
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      return null;
    }
  }
  return audioContext;
}

export async function unlockNotificationAudio() {
  await getAudioContext();
}

export async function playNotificationTone() {
  if (!areNotificationTonesEnabled()) return;
  const context = await getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  gain.connect(context.destination);

  const first = context.createOscillator();
  first.type = "sine";
  first.frequency.setValueAtTime(880, now);
  first.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.22);

  const second = context.createOscillator();
  second.type = "sine";
  second.frequency.setValueAtTime(1318.5, now + 0.18);
  second.connect(gain);
  second.start(now + 0.18);
  second.stop(now + 0.42);
}
