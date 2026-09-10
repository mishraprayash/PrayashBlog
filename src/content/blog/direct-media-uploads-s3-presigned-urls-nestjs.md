---
title: "Direct Media Uploads at Scale: S3 Presigned URLs, Security Constraints, and NestJS Implementation"
slug: "direct-media-uploads-s3-presigned-urls-nestjs"
description: "Why proxying large file uploads through Node.js exhausts memory and bandwidth: exploring AWS SigV4 presigned URLs, MIME-type locking, and clean NestJS implementation."
publishDate: "2026-08-23T10:00:00Z"
author: "Prayash Mishra"
tags: ["nestjs", "aws", "s3", "architecture", "cloud", "backend"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Direct media upload architecture using AWS S3 presigned URLs in NestJS"
draft: false
---

Streaming 50MB file uploads through your Node.js API servers will eventually bring down your cluster.

A few simultaneous 4K video uploads arrive. Memory buffers spike. The V8 garbage collector starts thrashing. Event-loop latency creeps past 2,000ms. Unrelated HTTP health checks fail, and Kubernetes starts terminating pods.

The fix isn't allocating more RAM to your API pods. It's getting file bytes off your app servers entirely.

With presigned URLs, your backend only ever handles tiny JSON authorization payloads—signing an S3 upload URL in under 5 milliseconds—while the client streams raw bytes directly to object storage.

---

## 1. System Architecture: The Presigned URL Flow

Instead of routing gigabytes of binary file traffic through your application servers, the backend acts purely as an **authorizer and signature generator**. The heavy binary transfer occurs directly between the client and the object storage provider (e.g., AWS S3, Cloudflare R2, or Google Cloud Storage).

```
┌────────┐               ┌───────────────┐               ┌─────────────┐
│ Client │               │ NestJS Server │               │   AWS S3    │
└───┬────┘               └───────┬───────┘               └──────┬──────┘
    │                            │                              │
    │ 1. Request Upload URL      │                              │
    │    (MIME type, size, auth) │                              │
    ├───────────────────────────►│                              │
    │                            │                              │
    │                            │ 2. Validate user auth/quota  │
    │                            │    & generate signed URL     │
    │                            │    (SigV4 HMAC SHA-256)      │
    │                            │                              │
    │ 3. Return Presigned URL    │                              │
    │    & unique storage key    │                              │
    │◄───────────────────────────┤                              │
    │                                                           │
    │ 4. HTTP PUT Direct Binary Stream (Progress Tracking)     │
    ├──────────────────────────────────────────────────────────►│
    │                                                           │
    │ 5. 200 OK (Upload Complete)                               │
    │◄──────────────────────────────────────────────────────────┤
    │                                                           │
    │ 6. Notify Backend (Persist metadata & trigger workers)    │
    ├───────────────────────────►│                              │
    │                            │                              │
```

---

## 2. Comparing Media Upload Approaches

To understand why presigned URLs are essential, let's examine the three common ways engineers handle file uploads:

```
┌─────────────────────────┐   ┌──────────────────────────┐   ┌───────────────────────────┐
│ Approach 1: Base64 JSON │   │ Approach 2: Server Proxy │   │ Approach 3: Presigned URL │
└───────────┬─────────────┘   └────────────┬─────────────┘   └─────────────┬─────────────┘
            │                              │                               │
       [ Client ]                     [ Client ]                      [ Client ]
            │                              │                               │
            │ JSON (+33% size)             │ Multipart stream              │ 1. Request signed URL
            ▼                              ▼                               ▼
     [ Node.js Server ]             [ Node.js Server ]             [ NestJS Server ]
            │ (Heap Bloat)                 │ (I/O Bottleneck)              │
            ▼                              ▼                               │ 2. Return URL
   [ Database / Disk ]                 [ AWS S3 ]                          ▼
                                                                      [ Client ]
                                                                           │
                                                                           │ 3. Direct binary PUT
                                                                           ▼
                                                                       [ AWS S3 ]
```

### Approach 1: Base64 in JSON Payloads
Encoding a binary file as a Base64 string inside a standard JSON `POST` request.
* **Why it fails**: Base64 encoding increases payload size by **~33%**. Parsing a 30MB base64 string inside the V8 JSON parser blocks the Node.js event loop and inflates garbage collection pauses.
* **Verdict**: Acceptable only for sub-50KB inline avatars; dangerous for general media.

### Approach 2: Server Multipart Proxy (Multer / Busboy)
The client sends a `multipart/form-data` stream to the Node.js server. The server buffers it (in memory or `/tmp` disk) and streams it out to AWS S3.
* **Why it fails**:
  1. **Double Bandwidth Cost**: Every byte travels twice (Client → Server → S3). You pay double network egress/ingress.
  2. **Thread & Socket Saturation**: If 50 users upload 100MB files on slow 4G connections (taking 30 seconds each), 50 Node.js HTTP sockets and worker streams remain occupied, starving regular API traffic.
  3. **V8 Heap Pressure**: In-memory buffering (`multer.memoryStorage()`) quickly triggers `JavaScript heap out of memory` under concurrency.
* **Verdict**: Works for small internal tools; breaks under consumer scale.

### Approach 3: Direct Uploads via Presigned URLs
The client requests a signed URL with strict cryptographic constraints. The client uploads the binary directly to S3 using standard HTTP `PUT`.
* **Advantages**:
  * **Zero Server Bandwidth**: Server bandwidth drops to near zero (only lightweight JSON metadata exchanged).
  * **Infinite Scalability**: S3 scales automatically to thousands of parallel multipart uploads without impacting your API servers.
  * **Granular Upload Progress**: The client browser/mobile app tracks upload percentage natively via `XMLHttpRequest.upload.onprogress` or `fetch` streams.

### Architectural Trade-Off Matrix

| Evaluation Dimension | Base64 in JSON | Server Multipart Proxy | S3 Presigned URL |
| :--- | :--- | :--- | :--- |
| **API Server Memory Impact** | Critical (V8 Heap bloat) | High (Buffer allocation) | **Zero (Metadata only)** |
| **Server Bandwidth Usage** | 133% single-hop | 200% double-hop | **0% (Direct to S3)** |
| **Upload Speed for Users** | Slowest | Moderate | **Fastest (Direct S3 Edge)** |
| **Max File Size Capability** | ~5 MB | ~50 MB | **5 TB (S3 limit)** |
| **Immediate Processing** | Synchronous | In-process stream | Asynchronous (S3 Events / SQS) |

---

## 3. The Mechanics of AWS SigV4 Presigned URLs

A presigned URL is a standard HTTPS S3 endpoint appended with query parameters containing a **cryptographic HMAC-SHA256 signature** generated with your AWS secret credentials:

```
https://my-bucket.s3.us-east-1.amazonaws.com/uploads/user-123/avatar.png
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20260824%2Fus-east-1%2Fs3%2Faws4_request
  &X-Amz-Date=20260824T000000Z
  &X-Amz-Expires=300
  &X-Amz-SignedHeaders=content-type%3Bhost
  &X-Amz-Signature=a1b2c3d4e5f6...
```

When the client executes an HTTP `PUT` to this URL, AWS S3 recalculates the signature using its internal key. If the signature matches, the upload is accepted without requiring the client to hold AWS IAM credentials.

### Critical Security Constraints
A naive presigned URL implementation can create massive security vulnerabilities. You must enforce three boundaries:
1. **Short Expiration (`expiresIn`)**: Keep URL validity short (e.g., 60 to 300 seconds). Once expired, the URL cannot be reused.
2. **Content-Type Locking**: Sign the exact `ContentType` (e.g., `image/png`). If an attacker attempts to upload an executable `.exe` or HTML script using the signed URL, S3 rejects the request with `403 Forbidden` because the header signature does not match.
3. **Deterministic Content-Addressed or UUID Keys**: Never let the client specify raw file paths to prevent **S3 Path Traversal** or overwriting other users' assets.

---

## 4. Production NestJS Implementation

Let's implement a production-ready media upload service in NestJS using the modular **AWS SDK for JavaScript v3** (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`).

### 4.1 Installing Dependencies
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install class-validator class-transformer
```

### 4.2 DTO Validation
We enforce strict MIME type whitelisting and file size boundaries at the API gateway layer:

```typescript
// src/media/dto/generate-presigned-url.dto.ts
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export enum AllowedMimeType {
  PNG = 'image/png',
  JPEG = 'image/jpeg',
  WEBP = 'image/webp',
  PDF = 'application/pdf',
}

export class GeneratePresignedUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsEnum(AllowedMimeType, {
    message: 'Invalid file type. Allowed: PNG, JPEG, WEBP, PDF',
  })
  contentType: AllowedMimeType;

  @IsInt()
  @Min(1024, { message: 'File size must be at least 1KB' })
  @Max(25 * 1024 * 1024, { message: 'File size cannot exceed 25MB' })
  fileSizeBytes: number;
}

