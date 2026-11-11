import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

const MIME_BY_EXTENSION: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'],
  '.png': ['image/png'], '.webp': ['image/webp'],
  '.doc': ['application/msword', 'application/octet-stream'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
  '.ppt': ['application/vnd.ms-powerpoint', 'application/octet-stream'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/octet-stream'],
  '.txt': ['text/plain', 'application/octet-stream'],
  '.mp4': ['video/mp4', 'audio/mp4', 'application/octet-stream'],
  '.m4a': ['audio/mp4', 'application/octet-stream'],
  '.ogg': ['audio/ogg', 'application/octet-stream'],
  '.mov': ['video/quicktime', 'application/octet-stream'],
  '.avi': ['video/x-msvideo', 'application/octet-stream'],
  '.mkv': ['video/x-matroska', 'application/octet-stream'],
  '.webm': ['video/webm', 'audio/webm', 'application/octet-stream'],
};

function startsWith(buffer: Buffer, bytes: number[]) {
  return buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

export function validateUploadedFile(file: Express.Multer.File): void {
  const ext = path.extname(file.originalname).toLowerCase();
  const supportedMimeTypes = MIME_BY_EXTENSION[ext];
  if (!supportedMimeTypes || !supportedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException('File extension and media type do not match a supported format.');
  }

  const data = file.buffer;
  const zip = startsWith(data, [0x50, 0x4b, 0x03, 0x04]);
  const ole = startsWith(data, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const ftyp = data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp';

  let valid = false;
  switch (ext) {
    case '.pdf': valid = data.toString('ascii', 0, 5) === '%PDF-'; break;
    case '.jpg': case '.jpeg': valid = startsWith(data, [0xff, 0xd8, 0xff]); break;
    case '.png': valid = startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); break;
    case '.webp': valid = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'; break;
    case '.docx': case '.pptx': valid = zip; break;
    case '.doc': case '.ppt': valid = ole; break;
    case '.mp4': case '.mov': case '.m4a': valid = ftyp; break;
    case '.ogg': valid = data.length >= 4 && data.toString('ascii', 0, 4) === 'OggS'; break;
    case '.avi': valid = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'AVI '; break;
    case '.mkv': case '.webm': valid = startsWith(data, [0x1a, 0x45, 0xdf, 0xa3]); break;
    case '.txt': valid = !data.includes(0); break;
  }
  if (!valid) throw new BadRequestException('File content does not match its declared format.');
}
