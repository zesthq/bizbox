import { Badge } from "@/components/ui/badge";
import type { DeliverableAudience } from "@paperclipai/shared";

export function AudienceBadge({ audience }: { audience: DeliverableAudience }) {
  return (
    <Badge variant={audience === "internal" ? "outline" : "secondary"}>
      {audience === "internal" ? "Internal" : "Human"}
    </Badge>
  );
}
