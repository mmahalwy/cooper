import { loadSystemSkills } from '@/modules/skills/system';

export async function GET() {
  const skills = await loadSystemSkills();
  return Response.json(
    skills.map((s) => ({ name: s.name, description: s.description }))
  );
}
