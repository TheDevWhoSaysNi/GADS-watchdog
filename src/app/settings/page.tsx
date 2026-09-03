import { Nav } from "@/components/nav";
import { SettingsForm } from "@/components/settings-form";

export default function SettingsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav pathname="/settings" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Guided ntfy for a first farm, or paste env-style secrets and run
            Watchdog as a Linux, Windows, or macOS service. Blank channels are
            skipped.
          </p>
        </div>
        <SettingsForm />
      </main>
    </div>
  );
}
