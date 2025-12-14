"use client";

import { useState, useRef } from "react";
import { z } from "zod";
import toast, { Toaster } from "react-hot-toast";
import imageCompression from "browser-image-compression";
import { HardHat, Settings, Upload, X, Loader2 } from "lucide-react";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { extractImageMetadata } from "@/lib/image-metadata";
import type { ProjectSettings } from "@/lib/types";

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

export default function Home() {
  const [settings, setSettings] =
    useState<ProjectSettings>(DEFAULT_API_SETTINGS);
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showUploadArea, setShowUploadArea] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedImage, setSelectedImage] = useState<CompressedImage | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
   * Logs current state for debugging
   */
  const logCurrentState = () => {
    console.log("Settings:", settings);
    console.log(
      "Images:",
      images.map((img) => ({
        originalName: img.originalName,
        imageSize: img.image.size,
        thumbSize: img.thumb.size,
        initialImageDate: img.initialImageDate,
        initialImageLocation: img.initialImageLocation,
      }))
    );
  };

  // Log state whenever images change
  if (images.length > 0 && images.every((img) => !img.compressing)) {
    logCurrentState();
  }

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
          </div>
        )}
      </form>

      {/* Projects List */}
      <div className="mt-12 max-w-4xl">
        <h2 className="mb-4 text-2xl font-bold">Projects</h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="project-1">
            <AccordionTrigger>Project Demo 241214-120000-FE</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Status:</span> Completed
                </p>
                <p className="text-sm">
                  <span className="font-medium">Images:</span> 5
                </p>
                <p className="text-sm">
                  <span className="font-medium">People detected:</span> 12
                </p>
                <p className="text-sm">
                  <span className="font-medium">With helmets:</span> 10
                </p>
                <p className="text-sm">
                  <span className="font-medium">Without helmets:</span> 2
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="project-2">
            <AccordionTrigger>Project Demo 241213-093045-API</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Status:</span> Completed
                </p>
                <p className="text-sm">
                  <span className="font-medium">Images:</span> 3
                </p>
                <p className="text-sm">
                  <span className="font-medium">People detected:</span> 8
                </p>
                <p className="text-sm">
                  <span className="font-medium">With helmets:</span> 8
                </p>
                <p className="text-sm">
                  <span className="font-medium">Without helmets:</span> 0
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="project-3">
            <AccordionTrigger>Project Demo 241210-153020-FE</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Status:</span> No people
                  detected
                </p>
                <p className="text-sm">
                  <span className="font-medium">Images:</span> 2
                </p>
                <p className="text-sm">
                  <span className="font-medium">People detected:</span> 0
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Image Preview Dialog */}
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
    </main>
  );
}
