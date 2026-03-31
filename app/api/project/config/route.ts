import { readProjectConfig, writeProjectConfig } from "@/lib/project-config";

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function GET() {
  const config = await readProjectConfig();
  return Response.json(config);
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body || typeof body !== "object") {
    return badRequest("Invalid JSON body");
  }

  const patch: { defaultTemplateId?: string; enabledSkillIds?: string[] } = {};

  if ("defaultTemplateId" in body) {
    if (
      typeof body.defaultTemplateId !== "string"
      || !body.defaultTemplateId.trim()
    ) {
      return badRequest("defaultTemplateId must be a non-empty string");
    }
    patch.defaultTemplateId = body.defaultTemplateId.trim();
  }

  if ("enabledSkillIds" in body) {
    if (
      !Array.isArray(body.enabledSkillIds)
      || body.enabledSkillIds.some(
        (item) => typeof item !== "string" || !item.trim(),
      )
    ) {
      return badRequest("enabledSkillIds must be a string array");
    }
    patch.enabledSkillIds = body.enabledSkillIds.map((item) => item.trim());
  }

  const config = await writeProjectConfig(patch);
  return Response.json(config);
}
