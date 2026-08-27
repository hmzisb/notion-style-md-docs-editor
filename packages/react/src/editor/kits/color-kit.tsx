'use client';

import { BaseColorPlugin } from '@docs/core';
import { toPlatePlugin } from 'platejs/react';

import { ColorLeaf } from '@/editor/ui/color-node';

/** The mark the core kit parses (DEV-034), with the leaf that paints it. */
export const ColorKit = [toPlatePlugin(BaseColorPlugin).withComponent(ColorLeaf)];
