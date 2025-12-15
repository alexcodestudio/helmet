import { NextRequest, NextResponse } from "next/server";
import type { ProjectSettings, GeminiPerson } from "@/lib/types";
import {
  sanitizeSettings,
  sanitizeOptionalDate,
  sanitizeOptionalLocation,
  generateProjectName,
  saveImageToFileSystem,
} from "@/lib/server-utils";
import { GoogleGenAI } from "@google/genai";
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

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || "",
});

export async function requestGem(
  imageBuffer: Buffer,
  mimeType: string,
  filename: string
) {
  try {
    const modelName = "gemini-2.5-flash-lite";
    const prompt = `
        IMPORTANT: You are a safety compliance expert. You are tasked with analyzing images for safety compliance.
        IMPORTANT: You need to provide coordinates of objects in the image for further processing and they must be  very accurate 
        Analyze this image for safety compliance.
        1. Identify every PERSON in the image.
        2. For each person assign personId starting from 0, check if they are wearing a HELMET.
        3. Return a JSON object with a list of persons and data for each person.
        
        CRITICAL COORDINATE INSTRUCTIONS:
        - Return bounding boxes as [ymin, xmin, ymax, xmax] on a scale of 0 to 1000. all boxes must have 4 coordinates - set 0 for missing coordinates, there should not be more than 2 missing coordinates.
        - 0,0 is top-left. 1000,1000 is bottom-right.
        - If you see a person but NO helmet, return "helmetRect": null.
        
        CONFIDENCE:
        - Estimate your confidence level (0-100) for the existence of the person and the helmet.
        - If you see only part of a person, it should lower confidence
        - You must see parts of a person, items smaller than 3% of the image size should not be considered as a person.
        - If you see a person but NO helmet, return "helmetRect": null 
        
        Output Schema:
        {
          "fileName": "${filename}",
          "persons": [
            { "person_id": number,
              "personConfidence": number,
              "helmetConfidence": number,
              "hasHelmet": boolean,
              "personBox": [ymin, xmin, ymax, xmax],
              "helmetBox": [ymin, xmin, ymax, xmax] or null
            }
          ]
        }
      `;

    const imageBase64 = imageBuffer.toString("base64");

    console.log(`[GEMINI] Analyzing image: ${filename}`);

    // Use new API pattern
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/webp",
                data: imageBase64,
              },
            },
          ],
        },
      ],
    });

    const text = response.text;

    if (!text) {
      throw new Error("No text in response from Gemini API");
    }

    // Parse JSON from response (remove markdown code blocks if present)
    const jsonMatch =
      text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    let parsed;

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      parsed = JSON.parse(jsonText);
    } else {
      // Try to parse as-is if no markdown
      parsed = JSON.parse(text);
    }

    // Add indexes to persons array
    if (parsed.persons && Array.isArray(parsed.persons)) {
      parsed.persons = parsed.persons.map(
        (person: GeminiPerson, index: number) => ({
          ...person,
          person_id: index,
        })
      );
      console.log(
        `[GEMINI] Detected ${parsed.persons.length} person(s) in ${filename}`
      );
    }

    return parsed;
  } catch (error) {
    console.error(`[GEMINI] Error analyzing ${filename}:`, error);
    throw error;
  }
}

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
 * Detects helmets in images using Gemini AI.
 *
 * @param image - The image file to analyze
 * @param thumb - The thumbnail file (not used, kept for signature compatibility)
 * @param projectId - The project ID (not used, kept for signature compatibility)
 * @param index - The image index (not used, kept for signature compatibility)
 * @param confidenceThreshold - Minimum confidence threshold for helmet detection (0-1)
 * @returns Array of detected persons with helmet information
 */
async function detectHelmetInImage(
  image: File,
  _thumb: File,
  _projectId: number,
  _index: number,
  confidenceThreshold: number
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
  try {
    // Convert File to Buffer
    const arrayBuffer = await image.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Call Gemini API
    const response = await requestGem(
      imageBuffer,
      image.type || "image/webp",
      image.name
    );

    // Map response to expected format
    if (!response.persons || !Array.isArray(response.persons)) {
      return [];
    }

    const people = response.persons.map((person: GeminiPerson) => {
      const helmetConfidence = person.helmetConfidence / 100; // Convert from 0-100 to 0-1

      // Apply confidence threshold: if helmet confidence is below threshold,
      // consider it as no helmet detected
      const wasHelmetDetected = person.hasHelmet;
      const hasHelmet =
        wasHelmetDetected && helmetConfidence >= confidenceThreshold;
      const helmetBox = hasHelmet ? person.helmetBox : null;

      // Log if confidence threshold filtered out a helmet
      if (wasHelmetDetected && !hasHelmet) {
        console.log(
          `[CONFIDENCE] Person ${person.person_id} helmet confidence ${(
            helmetConfidence * 100
          ).toFixed(1)}% below threshold ${(confidenceThreshold * 100).toFixed(
            1
          )}% - marked as no helmet`
        );
      }

      return {
        personID: person.person_id,
        personConfidence: person.personConfidence / 100,
        helmetConfidence: helmetConfidence,
        hasHelmet: hasHelmet,
        personBox: person.personBox,
        helmetBox: helmetBox,
      };
    });

    return people;
  } catch (error) {
    console.error(`[ERROR] Failed to detect helmets in ${image.name}:`, error);
    // Return empty array on error to allow processing to continue
    return [];
  }
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
    console.log("[API] Request received, processing...");

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

    console.log(
      `[API] Processing ${images.length} image(s) with confidence threshold: ${(
        settings.confidence * 100
      ).toFixed(1)}%`
    );

    // Create project
    const projectName = generateProjectName(settings.projectTag);
    const projectId = createProject(projectName, settings);

    if (!projectId) {
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 }
      );
    }

    console.log("[API] Image saving started");

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
                console.error(
                  `[ERROR] Failed to save image ${index} to filesystem`
                );
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
                console.error(
                  `[ERROR] Failed to save image ${index} to database`
                );
                return null;
              }

              return dbImage;
            })(),

            // Thread 2: Detect helmets
            detectHelmetInImage(
              imageData.image,
              imageData.thumb,
              projectId,
              index,
              settings.confidence
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
                `[ERROR] Failed to save person data for image ${index}`
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
          console.error(`[ERROR] Failed to process image ${index}:`, error);
          return {
            index,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    console.log("[API] Image saving finished");

    // Calculate summary statistics
    const successfulImages = imageResults.filter((r) => r.success).length;
    const totalPeopleDetected = imageResults.reduce(
      (sum, r) => sum + (r.success ? r.peopleDetected ?? 0 : 0),
      0
    );

    console.log(
      `[API] Processing complete - ${successfulImages}/${images.length} images processed, ${totalPeopleDetected} people detected`
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
    console.error("[ERROR] Request processing failed:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
