'use client';

import { CaptionPlugin } from '@platejs/caption/react';
import { ImagePlugin } from '@platejs/media/react';
import { KEYS } from 'platejs';
import type { AnyPlatePlugin } from 'platejs/react';
import { ImageElement } from '@/editor/ui/media-image-node';

/**
 * `@plate/media-kit` trimmed to the image (docs/05 section 2): audio, video, files, embeds
 * and the upload placeholder have no Markdown form in the v1 codec. The caption plugin is
 * here because `@platejs/media` keeps an image's alt text in `caption`; the caption UI itself
 * waits for the caption rule of docs/05 section 5 (P2-T12).
 */
export const MediaKit: AnyPlatePlugin[] = [
  ImagePlugin.withComponent(ImageElement),
  CaptionPlugin.configure({
    options: { query: { allow: [KEYS.img] } },
  }),
];
