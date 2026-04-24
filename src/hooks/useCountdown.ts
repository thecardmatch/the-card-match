import { useEffect, useRef, useState } from "react";

export type CountdownResult = { text: string; urgent: boolean; ended: boolean } | null;

export function calcRemaining(endTime: string | null | undefined): CountdownResult {
  if (!endTime) return null;
  const ms = new Date(endTime).getTime() - Date.now();
  if (ms <= 0) return { text: "Auction Ended", urgent: true, ended: true };

  const days  = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins  = Math.floor((ms % 3_600_000) / 60_000);
  const secs  = Math.floor((ms % 60_000) / 1_000);
  const urgent = ms < 3_600_000;

  let text: string;
  if (days > 0)        text = `${days}d ${hours}h ${mins}m ${secs}s`;
  else if (hours > 0)  text = `${hours}h ${mins}m ${secs}s`;
  else                 text = `${mins}m ${secs}s`;

  return { text, urgent, ended: false };
}

/** Live 1-second heartbeat countdown. Returns null when endTime is absent. */
export function useCountdown(endTime: string | null | undefined): CountdownResult {
  const [result, setResult] = useState<CountdownResult>(() => calcRemaining(endTime));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!endTime) { setResult(null); return; }
    const tick = () => setResult(calcRemaining(endTime));
    tick();
    timerRef.current = setInterval(tick, 1_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [endTime]);

  return result;
}
