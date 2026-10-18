---
title: "Direct Media Uploads at Scale: S3 Presigned URLs, Security Constraints, and NestJS Implementation"
slug: "direct-media-uploads-s3-presigned-urls-nestjs"
description: "Why proxying large file uploads through Node.js exhausts memory and bandwidth: exploring AWS SigV4 presigned URLs, MIME-type locking, and clean NestJS implementation."
publishDate: "2026-08-23T10:00:00Z"
author: "Prayash Mishra"
tags: ["nestjs", "aws", "s3", "architecture", "backend"]
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
      // Signing content-type is safe: the client controls it and we hand the
      // expected value back in the response so they can echo it exactly.
      ContentType: dto.contentType,
      // NOTE: do NOT set ContentLength here, and do NOT add 'content-length'
      // to signableHeaders. See the pitfall below — it is the single most
      // common cause of a 403 SignatureDoesNotMatch on uploads that work
      // perfectly in Postman and curl.
      Metadata: {
        'uploaded-by': userId,
        'original-filename': encodeURIComponent(dto.fileName),
      },
    });

    try {
      // Cryptographically sign the command
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type']),
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

## 6. Edge Cases

Presigned uploads look simple and fail in ways that are not obvious until you
have real users on real networks. These are the ones that actually page you.

### ⚠️ Pitfall: Signing `content-length` Breaks Every Browser Upload

The original version of this service set `ContentLength` on the command and
added `'content-length'` to `signableHeaders`, commented "Binds signature to
exact size." It is a tempting idea and it is wrong.

SigV4 works by hashing the headers you signed. Whatever appears in
`X-Amz-SignedHeaders` **must arrive at S3 byte-for-byte identical** or the
signature does not match and you get:

```
HTTP 403
<Code>SignatureDoesNotMatch</Code>
<Message>The request signature we calculated does not match the signature you provided. Check your key and signing method.</Message>
```

`Content-Length` is a **forbidden header name** in the Fetch spec. Your
JavaScript cannot set it. The browser computes it from the body and, for a
stream it cannot measure in advance, may switch to `Transfer-Encoding: chunked`
and send no length at all. Either way the header you signed does not arrive, and
the upload fails.

**Symptom → cause → fix:** `403 SignatureDoesNotMatch` on every browser upload,
while the identical `curl -T` from a terminal succeeds → `content-length` is in
your `X-Amz-SignedHeaders` → remove it from both `PutObjectCommand` and
`signableHeaders`. `curl` succeeds because it *can* set the header, which is
exactly what makes this so confusing to debug.

The legitimate worry behind the original comment — "a client could upload a
100 GB object" — is real, and it is not solved by signing. See the next item.

### ⚠️ Pitfall: The Presigned URL Does Not Enforce Your Size Limit

`GeneratePresignedUrlDto` validates `fileSizeBytes` at the API boundary, and
then that value is thrown away. Nothing binds it to the upload. A client can
request a URL for "5 MB", ignore the response, and `PUT` a 5 GB object with the
same valid signature. Your DTO validation is a suggestion.

Three ways to actually enforce a ceiling, in increasing order of cost:

| Approach | How | Trade-off |
|---|---|---|
| **Bucket policy** | `deny` any `PutObject` where `s3:content-length-range` exceeds your max | Strongest, no app changes, but a policy change is an infra change and the error surfaces to the client as `AccessDenied`, not a friendly 413 |
| **POST policy** (`createPresignedPost`) | Conditions travel with the signature and are enforced atomically | The right answer for browser form uploads; requires `POST` to a generated form, not `PUT` to a URL |
| **Quotas / `Content-Length` condition** | Narrow, awkward, still client-visible | Not worth it |

For a `PUT`-based presigned URL, use the bucket policy. For a form upload, use a
POST policy — it is the only one of these where the limit is enforced by the
same signature that authorizes the upload.

### ⚠️ Pitfall: `content-type` Must Match Exactly, Including Parameters

If you sign `content-type: image/jpeg` and the browser sends
`image/jpeg; charset=binary`, the header differs and you get another
`SignatureDoesNotMatch`. This bites when the client derives the type from
`File.type` rather than echoing the value you returned.

Return the signed content type in your API response and have the client use
that value verbatim. Do not let the client decide.

```typescript
// Client: use the server's value, not file.type
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': response.contentType },
  body: file,
});
```

`file.type` is also frequently the empty string for types the OS does not
recognise, which produces a signed header of `""` and an immediate mismatch.

### Edge case: files larger than the 5 GB single-`PUT` limit

`PutObject` caps at 5 GB. Past that you need S3 multipart upload, which means
`CreateMultipartUpload` / `UploadPart` / `CompleteMultipartUpload`, each part
presigned separately, with the part numbers tracked client-side. A single
presigned `PUT` URL cannot do it.

"Direct media uploads **at scale**" means two different architectures depending
on whether you need to cross 5 GB. Decide which one you are building before you
promise it.

### Edge case: abandoned uploads

A user can request a URL and close the tab. Nothing is written, so there is no
object to clean up — but if your flow is *confirm-then-orphan* rather than
*upload-then-confirm*, you accumulate unreferenced rows in your database.
Prefer a lifecycle rule on a `uploads/pending/` prefix as a backstop, and treat
the database as the source of truth rather than the bucket listing.

### Edge case: CORS failures masquerading as signature errors

A preflight failure and a signature failure both surface in the browser console
as a 403 on `PUT`. Check whether `OPTIONS` succeeded before you start reading
SigV4. `ExposeHeaders` matters too: without it the browser cannot read
`ETag` or `x-amz-version-id` from the response, so your client-side confirmation
step has nothing to read.

### Edge case: hand-built S3 URLs

The URL in section 3 is virtual-hosted style, with the bucket in the hostname:

```
https://my-bucket.s3.us-east-1.amazonaws.com/uploads/user-123/avatar.png
```

Path-style puts the bucket in the path instead, and AWS has announced its
deprecation:

```
https://s3.us-east-1.amazonaws.com/my-bucket/uploads/user-123/avatar.png
```

The SDK generates virtual-hosted URLs for you, so this only bites URLs you
build by hand. The `publicUrl` in the confirm endpoint above is one: it
hard-codes the global `s3.amazonaws.com` host. For a bucket outside
`us-east-1`, put the region in the hostname.

---

## 7. Verifying the Upload

`HeadObject` confirms the object exists, but existence is not integrity. If you
care about the bytes — and for uploads you then serve to other users, you should
— verify a checksum. Have the client compute one, send it, and have S3 verify it
server-side rather than trusting a round trip through your own API.

---

## Summary Architecture Checklist

Verify each of these against your own deployment. They are claims to test, not
boxes to tick.

* [ ] **Zero server bandwidth**: media moves client → S3 over `PUT`; your API only signs and confirms.
* [ ] **Short expiry**: 300s is a reasonable default. Confirm it is long enough for your slowest real connection on a large file, and short enough that a leaked URL is not a permanent write capability.
* [ ] **`content-length` is not signed.** Check `X-Amz-SignedHeaders` in a generated URL and confirm the only entries are `host` and `content-type`.
* [ ] **`content-type` is returned to the client** and echoed verbatim, not re-derived from `File.type`.
* [ ] **Size limit is enforced by S3**, not only by the DTO. Confirm with a deliberately oversized `PUT`.
* [ ] **Bucket CORS** permits `PUT`, `HEAD`, and `OPTIONS` from your origins, and `ExposeHeaders` includes `ETag`.
* [ ] **Post-upload processing is wired** (S3 event → queue → worker) for virus scanning and thumbnailing, or you have accepted that uploaded files are unscanned.
* [ ] **Abandoned uploads** are handled by a lifecycle rule or are a non-issue by design.
