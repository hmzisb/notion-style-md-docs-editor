'use client';

import { TogglePlugin } from '@platejs/toggle/react';

import { IndentKit } from '@/editor/kits/indent-kit';
import { ToggleElement } from '@/editor/ui/toggle-node';

export const ToggleKit = [...IndentKit, TogglePlugin.withComponent(ToggleElement)];
