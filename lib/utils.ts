import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ProjectSettings } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a project name based on the current timestamp and project tag.
 *
 * @param projectTag - The project tag to append to the timestamp
 * @returns A formatted string in the format YYMMDD-HHMMSS-projectTag
 *
 * @example
 * generateProjectName("API") // Returns "241214-153045-API"
 */
export function generateProjectName(projectTag: string): string {
  const now = new Date();

  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}-${projectTag}`;
}

/**
 * Sanitizes a string to contain only alphanumeric characters, underscores, and hyphens.
 * Safe for SQL and JavaScript usage.
 *
 * @param value - The string to sanitize
 * @param defaultValue - The default value to return if sanitization fails
 * @returns Sanitized string
 */
function sanitizeString(value: string, defaultValue: string): string {
  if (typeof value !== "string") return defaultValue;
  // Allow only alphanumeric, underscores, hyphens, and spaces
  const sanitized = value.replace(/[^a-zA-Z0-9_\-\s]/g, "");
  return sanitized.trim() || defaultValue;
}

/**
 * Clamps a number between a minimum and maximum value.
 *
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @param defaultValue - The default value to return if the value is not a number
 * @returns Clamped number
 */
function clampNumber(
  value: number,
  min: number,
  max: number,
  defaultValue: number
): number {
  const num = Number(value);
  if (isNaN(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

/**
 * Sanitizes project settings received from a request.
 * Validates and sanitizes each field according to its constraints.
 *
 * @param formData - The FormData object containing the settings
 * @param defaultSettings - Default settings to use as fallback
 * @returns Sanitized ProjectSettings object
 *
 * @example
 * const settings = sanitizeSettings(formData, DEFAULT_SETTINGS);
 */
export function sanitizeSettings(
  formData: FormData,
  defaultSettings: ProjectSettings
): ProjectSettings {
  let settings: Partial<ProjectSettings> = {};

  // Try to parse settings from formData
  const settingsString = formData.get("settings");
  if (settingsString && typeof settingsString === "string") {
    try {
      settings = JSON.parse(settingsString);
    } catch (error) {
      console.error("Failed to parse settings:", error);
      settings = {};
    }
  }

  // Sanitize and validate each field
  return {
    projectTag: sanitizeString(
      settings.projectTag as string,
      defaultSettings.projectTag
    ),
    confidence: clampNumber(
      settings.confidence as number,
      0.5,
      1,
      defaultSettings.confidence
    ),
    geminiWeight: clampNumber(
      settings.geminiWeight as number,
      0,
      1,
      defaultSettings.geminiWeight
    ),
    geminiPrompt: sanitizeString(
      settings.geminiPrompt as string,
      defaultSettings.geminiPrompt
    ),
    grokWeight: clampNumber(
      settings.grokWeight as number,
      0,
      1,
      defaultSettings.grokWeight
    ),
    grokPrompt: sanitizeString(
      settings.grokPrompt as string,
      defaultSettings.grokPrompt
    ),
    maxFileSize: clampNumber(
      settings.maxFileSize as number,
      50,
      15000,
      defaultSettings.maxFileSize
    ),
    maxWidth: clampNumber(
      settings.maxWidth as number,
      300,
      15000,
      defaultSettings.maxWidth
    ),
    maxHeight: clampNumber(
      settings.maxHeight as number,
      200,
      15000,
      defaultSettings.maxHeight
    ),
    outputFormat: sanitizeString(
      settings.outputFormat as string,
      defaultSettings.outputFormat
    ),
  };
}

/**
 * Sanitizes an optional date timestamp.
 *
 * @param value - The value to sanitize
 * @returns Sanitized number or null
 */
export function sanitizeOptionalDate(value: string | null): number | null {
  if (!value) return null;
  const num = Number(value);
  if (isNaN(num) || num < 0) return null;
  return num;
}

/**
 * Sanitizes an optional location string.
 *
 * @param value - The value to sanitize
 * @returns Sanitized string or null
 */
export function sanitizeOptionalLocation(value: string | null): string | null {
  if (!value) return null;
  // Allow only alphanumeric, underscores, hyphens, spaces, and common location characters
  const sanitized = value.replace(/[^a-zA-Z0-9_\-\s,./]/g, "");
  return sanitized.trim() || null;
}

/**
 * Saves image and thumbnail files to the filesystem.
 *
 * @param projectName - The name of the project
 * @param index - The index of the image in the array
 * @param image - The image file to save
 * @param thumb - The thumbnail file to save
 * @returns Object with success status and file names, or error message
 */
export async function saveImageToFileSystem(
  projectName: string,
  index: number,
  image: File,
  thumb: File
): Promise<
  | { success: true; fileName: string; thumbFileName: string }
  | { success: false; error: string }
> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    // Define the images directory path
    const imagesDir = path.join(process.cwd(), "public", "images");

    // Check if the directory exists, create it if not
    try {
      await fs.access(imagesDir);
    } catch {
      await fs.mkdir(imagesDir, { recursive: true });
    }

    // Define file names
    const fileName = `${projectName}-${index}.webp`;
    const thumbFileName = `${projectName}-${index}_thumb.webp`;

    // Define full paths
    const imagePath = path.join(imagesDir, fileName);
    const thumbPath = path.join(imagesDir, thumbFileName);

    // Convert Files to Buffers and save
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const thumbBuffer = Buffer.from(await thumb.arrayBuffer());

    await fs.writeFile(imagePath, imageBuffer);
    await fs.writeFile(thumbPath, thumbBuffer);

    return { success: true, fileName, thumbFileName };
  } catch (error) {
    console.error("Failed to save image to filesystem:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
