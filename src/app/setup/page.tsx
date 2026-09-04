import { Nav } from "@/components/nav";
import { SetupWizard } from "@/components/setup-wizard";

export default function SetupPage() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav pathname="/setup" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-lime-300">
            Guided setup
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            New to phone farms?
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Four short steps to get a push when a phone stays down.
          </p>
        </div>
        <SetupWizard />
      </main>
    </div>
  );
}
