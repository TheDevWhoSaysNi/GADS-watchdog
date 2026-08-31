import Link from "next/link";
import { Activity, BookOpen, Settings } from "lucide-react";

const links = [
  { href: "/", label: "Farm", icon: Activity },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-lime-400 text-zinc-950">
            <Activity className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">
              GADS Watchdog
            </span>
            <span className="hidden text-xs text-zinc-400 sm:block">
              Sidecar monitor — do not fork the GADS UI
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                }`}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
