// src/projects/types.ts
export interface Project {
  name: string;
  path: string;
}

export interface FocusProject extends Project {
  priority: number;
  notes?: string;
}

export interface FocusConfig {
  projects: FocusProject[];
  updated_at: string;
}

export interface ProjectGoal {
  title: string;
  priority: number; // 1 = high, 2 = medium, 3 = low
  status: "active" | "completed" | "blocked" | "deferred";
  deadline?: string; // ISO 8601
  links?: string[]; // beads IDs, URLs
  notes?: string;
}

export interface ProjectFiles {
  notes: string | null;
  goals: ProjectGoal[];
  log: string | null;
  links: Record<string, string> | null;
}