export class ConfirmUploadDto {
  @IsString()
  @IsNotEmpty()
  storageKey: string;
}
```

### 4.3 S3 Storage Service
We encapsulate AWS SDK operations in a dedicated, testable service:

```typescript
// src/media/media-storage.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { GeneratePresignedUrlDto } from './dto/generate-presigned-url.dto';

export interface PresignedUrlResponse {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

@Injectable()
export class MediaStorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly logger = new Logger(MediaStorageService.name);

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.bucketName = this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
  }

  async generateUploadUrl(
    userId: string,
    dto: GeneratePresignedUrlDto,
  ): Promise<PresignedUrlResponse> {
    const fileExtension = path.extname(dto.fileName).toLowerCase();
    const uniqueId = crypto.randomUUID();
    
    // Structured, tenant-isolated storage path
    const storageKey = `uploads/${userId}/${uniqueId}${fileExtension}`;
    const expiresInSeconds = 300; // 5 minutes TTL

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: dto.contentType,
      ContentLength: dto.fileSizeBytes, // Binds signature to exact size
      Metadata: {
        'uploaded-by': userId,
        'original-filename': encodeURIComponent(dto.fileName),
      },
    });

    try {
      // Cryptographically sign the command
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type', 'content-length']),
      });

      this.logger.log(`Generated presigned upload URL for user ${userId}: ${storageKey}`);

      return {
        uploadUrl,
        storageKey,
        expiresInSeconds,
      };
    } catch (error) {
      this.logger.error('Failed to generate presigned S3 URL:', error);
      throw new BadRequestException('Could not generate secure upload URL.');
    }
  }

  async verifyUploadComplete(storageKey: string): Promise<boolean> {
    try {
      // Verify the object actually exists in S3 before persisting record to database
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });

      const response = await this.s3Client.send(headCommand);
      return response.ContentLength !== undefined && response.ContentLength > 0;
    } catch (error) {
      this.logger.warn(`Verification failed for storage key ${storageKey}: ${error.message}`);
      return false;
    }
  }
}
```

### 4.4 Controller & Confirmation Endpoint
```typescript
// src/media/media.controller.ts
import { Body, Controller, Post, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { MediaStorageService } from './media-storage.service';
import { GeneratePresignedUrlDto, ConfirmUploadDto } from './dto/generate-presigned-url.dto';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaStorageService: MediaStorageService) {}

  @Post('presign-upload')
  async getPresignedUrl(@Request() req: any, @Body() dto: GeneratePresignedUrlDto) {
    // In production, extract user ID from authenticated JWT session
    const userId = req.user?.id || 'usr_anonymous_123';
    return this.mediaStorageService.generateUploadUrl(userId, dto);
  }

  @Post('confirm-upload')
  async confirmUpload(@Request() req: any, @Body() dto: ConfirmUploadDto) {
    const isVerified = await this.mediaStorageService.verifyUploadComplete(dto.storageKey);

    if (!isVerified) {
      throw new BadRequestException('File was not successfully uploaded to storage.');
    }

    // Persist verified media record to database (e.g. PostgreSQL/Prisma)
    return {
      status: 'VERIFIED',
      storageKey: dto.storageKey,
      publicUrl: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${dto.storageKey}`,
    };
  }
}
```

---

## 5. S3 Bucket CORS Configuration

Because the client browser initiates an HTTP `PUT` directly to `https://my-bucket.s3.amazonaws.com`, the browser will send an HTTP `OPTIONS` preflight request. Your S3 bucket must have a **CORS (Cross-Origin Resource Sharing)** policy enabled:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedOrigins": ["https://app.yourdomain.com", "http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 6. Real-World Limitations & Asynchronous Post-Processing

While Presigned URLs solve the bandwidth and scalability bottlenecks of file uploads, they introduce new architectural trade-offs:

1. **Missing In-Line Virus Scanning & Image Resizing**:
   * Because files bypass your API server, you cannot run Sharp image resizing or ClamAV virus scanning synchronously during the upload.
   * **Solution**: Use **S3 Event Notifications → AWS SQS → NestJS Worker** (or AWS Lambda) to asynchronously generate thumbnails and scan files after upload.
2. **Abandoned Uploads**:
   * A user may request a presigned URL but close the browser before uploading, leaving orphaned keys or empty state.
   * **Solution**: Use **S3 Lifecycle Rules** to automatically delete objects in `uploads/temp/` that are older than 24 hours if unconfirmed.

---

## Summary Architecture Checklist

* [x] **Zero Server Bandwidth**: Transfer media directly from client to S3 using HTTP `PUT`.
* [x] **SigV4 Security**: Lock signed URLs with short expiration (300s) and strict `ContentType` headers.
* [x] **DTO Perimeter Validation**: Validate MIME types and size limits in NestJS before generating URLs.
* [x] **HeadObject Verification**: Verify file existence and non-zero byte length before persisting database records.
* [x] **CORS Policy**: Enable `PUT` and `HEAD` methods on your S3 bucket for allowed origins.
