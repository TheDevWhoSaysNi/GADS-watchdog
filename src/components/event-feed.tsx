"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatClock } from "@/lib/format";
import type { FarmEvent } from "@/lib/types";

export function EventFeed({ events }: { events: FarmEvent[] }) {
  return (
    <Card className="bg-zinc-900/70">
      <CardHeader>
        <CardTitle>Incident feed</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No incidents yet. Drops shorter than the grace period stay silent so a 5-second
            USB hiccup does not wake you up.
          </p>
        ) : (
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{event.title}</p>
                    <p className="mt-1 text-sm text-zinc-400">{event.detail}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-[11px] text-zinc-500">
                      {formatClock(event.at)}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        event.severity === "recovered"
                          ? "border-lime-400/30 text-lime-200"
                          : event.severity === "critical"
                            ? "border-rose-400/30 text-rose-200"
                            : "border-amber-400/30 text-amber-200"
                      }
                    >
                      {event.notified ? "alerted" : event.severity}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
