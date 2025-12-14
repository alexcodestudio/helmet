# HelmetCheck API

<div align="center">

**AI-Powered Safety Compliance Detection System**

A Next.js application that uses Google Gemini AI to detect people and helmet usage in construction site images, with comprehensive reporting and project management capabilities.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)
![AI](https://img.shields.io/badge/AI-Gemini_2.5-green?style=flat-square)

</div>

---

## 📋 Overview

HelmetCheck API is a production-ready safety compliance monitoring system that automatically detects people in images and verifies whether they are wearing safety helmets. Built with modern web technologies and powered by Google's Gemini AI, it provides real-time analysis, detailed reporting, and comprehensive project management.

### Key Highlights

- **🤖 AI-Powered Detection**: Leverages Google Gemini 2.5 Flash for accurate person and helmet detection
- **📊 Visual Bounding Boxes**: Real-time visualization of detected people and helmets with color-coded safety status
- **📄 Automated PDF Reports**: Generates professional safety compliance reports with annotated images
- **🗄️ Persistent Storage**: SQLite database with cascade deletion for efficient data management
- **⚡ Client-Side Optimization**: Intelligent image compression and EXIF data extraction before upload
- **🎯 Configurable Confidence**: Adjustable AI confidence thresholds for detection accuracy
- **📦 Batch Operations**: Process multiple images and generate ZIP archives of reports
- **💚 Health Monitoring**: Comprehensive health check endpoint for system diagnostics

---

## 🎯 Core Endpoint: `/api/detect`

### Method: POST

The main detection endpoint that receives compressed images and settings, then uses Google Gemini AI to detect people and helmet usage in construction site images.

### Input Schema

**Content-Type:** `multipart/form-data`

**Fields:**

- `settings`: JSON string with configuration
- `image_0, image_1, ...`: Compressed full images (WebP)
- `thumb_0, thumb_1, ...`: Thumbnail images
- `initialImageDate_0, ...`: EXIF timestamps (optional)
- `initialImageLocation_0, ...`: GPS coordinates (optional)

### Settings Parameters

| Parameter      | Description           | Range/Type  |
| -------------- | --------------------- | ----------- |
| `confidence`   | Detection threshold   | 0.05 - 1.0  |
| `projectTag`   | Project identifier    | string      |
| `maxFileSize`  | Max size in KB        | 50 - 15000  |
| `maxWidth`     | Max image width (px)  | 300 - 15000 |
| `maxHeight`    | Max image height (px) | 200 - 15000 |
| `outputFormat` | Report format         | "pdf"       |

**Note:** All compression and resizing is performed on the **client-side** before upload, reducing server load.

### Example Request

```bash
curl -X POST http://localhost:3000/api/detect \
  -F 'settings={"projectTag":"Site-A","confidence":0.8,"maxFileSize":5000}' \
  -F 'image_0=@construction_site.jpg' \
  -F 'thumb_0=@construction_site_thumb.jpg' \
  -F 'initialImageDate_0=1702571400000' \
  -F 'initialImageLocation_0=40.7128,-74.0060'
```

---

## 🤖 AI Detection Process

1. **API receives compressed images** and parses FormData
2. **Images sent to Google Gemini 2.5 Flash** for analysis
3. **AI detects each person** and returns: **person bounding box** and **helmet bounding box**
4. **Results stored in SQLite database** with confidence scores
5. **Bounding boxes normalized to 0-1000 scale** for precise positioning

### Response Format

```json
{
  "success": true,
  "projectId": 123,
  "projectName": "251214-153045-Construction",
  "totalImages": 3,
  "totalPeople": 7,
  "results": [
    {
      "index": 0,
      "imageId": 456,
      "fileName": "251214-153045-Construction-0.webp",
      "peopleDetected": 2,
      "people": [
        {
          "personID": 0,
          "personConfidence": 0.95,
          "helmetConfidence": 0.88,
          "hasHelmet": true,
          "personBox": [120, 340, 580, 670],
          "helmetBox": [125, 360, 210, 450]
        }
      ]
    }
  ]
}
```

**Features:**

- Multi-threaded processing of multiple images
- Parallel AI detection and database insertion
- Automatic project creation with unique timestamp-based naming
- Confidence threshold filtering
- Comprehensive error handling per image

---

## 💻 Client-Side Features

The application leverages **client-side processing** as the preferred method to reduce server load and provide instant feedback:

### ✓ Image Compression

Uses `browser-image-compression` library for optimal file size reduction

### ✓ EXIF Parsing

Extracts date and GPS data with `ExifReader` before upload

### ✓ PDF Generation

Creates reports using `pdf-lib` directly in the browser

### ✓ ZIP Creation

Bundles multiple PDFs with `JSZip` on the client side

**⚡ Preferred Method:** Client-side processing eliminates server overhead for compression and PDF generation tasks.

---

## 📊 Minimalistic Dashboard

The frontend provides a clean, analytical view with:

- **Project-level statistics** (images, people, violations)
- **Real-time processing status** with visual indicators
- **Interactive image gallery** with bounding box overlays
- **Per-person confidence scores** and helmet detection status
- **Color-coded safety compliance** (🟢 Green = Safe, 🔴 Red = Violation)

---

## 📄 PDF Report Generation

### Report Structure

Individual reports generated for:

- **Each person** detected
- In **each image**
- For **each project**

### Download Options

- **One-by-one**: Click individual "Generate" buttons for specific reports
- **Batch ZIP**: Download all reports for a project at once

### Report Contents

- Annotated image with color-coded bounding boxes
- Project metadata and timestamps
- GPS coordinates (if available)
- Detection confidence scores
- Safety recommendations for violations

---

## 🔌 Additional API Endpoints

### 1. POST `/api/report`

**Server-side PDF generation with ZIP packaging capability.**

#### Request Format

```json
{
  "projectName": "251214-155400-FE",
  // OR
  "projectId": 123,

  "format": "pdf", // Currently PDF, can be improved (email sending, etc.)
  "zipped": "true" // Bundle reports as ZIP
}
```

#### Response

- **Content-Type**: `application/zip` or `application/pdf`
- **Content-Disposition**: Attachment with filename
- Binary data (ZIP or PDF file)

**Note:** Server-side generation uses `pdf-lib` and `sharp` for image processing. Handles WebP conversion to PNG for PDF embedding.

#### Features

- Unique filenames including image basename: `Project_ImageName_Person1_Report.pdf`
- Annotated images with bounding boxes embedded in PDF
- Project metadata, detection scores, and safety recommendations
- Batch ZIP generation for multiple reports

---

### 2. GET `/api/health` (Optional)

**Comprehensive system health monitoring endpoint.**

#### Checks Performed

- **Database connectivity validation** - Simple query execution
- **LLM (Gemini AI) response verification** - Actual test API call
- **Filesystem write permission testing** - Create/delete test file
- **Server availability confirmation** - Implicit if endpoint responds

#### Response (Healthy - HTTP 200)

```json
{
  "status": "healthy",
  "timestamp": "2025-12-14T21:30:00.000Z",
  "checks": {
    "database": {
      "status": "pass",
      "message": "Database connected successfully",
      "responseTime": 3
    },
    "gemini_api": {
      "status": "pass",
      "message": "API key is valid",
      "responseTime": 245
    },
    "filesystem": {
      "status": "pass",
      "message": "Write permissions confirmed",
      "path": "public/images",
      "responseTime": 8
    },
    "server": {
      "status": "pass",
      "message": "Server is running",
      "responseTime": 0
    }
  }
}
```

#### Response (Unhealthy - HTTP 503)

Returns same structure with failed check details and error messages.

**Returns:** Detailed response with status, response times, and error messages for each component.

---

### 3. Other Endpoints

#### GET `/api/projects`

Fetch all projects with metadata.

#### GET `/api/projects/[id]`

Fetch single project with associated images and people.

#### DELETE `/api/projects/[id]`

Delete project with cascade cleanup of database records and files.

---

## 🚀 Potential Improvements

### Automated Cleanup (Cron)

Scheduled task to clean old files and database records, preventing storage bloat over time.

### Email Report Delivery

Easy integration to send PDF reports via email directly from API. Can be triggered automatically or on-demand.

### Multi-LLM Support with Weights

Combine multiple LLMs (Gemini, Grok) with adjustable weights and custom prompts. **Example already implemented** in the settings interface.

### User Role & Permission System

Divide projects by users with role-based access control. Add authentication and authorization layers for enterprise deployments.

### Android APK for Field Use

Mobile app to repurpose old phones as camera devices with direct API integration. Useful for on-site safety monitoring without dedicated hardware.

### And Many More...

- Webhook integrations for third-party notifications
- Real-time notifications via WebSockets
- Advanced analytics and trend reporting
- Batch processing for large image sets
- Integration with construction management systems
- Automated compliance reporting to regulatory bodies

---

## 🏗️ Architecture Highlights

### Technology Stack

| Component            | Technology                                          | Purpose                  |
| -------------------- | --------------------------------------------------- | ------------------------ |
| **Database**         | SQLite with CASCADE deletion                        | Local data persistence   |
| **AI Model**         | Google Gemini 2.5 Flash                             | Image analysis           |
| **Frontend**         | Next.js 16 + React 19 + TypeScript                  | Modern web UI            |
| **Processing**       | Parallel multi-image detection                      | Performance optimization |
| **Image Processing** | Sharp (server) + browser-image-compression (client) | Efficient image handling |
| **PDF Generation**   | pdf-lib (both sides)                                | Report creation          |

### Database Schema

```sql
projects (id, name, user_id, status, settings, created_at)
    └─→ images (id, project_id, file_name, metadata, created_at)
            └─→ people (id, image_id, person_id, confidence, bounding_boxes, created_at)
```

**Features:**

- Foreign key constraints with `ON DELETE CASCADE`
- Automatic cleanup of orphaned records
- Normalized data structure for efficient queries

### Best Practices Implemented

#### Separation of Concerns

```
├── app/api/          # Server-side API routes
├── components/ui/    # Reusable UI components (Shadcn)
├── lib/              # Utility functions and business logic
│   ├── db.tsx        # Database operations (server-only)
│   ├── server-utils.ts   # Server-side utilities
│   ├── utils.ts      # Client-safe utilities
│   └── pdf-generator.ts  # Client-side PDF generation
```

#### Server/Client Boundary Management

- Explicit `"server-only"` package usage
- Clear separation between Node.js and browser APIs
- Optimized bundle size by preventing server code in client bundles

#### Type Safety

- Full TypeScript implementation with strict typing
- Zod schemas for runtime validation
- Shared type definitions across frontend and backend

#### Performance Optimization

- Parallel processing of multiple images
- Efficient state management with React hooks
- Optimistic UI updates for better UX
- Database indexing and prepared statements

#### Error Handling

- Comprehensive try-catch blocks at all levels
- User-friendly error messages via toast notifications
- Detailed server-side logging for debugging
- Graceful degradation for failed operations

---

## 📦 Installation & Setup

### Prerequisites

- Node.js 20+ and npm/yarn/pnpm
- Google Gemini API key ([Get one here](https://ai.google.dev))

### Installation Steps

1. **Clone and Navigate**

```bash
cd helmet
```

2. **Install Dependencies**

```bash
npm install
```

3. **Configure Environment Variables**

Create `.env.local` in the project root:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
```

4. **Run Development Server**

```bash
npm run dev
```

5. **Open Application**

Navigate to [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
npm start
```

---

## 🎨 Frontend Features

### 1. Project Settings Panel

- **Project Tag**: Custom identifier for project naming
- **Confidence Threshold**: Slider to adjust detection sensitivity (5%-100%)
- **Image Quality Settings**: Configure compression, max dimensions, file size
- **Model Selection**: Choose between Gemini and Grok (future)
- **Real-time Validation**: Zod schema validation with instant feedback

### 2. Image Upload Zone

- **Drag & Drop**: Intuitive file upload interface
- **Multi-file Support**: Process multiple images simultaneously
- **Client-side Compression**: Reduce file sizes before upload
- **EXIF Extraction**: Automatic metadata parsing (date, GPS)
- **Preview Gallery**: Thumbnail grid with expand-to-view
- **Progress Indicators**: Visual feedback during compression

### 3. Project List

- **Accordion Layout**: Expandable/collapsible project cards
- **Status Indicators**:
  - ⏳ **Processing**: Real-time detection in progress
  - ✅ **Ready**: Analysis complete
  - ⚠️ **No People**: No detections found
  - ❌ **Error**: Processing failed
- **Statistics Display**: Total images, people detected, helmet compliance
- **Reports Button**: Quick access to report generation modal
- **Remove Function**: Delete projects with confirmation

### 4. Image Detail Modal

- **Full-size Image Display**: Responsive image viewer
- **Bounding Box Overlay**: Percentage-based positioning for stability
- **Color Coding**:
  - Green rectangle: Person with helmet
  - Red rectangle: Person without helmet (violation)
  - Blue rectangle: Detected helmet
- **Person Labels**: Numbered identifiers on bounding boxes
- **Detection Scores**: Confidence percentages for each detection
- **Generate Report**: Individual PDF creation per person

### 5. Reports Modal

- **Summary Statistics**: Total reports, violations, compliance rate
- **Download All (ZIP)**: Batch download with JSZip
- **Individual Downloads**: Per-person PDF generation
- **Status Badges**: Visual indicators for helmet compliance
- **Organized by Image**: Reports grouped by source image

---

## 🛠️ Technology Stack (Detailed)

### Frontend

- **Next.js 16.0** - React framework with App Router
- **React 19** - UI library
- **TypeScript 5** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling
- **Shadcn/ui** - Accessible component library
- **Radix UI** - Headless UI primitives
- **Lucide React** - Icon library
- **React Hot Toast** - Notification system
- **Zod** - Schema validation

### Backend

- **Next.js API Routes** - Serverless functions
- **Better SQLite3** - Embedded database
- **Google Gemini AI** - Machine learning API
- **Sharp** - Server-side image processing
- **pdf-lib** - PDF generation

### DevOps & Tools

- **browser-image-compression** - Client-side optimization
- **ExifReader** - Metadata extraction
- **JSZip** - Client-side ZIP creation
- **server-only** - Bundle optimization

---

## 📈 Performance Characteristics

### Response Times

- **Image Detection**: 2-5 seconds per image (depends on AI API)
- **Database Operations**: < 10ms for queries
- **PDF Generation**: 100-300ms per report
- **Health Check**: < 500ms total

### Scalability

- **Concurrent Images**: Processes multiple images in parallel
- **Database**: SQLite suitable for 10,000+ projects
- **File Storage**: Limited by disk space
- **API Limits**: Respects Gemini API rate limits

---

## 🚦 Status Codes

| Code | Meaning      | Description                                   |
| ---- | ------------ | --------------------------------------------- |
| 200  | Success      | Request completed successfully                |
| 400  | Bad Request  | Invalid parameters or missing required fields |
| 404  | Not Found    | Project or resource not found                 |
| 500  | Server Error | Internal processing error                     |
| 503  | Unavailable  | System health check failed                    |

---

## 📊 Configuration Options

### Project Settings Interface

```typescript
interface ProjectSettings {
  projectTag: string; // Project identifier (alphanumeric, _, -)
  confidence: number; // Detection threshold (0.05 - 1.0)
  geminiWeight: number; // Gemini model weight (0 - 1)
  geminiPrompt: string; // Custom prompt (optional)
  grokWeight: number; // Grok model weight (0 - 1)
  grokPrompt: string; // Custom prompt (optional)
  maxFileSize: number; // Max file size in KB (50 - 15000)
  maxWidth: number; // Max image width (300 - 15000)
  maxHeight: number; // Max image height (200 - 15000)
  outputFormat: string; // Report format ("pdf")
}
```

---

## 🔐 Security Considerations

- **API Key Protection**: Store `GOOGLE_API_KEY` in environment variables
- **Input Sanitization**: All user inputs are validated and sanitized
- **SQL Injection Prevention**: Prepared statements for all queries
- **File System Safety**: Sandboxed file operations in `public/images`
- **Rate Limiting**: Consider implementing for production deployment

---

## 🤝 Contributing

This project demonstrates best practices for:

- TypeScript in Next.js applications
- AI integration with Google Gemini
- Full-stack type safety
- Client/server separation
- Performance optimization
- Error handling and logging

---

## 📝 License

Private project for demonstration purposes.

---

## 🙏 Acknowledgments

- **Google Gemini AI** - Advanced image analysis capabilities
- **Shadcn/ui** - Beautiful, accessible components
- **Next.js Team** - Outstanding framework and documentation
- **Open Source Community** - For all the amazing libraries

---

<div align="center">

**Built with ❤️ using Next.js, TypeScript, and Google Gemini AI**

[Report Bug](https://github.com/yourusername/helmetcheck/issues) • [Request Feature](https://github.com/yourusername/helmetcheck/issues)

</div>
