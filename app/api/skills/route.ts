import { listSkills } from "@/lib/skills/loader";

export async function GET() {
  const skills = await listSkills();
  return Response.json({ skills });
}
