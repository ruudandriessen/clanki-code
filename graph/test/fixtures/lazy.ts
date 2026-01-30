// Dynamic import
export async function loadService() {
  const mod = await import("./service.ts");
  return mod.createUser("test");
}
