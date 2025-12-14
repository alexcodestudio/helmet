import { NextRequest, NextResponse } from "next/server";
import type { ProjectSettings } from "@/lib/types";
import {
  sanitizeSettings,
  sanitizeOptionalDate,
  sanitizeOptionalLocation,
  generateProjectName,
  saveImageToFileSystem,
} from "@/lib/utils";
import { createProject, createImage, createPerson } from "@/lib/db";

const DEFAULT_API_SETTINGS: ProjectSettings = {
  projectTag: "API",
  confidence: 0.8,
  geminiWeight: 1,
  geminiPrompt: "default",
  grokWeight: 0, // I will implement grok later if there will be enough time
  grokPrompt: "default",
  maxFileSize: 5000, // 5MB
  maxWidth: 1920,
  maxHeight: 1080,
  outputFormat: "pdf",
};

/**
 * Extracts and sanitizes images and their metadata from FormData.
 *
 * @param formData - The FormData object containing images and metadata
 * @returns Array of image objects with sanitized metadata
 */
function extractImagesFromFormData(formData: FormData): Array<{
  initialImageDate: number | null;
  initialImageLocation: string | null;
  image: File;
  thumb: File;
}> {
  const images: Array<{
    initialImageDate: number | null;
    initialImageLocation: string | null;
    image: File;
    thumb: File;
  }> = [];

  let index = 0;

  while (formData.has(`image_${index}`)) {
    const image = formData.get(`image_${index}`);
    const thumb = formData.get(`thumb_${index}`);
    const initialImageDate = formData.get(`initialImageDate_${index}`);
    const initialImageLocation = formData.get(`initialImageLocation_${index}`);

    // Validate that image and thumb are Files
    if (image instanceof File && thumb instanceof File) {
      images.push({
        image,
        thumb,
        initialImageDate: sanitizeOptionalDate(
          typeof initialImageDate === "string" ? initialImageDate : null
        ),
        initialImageLocation: sanitizeOptionalLocation(
          typeof initialImageLocation === "string" ? initialImageLocation : null
        ),
      });
    }

    index++;
  }

  return images;
}

/**
 * Dummy function for helmet detection in images.
 * This will be replaced with actual ML detection logic later.
 *
 * @param image - The image file to analyze
 * @param thumb - The thumbnail file
 * @param projectId - The project ID
 * @param index - The image index
 * @returns Array of detected persons with helmet information
 */
async function detectHelmetInImage(
  _image: File,
  _thumb: File,
  _projectId: number,
  _index: number
): Promise<
  Array<{
    personID: number;
    personConfidence: number;
    helmetConfidence: number;
    hasHelmet: boolean;
    personBox: number[];
    helmetBox: number[] | null;
  }>
> {
  // Dummy implementation - returns mock data
  // In production, this would call an ML model for actual detection
  const numPeople = Math.floor(Math.random() * 3) + 1; // 1-3 people
  const people = [];

  for (let i = 0; i < numPeople; i++) {
    const hasHelmet = Math.random() > 0.3; // 70% chance of having helmet
    people.push({
      personID: i + 1,
      personConfidence: 0.85 + Math.random() * 0.15, // 0.85-1.0
      helmetConfidence: hasHelmet ? 0.8 + Math.random() * 0.2 : 0, // 0.8-1.0 or 0
      hasHelmet,
      personBox: [
        Math.floor(Math.random() * 100),
        Math.floor(Math.random() * 100),
        Math.floor(Math.random() * 200) + 100,
        Math.floor(Math.random() * 300) + 200,
      ],
      helmetBox: hasHelmet
        ? [
            Math.floor(Math.random() * 100),
            Math.floor(Math.random() * 50),
            Math.floor(Math.random() * 100) + 50,
            Math.floor(Math.random() * 100) + 50,
          ]
        : null,
    });
  }

  return people;
}

/**
 * POST endpoint for detecting helmets in images.
 * Receives FormData with settings and images, processes them, and returns results.
 *
 * @param request - The Next.js request object
 * @returns NextResponse with processing results or error
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Sanitize settings
    const settings = sanitizeSettings(formData, DEFAULT_API_SETTINGS);

    // Extract and sanitize images
    const images = extractImagesFromFormData(formData);

    // Validate that we have at least one image
    if (images.length === 0) {
      return NextResponse.json(
        { error: "No images provided" },
        { status: 400 }
      );
    }

    // Create project
    const projectName = generateProjectName(settings.projectTag);
    const projectId = createProject(projectName, settings);

    if (!projectId) {
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 }
      );
    }

    // Process all images in parallel
    const imageResults = await Promise.all(
      images.map(async (imageData, index) => {
        try {
          // Run two threads in parallel:
          // Thread 1: Save image to filesystem then to DB
          // Thread 2: Detect helmets
          const [saveResult, detectionResult] = await Promise.all([
            // Thread 1: Save image
            (async () => {
              const fsResult = await saveImageToFileSystem(
                projectName,
                index,
                imageData.image,
                imageData.thumb
              );

              if (!fsResult.success) {
                console.error(`Failed to save image ${index}:`, fsResult.error);
                return null;
              }

              const dbImage = createImage(
                projectId,
                imageData.initialImageDate,
                imageData.initialImageLocation,
                fsResult.fileName,
                fsResult.thumbFileName
              );

              if (!dbImage) {
                console.error(`Failed to save image ${index} to database`);
                return null;
              }

              return dbImage;
            })(),

            // Thread 2: Detect helmets
            detectHelmetInImage(
              imageData.image,
              imageData.thumb,
              projectId,
              index
            ),
          ]);

          // If image saving failed, skip person detection
          if (!saveResult) {
            return {
              index,
              success: false,
              error: "Failed to save image",
            };
          }

          // Save each detected person to database
          const personResults = detectionResult.map((person) => {
            const dbPerson = createPerson(
              saveResult.id,
              person.personID,
              person.personConfidence,
              person.helmetConfidence,
              person.hasHelmet,
              person.personBox,
              person.helmetBox
            );

            if (!dbPerson) {
              console.error(
                `Failed to save person ${person.personID} for image ${index}`
              );
              return null;
            }

            return dbPerson;
          });

          return {
            index,
            success: true,
            imageId: saveResult.id,
            fileName: saveResult.fileName,
            thumbFileName: saveResult.thumbFileName,
            peopleDetected: personResults.filter((p) => p !== null).length,
            people: personResults.filter((p) => p !== null),
          };
        } catch (error) {
          console.error(`Error processing image ${index}:`, error);
          return {
            index,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    // Calculate summary statistics
    const successfulImages = imageResults.filter((r) => r.success).length;
    const totalPeopleDetected = imageResults.reduce(
      (sum, r) => sum + (r.success ? r.peopleDetected ?? 0 : 0),
      0
    );

    return NextResponse.json({
      success: true,
      projectId,
      projectName,
      settings,
      summary: {
        totalImages: images.length,
        successfulImages,
        failedImages: images.length - successfulImages,
        totalPeopleDetected,
      },
      results: imageResults,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
