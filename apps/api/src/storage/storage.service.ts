import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { AuthUser } from '../common/types/authenticated-request';
import { resolveFromWorkspace } from '../common/utils/path.util';
import { PrismaService } from '../prisma/prisma.service';

type UploadableFile = {
  originalname: string;
  buffer: Buffer;
};

@Injectable()
export class StorageService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async saveFile(file: UploadableFile, folder: string) {
    const targetDirectory = join(this.getUploadRoot(), folder);
    const extension = extname(file.originalname) || '';
    const filename = `${basename(file.originalname, extension)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${randomUUID()}${extension}`;

    await mkdir(targetDirectory, { recursive: true });
    await writeFile(join(targetDirectory, filename), file.buffer);

    return this.getMediaUrl(folder, filename);
  }

  async getAuthorizedFilePath(
    user: AuthUser,
    folder: string,
    filename: string,
  ) {
    const safeFilename = basename(filename);
    const allowedFolders = new Set([
      'disease-reports',
      'voice-notes',
      'profile-photos',
      'community-posts',
      'expense-receipts',
      'assistant-attachments',
    ]);

    if (!allowedFolders.has(folder)) {
      throw new NotFoundException('Media file not found');
    }

    if (user.role !== 'ADMIN') {
      const isOwned = await this.isOwnedByUser(user.sub, folder, safeFilename);

      if (!isOwned) {
        throw new NotFoundException('Media file not found');
      }
    }

    const absolutePath = join(this.getUploadRoot(), folder, safeFilename);
    await access(absolutePath, constants.R_OK).catch(() => {
      throw new NotFoundException('Media file not found');
    });

    return absolutePath;
  }

  private async isOwnedByUser(
    userId: string,
    folder: string,
    filename: string,
  ) {
    const mediaSuffix = `/${folder}/${filename}`;
    const mediaUrl = this.getMediaUrl(folder, filename);

    if (folder === 'profile-photos') {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            { profilePhotoUrl: mediaUrl },
            { profilePhotoUrl: { endsWith: mediaSuffix } },
          ],
        },
        select: { id: true },
      });

      return Boolean(user);
    }

    if (folder === 'community-posts') {
      const post = await this.prisma.communityPost.findFirst({
        where: {
          OR: [
            {
              imageUrl: mediaUrl,
            },
            {
              imageUrl: {
                endsWith: mediaSuffix,
              },
            },
          ],
        },
        select: {
          authorId: true,
          hidden: true,
        },
      });

      if (!post) {
        return false;
      }

      return !post.hidden || post.authorId === userId;
    }

    if (folder === 'expense-receipts') {
      const expense = await this.prisma.expenseEntry.findFirst({
        where: {
          userId,
          OR: [
            { receiptUrl: mediaUrl },
            { receiptUrl: { endsWith: mediaSuffix } },
          ],
        },
        select: { id: true },
      });

      return Boolean(expense);
    }

    if (folder === 'assistant-attachments') {
      const assistantMessages = await this.prisma.assistantMessage.findMany({
        where: {
          thread: {
            userId,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { attachments: true },
      });

      return assistantMessages.some((message) =>
        parseAssistantMediaUrls(message.attachments).some(
          (attachmentUrl) =>
            attachmentUrl === mediaUrl || attachmentUrl.endsWith(mediaSuffix),
        ),
      );
    }

    const report = await this.prisma.diseaseReport.findFirst({
      where: {
        userId,
        OR: [
          { image1Url: mediaUrl },
          { image1Url: { endsWith: mediaSuffix } },
          { image2Url: mediaUrl },
          { image2Url: { endsWith: mediaSuffix } },
          { voiceNoteUrl: mediaUrl },
          { voiceNoteUrl: { endsWith: mediaSuffix } },
        ],
      },
      select: { id: true },
    });

    return Boolean(report);
  }

  private getUploadRoot() {
    return resolveFromWorkspace(
      this.configService.get<string>('UPLOAD_DIR', 'apps/api/uploads'),
    );
  }

  private getPublicBaseUrl() {
    const configuredBaseUrl = this.configService.get<string>(
      'PUBLIC_UPLOAD_BASE_URL',
      'http://localhost:4000/v1/media',
    );

    return configuredBaseUrl.replace(/\/uploads\/?$/i, '/v1/media');
  }

  private getMediaUrl(folder: string, filename: string) {
    return `${this.getPublicBaseUrl()}/${folder}/${filename}`;
  }
}

function parseAssistantMediaUrls(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) =>
          item &&
          typeof item === 'object' &&
          'url' in item &&
          typeof item.url === 'string'
            ? item.url
            : null,
        )
        .filter((url): url is string => Boolean(url))
    : [];
}
