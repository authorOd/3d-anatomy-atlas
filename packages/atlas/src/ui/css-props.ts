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
import { noChange } from 'lit';
import { Directive, PartType, directive, type ElementPart, type PartInfo } from 'lit/directive.js';

/**
 * Element directive that sets inline style properties through the CSSOM
 * (`style.setProperty`). Unlike a `style` attribute — including Lit's `styleMap`, which writes
 * the attribute on first render — this is allowed by a strict CSP without
 * `style-src 'unsafe-inline'`.
 *
 *   html`<div ${cssProps({ top: '34px', 'padding-left': '14px' })}></div>`
 */
class CssPropsDirective extends Directive {
  private previous = new Set<string>();

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) throw new Error('cssProps() must be used as an element directive');
  }

  render(_props: Readonly<Record<string, string>>) {
    return noChange;
  }

  override update(part: ElementPart, [props]: [Readonly<Record<string, string>>]) {
    const { style } = part.element as HTMLElement;
    for (const name of this.previous) if (!(name in props)) style.removeProperty(name);
    for (const [name, value] of Object.entries(props)) style.setProperty(name, value);
    this.previous = new Set(Object.keys(props));
    return noChange;
  }
}

export const cssProps = directive(CssPropsDirective);
