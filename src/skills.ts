import { readdir, readFile } from "fs/promises";
import { join } from "path";

export async function loadSkills(skillsDir: string): Promise<string> {
  try {
    const files = await readdir(skillsDir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

    if (mdFiles.length === 0) return "";

    const skills: string[] = [];
    for (const file of mdFiles) {
      const content = await readFile(join(skillsDir, file), "utf-8");
      skills.push(content.trim());
    }

    return skills.join("\n\n---\n\n");
  } catch {
    return "";
  }
}
