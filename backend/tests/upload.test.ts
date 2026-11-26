import fs from 'fs';
import http from 'http';
import path from 'path';
import { AddressInfo } from 'net';
import sharp from 'sharp';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import app from '../src/server';
import { User } from '../src/models';
import { sanitizeAndReencodeImage, storageService } from '../src/services/storageService';

describe('Media upload security (magic bytes, EXIF stripping, WebP re-encoding & avatar replacement)', () => {
  let server: http.Server;
  let baseUrl = '';
  const uploadedKeys: string[] = [];

  beforeAll(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await clearTestDB();
    vi.restoreAllMocks();
    while (uploadedKeys.length > 0) {
      const key = uploadedKeys.pop();
      if (key) {
        await storageService.deleteObject(key);
      }
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectTestDB();
  });

  it('rejects a spoofed .png file whose actual bytes are HTML with 400', async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Media Tester',
        email: 'media.tester@uconext.test',
        password: 'StrongPassword1',
      }),
    });
    const { token }: any = await regRes.json();

    const fakePngForm = new FormData();
    fakePngForm.append(
      'image',
      new Blob(['<html><body><script>alert(1)</script></body></html>'], { type: 'image/png' }),
      'malicious.png'
    );

    const res = await fetch(`${baseUrl}/api/media/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fakePngForm,
    });
    expect(res.status).toBe(400);
  });

  it('strips EXIF metadata when re-encoding JPEG images to WebP', async () => {
    // Generate a real JPEG embedded with EXIF metadata (Camera/Artist/GPS-style tags)
    const jpegWithExif = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .withExif({
        IFD0: {
          Make: 'SensitiveCamera',
          Model: 'GPS-Tracker-9000',
          Artist: 'PrivateLocation',
        },
      })
      .jpeg()
      .toBuffer();

    const inputMeta = await sharp(jpegWithExif).metadata();
    expect(inputMeta.exif).toBeTruthy();

    const sanitized = await sanitizeAndReencodeImage(jpegWithExif, 'product');
    const outputMeta = await sharp(sanitized).metadata();
    expect(outputMeta.format).toBe('webp');
    expect(outputMeta.exif).toBeUndefined();
  });

  it('updates user.avatar on /api/media/avatar and calls deleteObject with the previous avatar key', async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Avatar Owner',
        email: 'avatar.owner@uconext.test',
        password: 'StrongPassword1',
      }),
    });
    const { token, user }: any = await regRes.json();

    const pngBytes = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 10, g: 200, b: 120, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const uploadOnce = async () => {
      const form = new FormData();
      form.append('image', new Blob([new Uint8Array(pngBytes)], { type: 'image/png' }), 'pic.png');
      const res = await fetch(`${baseUrl}/api/media/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { imageUrl: string; key: string };
    };

    const first = await uploadOnce();
    uploadedKeys.push(first.key);
    expect(first.imageUrl).toMatch(/^\/uploads\/avatar\/[0-9a-f-]+\.webp$/);

    const deleteSpy = vi.spyOn(storageService, 'deleteObject');
    const second = await uploadOnce();
    uploadedKeys.push(second.key);
    expect(second.key).not.toBe(first.key);

    // Wait a microtask for async best-effort deleteObject
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(deleteSpy).toHaveBeenCalledWith(first.key);

    const freshUser = await User.findById(user.id);
    expect(freshUser?.avatar).toBe(second.imageUrl);

    const firstDiskPath = path.resolve(__dirname, '../public/uploads', first.key);
    expect(fs.existsSync(firstDiskPath)).toBe(false);
  });
});
