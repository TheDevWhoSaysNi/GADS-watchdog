import { getFarmSnapshot } from "@/lib/farm";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getFarmSnapshot();
  return Response.json(snapshot);
}
