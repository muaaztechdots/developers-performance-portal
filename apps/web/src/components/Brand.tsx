import { Activity } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark"><Activity size={22} strokeWidth={2.5} /></span>
      {!compact && <span className="brand-name">DevPulse</span>}
    </div>
  );
}
