export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startFarmPoller } = await import("./lib/farm");
  startFarmPoller();
}
