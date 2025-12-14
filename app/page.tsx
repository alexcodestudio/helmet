"use client";

import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import toast, { Toaster } from "react-hot-toast";
import imageCompression from "browser-image-compression";
import {
  HardHat,
  Settings,
  Upload,
  X,
  Loader2,
  Folder,
  FolderKanban,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { extractImageMetadata } from "@/lib/image-metadata";
import type { ProjectSettings, Project, Image, Person } from "@/lib/types";

const DEFAULT_API_SETTINGS: ProjectSettings = {
  projectTag: "FE",
  confidence: 0.8,
  geminiWeight: 1,
  geminiPrompt: "default",
  grokWeight: 0,
  grokPrompt: "default",
  maxFileSize: 5000,
  maxWidth: 1920,
  maxHeight: 1080,
  outputFormat: "pdf",
};

/**
 * Zod schema for settings validation
 */
const settingsSchema = z.object({
  confidence: z.number().min(0.05).max(1),
  geminiWeight: z.number().min(0).max(1),
  grokWeight: z.number().min(0).max(1),
  maxFileSize: z.number().min(50).max(15000),
  maxWidth: z.number().min(300).max(6000),
  maxHeight: z.number().min(200).max(5000),
});

/**
 * Interface for compressed image with metadata
 */
interface CompressedImage {
  id: string;
  originalName: string;
  image: File;
  thumb: File;
  imageUrl: string;
  thumbUrl: string;
  initialImageDate: number | null;
  initialImageLocation: string | null;
  compressing: boolean;
  newFileSize: number;
}

interface ProcessingProject {
  id: string;
  name: string;
  timestamp: number;
}

export default function Home() {
  const [settings, setSettings] =
    useState<ProjectSettings>(DEFAULT_API_SETTINGS);
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showUploadArea, setShowUploadArea] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedImage, setSelectedImage] = useState<CompressedImage | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [processingProjects, setProcessingProjects] = useState<
    ProcessingProject[]
  >([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectImages, setProjectImages] = useState<Image[]>([]);
  const [projectPeople, setProjectPeople] = useState<Person[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [selectedProjectImage, setSelectedProjectImage] = useState<{
    image: Image;
    people: Person[];
  } | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);

  /**
   * Initializes and fetches project list from database
   */
  const initializeProjectList = async () => {
    try {
      setIsLoadingProjects(true);
      const response = await fetch("/api/projects");

      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }

      const data = await response.json();

      if (data.success) {
        // Parse settings from JSON string
        const parsedProjects = data.projects.map(
          (project: {
            id: number;
            projectName: string;
            userID: number;
            settings: string;
            status: number;
            createdAt: number;
          }) => ({
            ...project,
            settings: JSON.parse(project.settings),
          })
        );

        setProjects(parsedProjects);
        setProjectImages(data.images);
        setProjectPeople(data.people);
        console.log(
          `[CLIENT] Loaded ${parsedProjects.length} projects with ${data.images.length} images`
        );
      }
    } catch (error) {
      console.error("[ERROR] Failed to load projects:", error);
      toast.error("Failed to load projects");
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Load projects on mount
  useEffect(() => {
    initializeProjectList();
  }, []);

  /**
   * Adds a single project to the list without re-rendering existing projects.
   * Fetches only the new project's data and appends it to the state.
   *
   * @param projectId - The ID of the project to add
   */
  const addProjectToList = async (projectId: number) => {
    try {
      console.log(`[CLIENT] Loading project ${projectId}...`);

      const response = await fetch(`/api/projects/${projectId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch project");
      }

      const data = await response.json();

      if (data.success) {
        // Parse settings from JSON string
        const parsedProject = {
          ...data.project,
          settings: JSON.parse(data.project.settings),
        };

        // Add new project to the beginning of the list
        setProjects((prev) => [parsedProject, ...prev]);

        // Add new images to the state
        setProjectImages((prev) => [...data.images, ...prev]);

        // Add new people to the state
        setProjectPeople((prev) => [...data.people, ...prev]);

        console.log(
          `[CLIENT] Added project ${projectId} with ${data.images.length} images and ${data.people.length} people`
        );
      }
    } catch (error) {
      console.error(`[ERROR] Failed to load project ${projectId}:`, error);
      toast.error("Failed to load new project");
    }
  };

  /**
   * Updates settings with validation
   */
  const updateSettings = (key: keyof ProjectSettings, value: number) => {
    const tempSettings = { ...settings, [key]: value };

    try {
      settingsSchema.parse(tempSettings);
      setSettings({ ...settings, [key]: value });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issue = error.issues[0];
        if (issue.code === "too_big") {
          const max = (issue as { maximum: number }).maximum;
          setSettings({ ...settings, [key]: max });
          toast.error(`Value is larger than max value (${max})`);
        } else if (issue.code === "too_small") {
          const min = (issue as { minimum: number }).minimum;
          setSettings({ ...settings, [key]: min });
          toast.error(`Value is lower than min value (${min})`);
        }
      }
    }
  };

  /**
   * Handles file drop and compression
   */
  const handleDrop = async (files: File[]) => {
    if (files.length === 0) return;

    // Check for duplicates
    const newFiles = files.filter((file) => {
      const exists = images.some((img) => img.originalName === file.name);
      return !exists;
    });

    if (newFiles.length === 0) {
      toast.error("All files are already in the list");
      return;
    }

    setIsCompressing(true);
    setShowUploadArea(false);

    const newImages: CompressedImage[] = [];

    for (const file of newFiles) {
      const imageId = `${file.name}-${Date.now()}-${Math.random()}`;

      // Add image to list with compressing status
      const newImage: CompressedImage = {
        id: imageId,
        originalName: file.name,
        image: file,
        thumb: file,
        imageUrl: "",
        thumbUrl: "",
        initialImageDate: null,
        initialImageLocation: null,
        compressing: true,
        newFileSize: 0,
      };

      newImages.push(newImage);
      setImages((prev) => [...prev, newImage]);

      try {
        // Compress main image
        const compressedImage = await imageCompression(file, {
          maxWidthOrHeight: Math.max(settings.maxWidth, settings.maxHeight),
          maxSizeMB: settings.maxFileSize / 1000,
          useWebWorker: true,
          fileType: "image/webp",
        });

        // Compress thumbnail
        const compressedThumb = await imageCompression(file, {
          maxWidthOrHeight: 300,
          maxSizeMB: 0.3,
          useWebWorker: true,
          fileType: "image/webp",
        });

        // Create URLs for preview
        const imageUrl = URL.createObjectURL(compressedImage);
        const thumbUrl = URL.createObjectURL(compressedThumb);

        // Extract metadata
        let metadata: {
          initialImageDate: number | null;
          initialImageLocation: string | null;
        } = {
          initialImageDate: null,
          initialImageLocation: null,
        };
        try {
          metadata = await extractImageMetadata(file);
        } catch (error) {
          console.error("Failed to extract metadata:", error);
        }

        // Update the image in the list
        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  image: new File([compressedImage], file.name, {
                    type: "image/webp",
                  }),
                  thumb: new File([compressedThumb], `${file.name}_thumb`, {
                    type: "image/webp",
                  }),
                  imageUrl,
                  thumbUrl,
                  initialImageDate: metadata.initialImageDate,
                  initialImageLocation: metadata.initialImageLocation,
                  compressing: false,
                  newFileSize: Math.round(compressedImage.size / 1024),
                }
              : img
          )
        );
      } catch (error) {
        console.error("Compression failed:", error);
        toast.error(`Failed to compress ${file.name}`);
        // Remove failed image
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      }
    }

    setIsCompressing(false);
  };

  /**
   * Handles file input change
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleDrop(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /**
   * Handles drag over event
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  /**
   * Handles drag leave event
   */
  const handleDragLeave = () => {
    setDragOver(false);
  };

  /**
   * Handles drop event
   */
  const handleDropEvent = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleDrop(files);
  };

  /**
   * Removes an image from the list
   */
  const removeImage = (id: string) => {
    setImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        if (image.imageUrl) {
          URL.revokeObjectURL(image.imageUrl);
        }
        if (image.thumbUrl) {
          URL.revokeObjectURL(image.thumbUrl);
        }
      }
      return prev.filter((img) => img.id !== id);
    });

    if (images.length === 1) {
      setShowUploadArea(true);
    }
  };

  /**
   * Opens file selector
   */
  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  /**
   * Opens image dialog to view full image
   */
  const openImageDialog = (image: CompressedImage) => {
    setSelectedImage(image);
    setIsDialogOpen(true);
  };

  /**
   * Sends images and settings to API for helmet detection
   */
  const sendToApi = async () => {
    if (images.length === 0) {
      toast.error("No images to send");
      return;
    }

    setIsSending(true);

    // Create a processing project entry
    const processingId = `processing-${Date.now()}`;
    const processingProject: ProcessingProject = {
      id: processingId,
      name: "Processing...",
      timestamp: Date.now(),
    };
    setProcessingProjects((prev) => [processingProject, ...prev]);

    try {
      // Create FormData
      const formData = new FormData();
      formData.append("settings", JSON.stringify(settings));

      // Add images to FormData
      images.forEach((img, index) => {
        formData.append(`image_${index}`, img.image);
        formData.append(`thumb_${index}`, img.thumb);
        if (img.initialImageDate) {
          formData.append(
            `initialImageDate_${index}`,
            img.initialImageDate.toString()
          );
        }
        if (img.initialImageLocation) {
          formData.append(
            `initialImageLocation_${index}`,
            img.initialImageLocation
          );
        }
      });

      console.log("[CLIENT] Request sent to API");
      toast.success("Sending request to API...");

      // Send request to API
      const response = await fetch("/api/detect", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process images");
      }

      const result = await response.json();

      // Clean up image URLs
      images.forEach((img) => {
        if (img.imageUrl) URL.revokeObjectURL(img.imageUrl);
        if (img.thumbUrl) URL.revokeObjectURL(img.thumbUrl);
      });

      // Clear images and reset form
      setImages([]);
      setShowUploadArea(true);

      // Remove processing project and add completed project
      setProcessingProjects((prev) =>
        prev.filter((p) => p.id !== processingId)
      );

      toast.success(
        `Successfully processed ${result.summary.successfulImages} images!`
      );

      // Log result for debugging
      console.log("API Response:", result);

      // Add the new project to the list without re-rendering existing projects
      if (result.projectId) {
        await addProjectToList(result.projectId);
      }
    } catch (error) {
      console.error("Error sending to API:", error);
      toast.error("Failed to process images. Please try again.");

      // Remove processing project on error
      setProcessingProjects((prev) =>
        prev.filter((p) => p.id !== processingId)
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen p-2 md:p-8 mx-auto max-w-7xl bg-gray-50">
      <Toaster position="top-center" />

      {/* Header */}

      <h1 className="flex bg-white mx-auto mb-8 border w-fit border-gray-200 rounded-lg p-4 items-center text-3xl font-bold">
        <HardHat className="h-16 w-16" />
        HelmetCheck API
      </h1>

      {/* Form */}
      <form className="max-w-4xl mx-auto space-y-6 bg-white  p-4 md:px-8 md:pb-8 rounded-lg border border-gray-200">
        {/* Settings Accordion */}
        <Accordion type="single" collapsible className="w-full mt-0">
          <AccordionItem value="settings">
            <AccordionTrigger>
              <div className="flex items-center m-auto cursor-pointer gap-2 md:gap-6">
                <Settings className="h-8 w-8" />
                <span>Settings</span>
                <span className="text-sm font-normal italic text-gray-400">
                  shown to admin only
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {/* Confidence */}
                <div className="flex items-center gap-2 md:gap-4">
                  <Label className="w-2/5">
                    Confidence: {settings.confidence}
                  </Label>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={settings.confidence}
                    onChange={(e) =>
                      updateSettings("confidence", parseFloat(e.target.value))
                    }
                    className="w-3/5"
                  />
                </div>

                {/* Gemini Weight */}
                <div className="flex items-center gap-2 md:gap-4">
                  <Label className="w-2/5">
                    Gemini weight: {settings.geminiWeight}
                  </Label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.geminiWeight}
                    onChange={(e) =>
                      updateSettings("geminiWeight", parseFloat(e.target.value))
                    }
                    className="w-3/5"
                  />
                </div>

                {/* Gemini Prompt */}
                <div>
                  <Label>Gemini prompt</Label>
                  <textarea
                    value="default"
                    disabled
                    title="will be added in future versions"
                    className="mt-1 w-full rounded border border-gray-300 bg-gray-100 p-2 cursor-not-allowed"
                    rows={2}
                  />
                </div>

                {/* Grok Weight */}
                <div className="flex items-center gap-2 md:gap-4">
                  <Label className="w-2/5">
                    Grok weight: {settings.grokWeight}
                  </Label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.grokWeight}
                    onChange={(e) =>
                      updateSettings("grokWeight", parseFloat(e.target.value))
                    }
                    className="w-3/5"
                  />
                </div>

                {/* Grok Prompt */}
                <div>
                  <Label>Grok prompt</Label>
                  <textarea
                    value="default"
                    disabled
                    title="will be added in future versions"
                    className="mt-1 w-full rounded border border-gray-300 bg-gray-100 p-2 cursor-not-allowed"
                    rows={2}
                  />
                </div>

                {/* Max File Size */}
                <div className="flex items-center gap-2 md:gap-4">
                  <Label className="w-2/5">
                    Max File Size:{" "}
                    {Math.round((settings.maxFileSize / 1024) * 10) / 10} MB
                  </Label>
                  <input
                    type="range"
                    min="50"
                    max="15000"
                    step="1"
                    value={settings.maxFileSize}
                    onChange={(e) =>
                      updateSettings("maxFileSize", parseInt(e.target.value))
                    }
                    className="w-3/5"
                  />
                </div>

                {/* Max Width */}
                <div className="flex items-center gap-2 md:gap-4">
                  <Label className="w-2/5">
                    Max Width: {settings.maxWidth} px
                  </Label>
                  <input
                    type="range"
                    min="300"
                    max="6000"
                    step="1"
                    value={settings.maxWidth}
                    onChange={(e) =>
                      updateSettings("maxWidth", parseInt(e.target.value))
                    }
                    className="w-3/5"
                  />
                </div>

                {/* Max Height */}
                <div className="flex items-center gap-2 md:gap-4">
                  <Label className="w-2/5">
                    Max Height: {settings.maxHeight} px
                  </Label>
                  <input
                    type="range"
                    min="200"
                    max="5000"
                    step="1"
                    value={settings.maxHeight}
                    onChange={(e) =>
                      updateSettings("maxHeight", parseInt(e.target.value))
                    }
                    className="w-3/5"
                  />
                </div>

                {/* Output Format */}
                <div>
                  <Label>Output Format</Label>
                  <select
                    value={settings.outputFormat}
                    disabled
                    title="will be added in future versions"
                    className="mt-1 w-full rounded border border-gray-300 bg-gray-100 p-2 cursor-not-allowed"
                  >
                    <option value="pdf">PDF</option>
                  </select>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* File Upload Area */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {showUploadArea ? (
          <div
            onClick={openFileSelector}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropEvent}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:bg-gray-100"
            }`}
          >
            <Upload className="mb-2 h-12 w-12 text-gray-400" />
            <p className="text-lg text-gray-600">Upload images</p>
            <p className="text-sm text-gray-400">
              Click or drag and drop images here
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-300 p-4">
            <h2 className="mb-4 text-xl font-semibold text-center">
              Files to upload
            </h2>
            <ul className="space-y-3">
              {images.map((image) => (
                <li
                  key={image.id}
                  onClick={() => !image.compressing && openImageDialog(image)}
                  className={`flex items-center justify-between rounded border border-gray-200 p-3 ${
                    !image.compressing
                      ? "hover:bg-gray-50 cursor-pointer"
                      : "cursor-default"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {image.compressing ? (
                      <div className="flex items-center m-auto">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <span className="text-sm">Compressing...</span>
                      </div>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.thumbUrl}
                          alt={image.originalName}
                          className="h-24 w-24 rounded object-cover"
                        />
                        <div className="flex-1">
                          <p className="font-medium">{image.originalName}</p>
                          <p className="text-gray-500">
                            Compressed to {image.newFileSize} KB
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  {!image.compressing && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(image.id);
                      }}
                      className="ml-2 rounded p-1 hover:bg-gray-100 cursor-pointer"
                    >
                      <X className="h-8 w-8 text-gray-500" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={openFileSelector}
              disabled={isCompressing}
              className="mt-4 w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Upload more
            </button>
            <button
              type="button"
              onClick={sendToApi}
              disabled={isCompressing || isSending || images.length === 0}
              className="mt-3 w-full rounded bg-green-600 px-4 py-3 text-lg font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? "Sending..." : "Send to API"}
            </button>
          </div>
        )}
      </form>

      {/* Projects List */}
      <div className="mt-12 max-w-4xl mx-auto">
        <h2
          className="flex max-w-1/2 justify-center items-center
         text-2xl font-bold mx-auto text-center bg-white rounded-t-lg border-t border-l border-r border-gray-200 p-4"
        >
          Projects
          <FolderKanban className="h-8 w-8 ml-4" />
        </h2>
        <Accordion
          type="single"
          collapsible
          className="w-full px-4 pb-4 bg-white rounded-lg border border-gray-200"
        >
          {/* Processing Projects */}
          {processingProjects.map((project) => (
            <AccordionItem
              key={project.id}
              value={project.id}
              className="bg-yellow-50 border-yellow-300"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-yellow-600" />
                  <span className="font-semibold text-yellow-800">
                    {project.name}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm text-yellow-800">
                  <p>Detecting helmets in uploaded images...</p>
                  <p>This may take a few moments.</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}

          {/* Loading State */}
          {isLoadingProjects && (
            <AccordionItem value="loading" className="border-gray-200">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 m-auto">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span>Loading projects...</span>
                </div>
              </AccordionTrigger>
            </AccordionItem>
          )}

          {/* Real Projects */}
          {!isLoadingProjects &&
            projects.map((project) => {
              const projectImgs = projectImages.filter(
                (img) => img.projectID === project.id
              );
              const imageIds = projectImgs.map((img) => img.id);
              const projectPpl = projectPeople.filter((p) =>
                imageIds.includes(p.imageID)
              );

              const totalPeople = projectPpl.length;
              const peopleWithHelmets = projectPpl.filter(
                (p) => p.hasHelmet
              ).length;
              const peopleWithoutHelmets = totalPeople - peopleWithHelmets;

              return (
                <AccordionItem
                  key={project.id}
                  value={`project-${project.id}`}
                  className="bg-white"
                >
                  <AccordionTrigger>
                    <div className="flex items-center gap-3">
                      <Folder className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold">
                        {project.projectName}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {/* Project Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="font-medium">Images:</span>{" "}
                          {projectImgs.length}
                        </div>
                        <div>
                          <span className="font-medium">People:</span>{" "}
                          {totalPeople}
                        </div>
                        <div className="text-green-600">
                          <span className="font-medium">With helmets:</span>{" "}
                          {peopleWithHelmets}
                        </div>
                        <div className="text-red-600">
                          <span className="font-medium">Without helmets:</span>{" "}
                          {peopleWithoutHelmets}
                        </div>
                      </div>

                      {/* Images List */}
                      {projectImgs.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">Images:</h4>
                          <ul className="space-y-2">
                            {projectImgs.map((img) => {
                              const imgPeople = projectPpl.filter(
                                (p) => p.imageID === img.id
                              );
                              const imgWithHelmets = imgPeople.filter(
                                (p) => p.hasHelmet
                              ).length;

                              return (
                                <li
                                  key={img.id}
                                  onClick={() => {
                                    setSelectedProjectImage({
                                      image: img,
                                      people: imgPeople,
                                    });
                                    setIsProjectDialogOpen(true);
                                  }}
                                  className="flex items-center gap-3 rounded border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer"
                                >
                                  {/* Thumbnail */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/images/${img.thumbFileName}`}
                                    alt={img.fileName}
                                    className="h-16 w-16 rounded object-cover"
                                  />

                                  {/* Image Info */}
                                  <div className="flex-1 text-sm">
                                    <p className="font-medium">
                                      {img.fileName}
                                    </p>
                                    <p className="text-gray-500">
                                      {img.initialImageDate
                                        ? new Date(
                                            img.initialImageDate
                                          ).toLocaleString()
                                        : "No date"}
                                    </p>
                                    <p className="text-gray-500">
                                      {img.initialImageLocation ||
                                        "No location"}
                                    </p>
                                    <div className="flex gap-3 mt-1">
                                      <span>👥 {imgPeople.length} people</span>
                                      <span className="text-green-600">
                                        ✓ {imgWithHelmets}
                                      </span>
                                      <span className="text-red-600">
                                        ✗ {imgPeople.length - imgWithHelmets}
                                      </span>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">
                          No images in this project
                        </p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}

          {/* No Projects */}
          {!isLoadingProjects && projects.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No projects yet. Upload some images to get started!</p>
            </div>
          )}
        </Accordion>
      </div>

      {/* Upload Image Preview Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{selectedImage?.originalName}</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage.imageUrl}
                alt={selectedImage.originalName}
                className="w-full h-auto rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Project Image Detail Dialog with Person Detection */}
      <Dialog
        open={isProjectDialogOpen}
        onOpenChange={(open) => {
          setIsProjectDialogOpen(open);
          if (!open) {
            setSelectedProjectImage(null);
          }
        }}
      >
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedProjectImage?.image.fileName || "Image Details"}
            </DialogTitle>
          </DialogHeader>
          {selectedProjectImage && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Image with Bounding Boxes */}
              <div className="lg:col-span-2">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/images/${selectedProjectImage.image.fileName}`}
                    alt={selectedProjectImage.image.fileName}
                    className="w-full h-auto rounded-lg"
                    id="detection-image"
                  />
                  {/* Bounding boxes will be rendered here */}
                </div>
              </div>

              {/* Person List */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">
                  Detected People ({selectedProjectImage.people.length})
                </h3>

                {selectedProjectImage.people.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No people detected in this image
                  </p>
                ) : (
                  <Accordion type="single" collapsible className="w-full">
                    {selectedProjectImage.people.map((person) => (
                      <AccordionItem
                        key={person.id}
                        value={`person-${person.id}`}
                        className={`border rounded mb-2 ${
                          person.hasHelmet
                            ? "border-green-500 bg-green-50"
                            : "border-red-500 bg-red-50"
                        }`}
                      >
                        <AccordionTrigger className="px-3 hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-2">
                            <span className="font-medium">
                              Person {person.personID + 1}
                            </span>
                            <span
                              className={`text-sm ${
                                person.hasHelmet
                                  ? "text-green-700"
                                  : "text-red-700"
                              }`}
                            >
                              {person.hasHelmet ? "✓ Helmet" : "✗ No Helmet"}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3">
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="font-medium">
                                Person Confidence:
                              </span>{" "}
                              {(person.personConfidence * 100).toFixed(1)}%
                            </div>
                            <div>
                              <span className="font-medium">
                                Helmet Confidence:
                              </span>{" "}
                              {(person.helmetConfidence * 100).toFixed(1)}%
                            </div>
                            <div>
                              <span className="font-medium">Person Box:</span> [
                              {person.personBox.join(", ")}]
                            </div>
                            {person.helmetBox && (
                              <div>
                                <span className="font-medium">Helmet Box:</span>{" "}
                                [{person.helmetBox.join(", ")}]
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
