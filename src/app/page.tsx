import { FarmDashboard } from "@/components/farm-dashboard";
import { Nav } from "@/components/nav";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <Nav pathname="/" />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <FarmDashboard />
      </main>
    </div>
  );
}
