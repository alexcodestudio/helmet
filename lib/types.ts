export interface ProjectSettings {
  projectTag: string;
  confidence: number;
  geminiWeight: number;
  geminiPrompt: string;
  grokWeight: number;
  grokPrompt: string;
  maxFileSize: number;
  maxWidth: number;
  maxHeight: number;
  outputFormat: string; // it supposed to be pdf, but later can be changed to other formats
}

export interface Project {
  id: number | null;
  projectName: string;
  userID: number | null; // it is for further role model not implemented in this project
  settings: string;
  status: number; // 0 - not started, 1 - ready, 2 - no people, 3 - error
  createdAt: number | null;
}

export interface Image {
  id: number | null;
  projectID: number; // foreign key to Project.id
  initialImageDate: number | null;
  initialImageLocation: string | null;
  fileName: string;
  thumbFileName: string;
  createdAt: number | null;
}

export interface Person {
  id: number | null;
  imageID: number; // foreign key to Image.id
  personID: number;
  personConfidence: number;
  helmetConfidence: number;
  hasHelmet: boolean;
  personBox: number[];
  helmetBox: number[] | null;
  createdAt: number | null;
}

/**
 * Gemini API response format for person detection
 */
export interface GeminiPerson {
  person_id: number;
  personConfidence: number;
  helmetConfidence: number;
  hasHelmet: boolean;
  personBox: number[];
  helmetBox: number[] | null;
}
