/*!
 * SPDX-License-Identifier: CPAL-1.0
 *
 * The contents of this file are subject to the Common Public Attribution License
 * Version 1.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * https://opensource.org/license/CPAL-1.0 and in the accompanying LICENSE.md.
 * The License is based on the Mozilla Public License Version 1.1 but Sections 14
 * and 15 have been added to cover use of software over a computer network and
 * provide for limited attribution for the Original Developer. In addition,
 * Exhibit A has been modified to be consistent with Exhibit B.
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for
 * the specific language governing rights and limitations under the License.
 *
 * The Original Code is Svitylo 3D Anatomy Atlas.
 * The Original Developer is the Initial Developer.
 * The Initial Developer of the Original Code is authorOd.
 * All portions of the code written by authorOd are Copyright (c) 2026 authorOd.
 * All Rights Reserved.
 * Contributor(s): see the source history and accompanying copyright notices.
 */
import { readFileSync } from 'node:fs';
import { fileExists, readJson } from './io.js';
import type { SourceNode } from './tree.js';

export interface Ta2Lookup {
  latin(english: string): string | undefined;
  ambiguous: Set<string>;
  size: number;
}

const key = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Reads the snapshot's TA2.csv (`"TA2ID;English;Latin;…"`, one quoted record per line) into an
 * English -> Latin lookup. English terms with several different Latin equivalents are marked
 * ambiguous and never resolved, so no Latin name is guessed.
 */
export function readTa2(path: string): Ta2Lookup {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    let line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith('"') && line.endsWith('"')) line = line.slice(1, -1);
    const fields = line.split(';');
    const english = fields[1]?.trim();
    const latin = fields[2]?.trim();
    if (!english || !latin) continue;
    const k = key(english);
    const prev = map.get(k);
    if (prev === undefined) map.set(k, latin);
    else if (prev !== latin) ambiguous.add(k);
  }
  return {
    latin: (english) => {
      const k = key(english);
      return ambiguous.has(k) ? undefined : map.get(k);
    },
    ambiguous,
    size: map.size,
  };
}

export interface UkDraft {
  name: string;
  synonyms?: string[];
}

/** Ukrainian drafts keyed by English base name (applies to both sides of paired structures). */
export function readUkDrafts(path: string): Map<string, UkDraft> {
  const out = new Map<string, UkDraft>();
  if (!fileExists(path)) return out;
  const file = readJson<{ terms: Record<string, string | UkDraft> }>(path);
  for (const [english, value] of Object.entries(file.terms)) {
    out.set(key(english), typeof value === 'string' ? { name: value } : value);
  }
  return out;
}

export const termKey = key;

export interface UkName extends UkDraft {
  /** Provenance written to the dictionary entry. */
  source: string;
}

export type UkTermLookup = (english: string) => UkName | undefined;

export const UK_SOURCES = {
  editors: 'Atlas Ukrainian drafts',
  machine: 'Atlas Ukrainian machine-assisted drafts',
} as const;

/** Ukrainian term by English name: editors' drafts win over machine-assisted drafts. */
export function ukTermLookup(editors: Map<string, UkDraft>, machine: Map<string, UkDraft>): UkTermLookup {
  return (english) => {
    const k = key(english);
    const own = editors.get(k);
    if (own) return { ...own, source: UK_SOURCES.editors };
    const drafted = machine.get(k);
    return drafted ? { ...drafted, source: UK_SOURCES.machine } : undefined;
  };
}

const UK_ATTACHMENT: Record<NonNullable<SourceNode['attachmentOf']>['kind'], string> = {
  origin: 'початок',
  insertion: 'прикріплення',
  group: 'місця прикріплення',
};

/**
 * Ukrainian draft of a node: the system's configured name, the term of its base name or, for
 * muscle attachment patches, the muscle's name with the patch kind (the Ukrainian for "… (origin 2)").
 */
export function ukrainianDraft(node: SourceNode, lookup: UkTermLookup): UkName | undefined {
  if (node.kind === 'system' && node.system.name?.uk) return { name: node.system.name.uk, source: UK_SOURCES.editors };
  if (node.termKey) return lookup(node.termKey);
  const attachment = node.attachmentOf;
  if (!attachment) return undefined;
  const muscle = lookup(attachment.base);
  if (!muscle) return undefined;
  const label = `${UK_ATTACHMENT[attachment.kind]}${attachment.index !== undefined ? ` ${attachment.index}` : ''}`;
  return { name: `${muscle.name} (${label})`, source: `${muscle.source}, composed with the attachment kind` };
}
