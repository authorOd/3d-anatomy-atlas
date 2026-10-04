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
import type { AtlasErrorCode } from '../core/errors.js';
import type { ReviewStatus } from '../schema/index.js';

export type UiLang = 'uk' | 'en';

export interface UiStrings {
  appLabel: string;
  loading: string;
  loadAll: string;
  loadAllHint: string;
  emptyTitle: string;
  emptyText: string;
  searchPlaceholder: string;
  searchLabel: string;
  searchEmpty: string;
  searchResults: (n: number) => string;
  noGeometry: string;
  notLoaded: string;
  loadingShort: string;
  failedShort: string;
  systems: string;
  treeLabel: string;
  expand: string;
  collapse: string;
  show: string;
  hide: string;
  showHidden: (n: number) => string;
  isolate: string;
  /** Tooltip of "Isolate" for the whole selection / for one structure. */
  isolateSelectionHint: string;
  isolateHint: string;
  clearIsolation: string;
  isolatedStatus: string;
  hideSelectionHint: string;
  /** Tooltip of the pressed whole-selection "Hide": shows the selection again. */
  showSelectionHint: string;
  hideHint: string;
  /** "Centre": the camera on the whole selection. */
  focus: string;
  focusHint: string;
  /** "Zoom to": the camera on one structure (its card). */
  zoomTo: string;
  zoomToHint: string;
  close: string;
  /** Surroundings level of the selection: the stepper in the selection block. */
  surroundingsDepth: string;
  /** The stepper while nothing is selected. */
  surroundingsNoSelection: string;
  /** Level 0: only the selection is shown. */
  selectionOnly: string;
  lessSurroundings: string;
  moreSurroundings: string;
  wholeBody: string;
  surroundingsLevelOf: (level: number, total: number) => string;
  /** The same on the camera bar of narrow layouts (the group label names the surroundings). */
  surroundingsLevelShort: (level: number, total: number) => string;
  /** Transparency of everything that is not selected: the slider on the camera bar. */
  transparency: string;
  /** The slider at its left end (opaque). */
  transparencyNone: string;
  transparencyOn: (percent: number) => string;
  transparencyOff: string;
  wholeSelection: string;
  camera: string;
  views: string;
  view: Record<'anterior' | 'posterior' | 'left' | 'right' | 'superior' | 'inferior', string>;
  zoomIn: string;
  zoomOut: string;
  fitAll: string;
  reset: string;
  share: string;
  shareTitle: string;
  shareCopy: string;
  shareCopied: string;
  shareNative: string;
  shareTooLarge: string;
  shareDownloadJson: string;
  shareUnavailable: string;
  economy: string;
  economyHint: string;
  termLanguage: string;
  languageHint: string;
  latinToggle: string;
  latinHint: string;
  settings: string;
  showStructuresPanel: string;
  hideStructuresPanel: string;
  showInfoPanel: string;
  hideInfoPanel: string;
  panelWidth: string;
  langNames: Record<'uk' | 'la' | 'en', string>;
  fullscreen: string;
  exitFullscreen: string;
  menu: string;
  info: string;
  selectedCount: (n: number) => string;
  nothingSelected: string;
  selectionEmptyHint: string;
  details: string;
  embedTitle: string;
  embedStart: string;
  embedStartLabel: (title: string) => string;
  embedOpen: string;
  embedOpenHint: string;
  clearSelection: string;
  deselect: string;
  sources: string;
  sourcesTitle: string;
  sourcesIntro: string;
  licence: string;
  author: string;
  source: string;
  /** Card details: what the atlas corrected in the structure (resolved issues). */
  corrected: string;
  changes: string;
  attribution: string;
  permissionBasis: string;
  audit: string;
  auditStatus: Record<'pending' | 'approved' | 'rejected', string>;
  included: string;
  excluded: string;
  commercialUse: Record<'allowed' | 'not-allowed' | 'unknown', string>;
  codeLicence: string;
  codeLicenceText: string;
  releaseDocuments: string;
  progress: (loaded: number, total: number, mbLoaded: string, mbTotal: string) => string;
  cancel: string;
  cancelled: string;
  resume: string;
  retry: string;
  dismiss: string;
  partialLoad: string;
  sides: Record<'left' | 'right' | 'median' | 'bilateral', string>;
  synonyms: string;
  path: string;
  review: string;
  anatomyReview: string;
  translationReview: string;
  reviewStatus: Record<ReviewStatus, string>;
  /** Screen reader suffix of an unreviewed Ukrainian name (the word "draft" is never shown). */
  draft: string;
  draftLegend: string;
  draftSample: string;
  nameFallback: string;
  missingName: string;
  knownIssues: string;
  gap: string;
  gapReasons: Record<'licence' | 'missing' | 'excluded', string>;
  geometry: string;
  reviewNotice: string;
  selected: (name: string) => string;
  deselected: (name: string) => string;
  selectionCleared: string;
  viewportLabel: string;
  webgl2Title: string;
  webgl2Text: string;
  contextLostTitle: string;
  contextLostText: string;
  restore: string;
  brandLabel: string;
  errors: Partial<Record<AtlasErrorCode, string>>;
  errorGeneric: string;
  unknownIdsInLink: (ids: string) => string;
  /** @deprecated Not shown since 1.2.0: links open in the loaded data, whatever version made them. */
  otherVersion: (version: string) => string;
}

const uk: UiStrings = {
  appLabel: '3D-атлас анатомії людини',
  loading: 'Завантаження метаданих…',
  loadAll: 'Завантажити все',
  loadAllHint: 'Завантажує все тіло в поточній якості. Можна також вибрати систему чи орган у дереві або пошуком.',
  emptyTitle: 'Модель ще не завантажена',
  emptyText: 'Виберіть систему або структуру в дереві чи пошуком — або завантажте все тіло.',
  searchPlaceholder: 'Пошук структури…',
  searchLabel: 'Пошук за назвою або синонімом (українською, латиною, англійською)',
  searchEmpty: 'Нічого не знайдено',
  searchResults: (n) => `Знайдено: ${n}`,
  noGeometry: 'немає геометрії',
  notLoaded: 'не завантажено',
  loadingShort: 'завантажується',
  failedShort: 'помилка завантаження',
  systems: 'Системи',
  treeLabel: 'Системи та структури',
  expand: 'Розгорнути',
  collapse: 'Згорнути',
  show: 'Показати',
  hide: 'Сховати',
  showHidden: (n) => `Показати приховане (${n})`,
  isolate: 'Ізолювати',
  isolateSelectionHint: 'Показати лише вибране',
  isolateHint: 'Показати лише цю структуру',
  clearIsolation: 'Скасувати ізоляцію',
  isolatedStatus: 'Показано лише ізольоване',
  hideSelectionHint: 'Сховати все вибране',
  showSelectionHint: 'Показати все вибране знову',
  hideHint: 'Сховати цю структуру',
  focus: 'Центр',
  focusHint: 'Навести камеру на все вибране',
  zoomTo: 'Наблизити',
  zoomToHint: 'Навести камеру на цю структуру',
  close: 'Закрити',
  surroundingsDepth: 'Рівень оточення',
  surroundingsNoSelection: 'Спершу виберіть структуру',
  selectionOnly: 'Лише вибране',
  lessSurroundings: 'Менше оточення',
  moreSurroundings: 'Більше оточення',
  wholeBody: 'Усе тіло',
  surroundingsLevelOf: (level, total) => `Рівень оточення ${level} із ${total}`,
  surroundingsLevelShort: (level, total) => `Рівень ${level} із ${total}`,
  transparency: 'Прозорість оточення',
  transparencyNone: 'вимкнено',
  transparencyOn: (percent) => `Прозорість оточення: ${percent}%`,
  transparencyOff: 'Прозорість оточення вимкнено',
  wholeSelection: 'Усе вибране',
  camera: 'Камера',
  views: 'Ракурс',
  view: { anterior: 'Спереду', posterior: 'Ззаду', left: 'Ліворуч', right: 'Праворуч', superior: 'Зверху', inferior: 'Знизу' },
  zoomIn: 'Збільшити',
  zoomOut: 'Зменшити',
  fitAll: 'Загальний вигляд',
  reset: 'Скинути',
  share: 'Поділитися',
  shareTitle: 'Посилання на цей вигляд',
  shareCopy: 'Копіювати',
  shareCopied: 'Посилання скопійовано',
  shareNative: 'Надіслати…',
  shareTooLarge: 'Цей вигляд завеликий для посилання. Можна зберегти його як JSON-файл.',
  shareDownloadJson: 'Завантажити JSON',
  shareUnavailable: 'Не вдалося сформувати посилання.',
  economy: 'Економний режим',
  economyHint: 'Спрощена геометрія, нижча роздільність і простіші ефекти. Системи не приховуються.',
  termLanguage: 'Мова',
  languageHint: 'Мова інтерфейсу й назв структур',
  latinToggle: 'Показувати латину',
  latinHint: 'Латинська назва — під назвою поточною мовою',
  settings: 'Налаштування',
  showStructuresPanel: 'Показати панель структур',
  hideStructuresPanel: 'Сховати панель структур',
  showInfoPanel: 'Показати панель вибраного',
  hideInfoPanel: 'Сховати панель вибраного',
  panelWidth: 'Ширина панелі структур',
  langNames: { uk: 'Українська', la: 'Latina', en: 'English' },
  fullscreen: 'На весь екран',
  exitFullscreen: 'Вийти з повноекранного режиму',
  menu: 'Структури',
  info: 'Інформація',
  selectedCount: (n) => `Вибрано: ${n}`,
  nothingSelected: 'Нічого не вибрано',
  selectionEmptyHint: 'Виберіть структуру на моделі, у дереві або через пошук.',
  details: 'Докладніше',
  embedTitle: '3D-модель',
  embedStart: 'Показати 3D',
  embedStartLabel: (title) => `Показати 3D: ${title}`,
  embedOpen: 'Відкрити',
  embedOpenHint: 'Відкрити повний атлас на весь екран',
  clearSelection: 'Скасувати вибір',
  deselect: 'Зняти вибір',
  sources: 'Джерела та ліцензії',
  sourcesTitle: 'Джерела та ліцензії',
  sourcesIntro: 'Моделі та назви походять із наведених джерел; їхні ліцензії зберігаються і не замінюються ліцензією коду атласу.',
  licence: 'Ліцензія',
  author: 'Автори',
  source: 'Джерело',
  corrected: 'Виправлено в атласі',
  changes: 'Зміни',
  attribution: 'Атрибуція',
  permissionBasis: 'Підстава дозволу',
  audit: 'Аудит ліцензії',
  auditStatus: { pending: 'очікує перевірки', approved: 'підтверджено', rejected: 'відхилено' },
  included: 'включено',
  excluded: 'не включено',
  commercialUse: { allowed: 'дозволено', 'not-allowed': 'не дозволено', unknown: 'не підтверджено' },
  codeLicence: 'Код атласу',
  codeLicenceText:
    'Svitylo 3D Anatomy Atlas — CPAL-1.0. © 2026 authorOd. Ліцензія вимагає атрибуції Svitylo та надання вихідного коду у передбачених нею випадках. Вихідний код постачається з пакетом; зміни також підпадають під CPAL. Дані мають окремі ліцензії.',
  releaseDocuments: 'Документи релізу даних',
  progress: (loaded, total, mbLoaded, mbTotal) => `Завантаження: ${loaded} з ${total} файлів (${mbLoaded} з ${mbTotal} МБ)`,
  cancel: 'Скасувати',
  cancelled: 'Завантаження скасовано. Показано вже завантажену частину.',
  resume: 'Продовжити',
  retry: 'Повторити',
  dismiss: 'Закрити повідомлення',
  partialLoad: 'Частину файлів не вдалося завантажити.',
  sides: { left: 'лівий', right: 'правий', median: 'серединний', bilateral: 'обидва боки' },
  synonyms: 'Синоніми',
  path: 'Розташування в дереві',
  review: 'Перевірка',
  anatomyReview: 'Анатомічна перевірка',
  translationReview: 'Переклад',
  reviewStatus: { unreviewed: 'не перевірено', reviewed: 'перевірено', 'needs-correction': 'потребує виправлення' },
  draft: 'переклад не перевірено',
  draftLegend: 'переклад ще не перевірено фахівцем',
  draftSample: 'Назва',
  nameFallback: 'Української назви ще немає — показано англійську.',
  missingName: 'Назва відсутня',
  knownIssues: 'Відомі зауваження',
  gap: 'Геометрія відсутня в цьому релізі',
  gapReasons: {
    licence: 'не включено через ліцензійні обмеження джерела',
    missing: 'немає в джерелі даних',
    excluded: 'виключено з релізу',
  },
  geometry: 'Геометрія',
  reviewNotice:
    'Дані не пройшли повної незалежної анатомічної рецензії. «Не перевірено» не означає «помилково».',
  selected: (name) => `Вибрано: ${name}`,
  deselected: (name) => `Знято вибір: ${name}`,
  selectionCleared: 'Вибір знято',
  viewportLabel: '3D-перегляд. Стрілки — обертання, Shift+стрілки — зсув, + і − — масштаб, F — центр на вибраному, Esc — скасувати вибір.',
  webgl2Title: 'WebGL2 недоступний',
  webgl2Text: 'Цей браузер або пристрій не підтримує WebGL2, тому 3D-перегляд неможливий. Дерево структур, пошук, назви та джерела доступні.',
  contextLostTitle: 'Графічний контекст втрачено',
  contextLostText: 'Вигляд збережено. Відновлення може знову завантажити дані в пам’ять відеокарти.',
  restore: 'Відновити',
  brandLabel: 'Svitylo — відкрити сайт у новій вкладці',
  errors: {
    MANIFEST_UNAVAILABLE: 'Не вдалося завантажити метадані атласу.',
    MANIFEST_INVALID: 'Метадані атласу пошкоджені або мають неправильний формат.',
    SCHEMA_UNSUPPORTED: 'Ця версія даних не підтримується бібліотекою.',
    DATA_URL_INVALID: 'Неправильна адреса даних атласу.',
    DATA_VERSION_UNAVAILABLE: 'Потрібна версія даних недоступна на цьому сайті.',
    DATA_MISMATCH: 'Посилання створене для інших даних.',
    FILE_UNAVAILABLE: 'Файл моделі недоступний.',
    FILE_INTEGRITY: 'Файл моделі пошкоджений (контрольна сума не збігається).',
    FORMAT_UNSUPPORTED: 'Файл моделі має непідтримуваний формат.',
    UNKNOWN_ID: 'Структуру не знайдено.',
    STATE_INVALID: 'Посилання містить неправильний стан вигляду.',
    STATE_MALFORMED: 'Посилання пошкоджене.',
    STATE_TOO_LARGE: 'Стан вигляду завеликий.',
    STATE_UNSUPPORTED_VERSION: 'Посилання створене новішою версією атласу.',
    WEBGL2_UNAVAILABLE: 'WebGL2 недоступний.',
    CONTEXT_LOST: 'Графічний контекст втрачено.',
  },
  errorGeneric: 'Сталася помилка.',
  unknownIdsInLink: (ids) => `Посилання містить структури, яких немає в цих даних: ${ids}`,
  otherVersion: (version) => `Показано дані версії ${version}, з якою створено посилання.`,
};

const en: UiStrings = {
  appLabel: '3D atlas of human anatomy',
  loading: 'Loading metadata…',
  loadAll: 'Load everything',
  loadAllHint: 'Loads the whole body at the current quality. You can also pick a system or structure in the tree or with search.',
  emptyTitle: 'No model loaded yet',
  emptyText: 'Pick a system or structure in the tree or with search — or load the whole body.',
  searchPlaceholder: 'Search a structure…',
  searchLabel: 'Search by name or synonym (Ukrainian, Latin, English)',
  searchEmpty: 'No results',
  searchResults: (n) => `${n} results`,
  noGeometry: 'no geometry',
  notLoaded: 'not loaded',
  loadingShort: 'loading',
  failedShort: 'failed to load',
  systems: 'Systems',
  treeLabel: 'Systems and structures',
  expand: 'Expand',
  collapse: 'Collapse',
  show: 'Show',
  hide: 'Hide',
  showHidden: (n) => `Show hidden (${n})`,
  isolate: 'Isolate',
  isolateSelectionHint: 'Show only the selection',
  isolateHint: 'Show only this structure',
  clearIsolation: 'End isolation',
  isolatedStatus: 'Only the isolated structures are shown',
  hideSelectionHint: 'Hide the whole selection',
  showSelectionHint: 'Show the selection again',
  hideHint: 'Hide this structure',
  focus: 'Centre',
  focusHint: 'Point the camera at the whole selection',
  zoomTo: 'Zoom to',
  zoomToHint: 'Point the camera at this structure',
  close: 'Close',
  surroundingsDepth: 'Surroundings level',
  surroundingsNoSelection: 'Select a structure first',
  selectionOnly: 'Only the selection',
  lessSurroundings: 'Less surroundings',
  moreSurroundings: 'More surroundings',
  wholeBody: 'Whole body',
  surroundingsLevelOf: (level, total) => `Surroundings level ${level} of ${total}`,
  surroundingsLevelShort: (level, total) => `Level ${level} of ${total}`,
  transparency: 'Surroundings transparency',
  transparencyNone: 'off',
  transparencyOn: (percent) => `Surroundings transparency: ${percent}%`,
  transparencyOff: 'Surroundings transparency off',
  wholeSelection: 'Whole selection',
  camera: 'Camera',
  views: 'View',
  view: { anterior: 'Anterior', posterior: 'Posterior', left: 'Left', right: 'Right', superior: 'Superior', inferior: 'Inferior' },
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitAll: 'Overall view',
  reset: 'Reset',
  share: 'Share',
  shareTitle: 'Link to this view',
  shareCopy: 'Copy',
  shareCopied: 'Link copied',
  shareNative: 'Send…',
  shareTooLarge: 'This view is too large for a link. You can save it as a JSON file.',
  shareDownloadJson: 'Download JSON',
  shareUnavailable: 'The link could not be created.',
  economy: 'Economy mode',
  economyHint: 'Simplified geometry, lower resolution and cheaper effects. Systems are not hidden.',
  termLanguage: 'Language',
  languageHint: 'Language of the interface and structure names',
  latinToggle: 'Show Latin names',
  latinHint: 'The Latin name goes under the name in the current language',
  settings: 'Settings',
  showStructuresPanel: 'Show the structures panel',
  hideStructuresPanel: 'Hide the structures panel',
  showInfoPanel: 'Show the selection panel',
  hideInfoPanel: 'Hide the selection panel',
  panelWidth: 'Width of the structures panel',
  langNames: { uk: 'Українська', la: 'Latina', en: 'English' },
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  menu: 'Structures',
  info: 'Information',
  selectedCount: (n) => `Selected: ${n}`,
  nothingSelected: 'Nothing selected',
  selectionEmptyHint: 'Pick a structure on the model, in the tree or with search.',
  details: 'Details',
  embedTitle: '3D model',
  embedStart: 'Show 3D',
  embedStartLabel: (title) => `Show 3D: ${title}`,
  embedOpen: 'Open',
  embedOpenHint: 'Open the full atlas on the whole screen',
  clearSelection: 'Clear selection',
  deselect: 'Deselect',
  sources: 'Sources and licences',
  sourcesTitle: 'Sources and licences',
  sourcesIntro: 'Models and names come from the sources below; their licences are kept and are not replaced by the atlas code licence.',
  licence: 'Licence',
  author: 'Authors',
  source: 'Source',
  corrected: 'Corrected in this atlas',
  changes: 'Changes',
  attribution: 'Attribution',
  permissionBasis: 'Permission basis',
  audit: 'Licence audit',
  auditStatus: { pending: 'pending', approved: 'approved', rejected: 'rejected' },
  included: 'included',
  excluded: 'not included',
  commercialUse: { allowed: 'allowed', 'not-allowed': 'not allowed', unknown: 'not confirmed' },
  codeLicence: 'Atlas code',
  codeLicenceText:
    'Svitylo 3D Anatomy Atlas — CPAL-1.0. © 2026 authorOd. The licence requires Svitylo attribution and source availability in the circumstances it specifies. Source is included with the package; modifications remain subject to CPAL. Data has separate licences.',
  releaseDocuments: 'Data release documents',
  progress: (loaded, total, mbLoaded, mbTotal) => `Loading: ${loaded} of ${total} files (${mbLoaded} of ${mbTotal} MB)`,
  cancel: 'Cancel',
  cancelled: 'Loading cancelled. The part loaded so far is shown.',
  resume: 'Continue',
  retry: 'Retry',
  dismiss: 'Dismiss',
  partialLoad: 'Some files could not be loaded.',
  sides: { left: 'left', right: 'right', median: 'median', bilateral: 'both sides' },
  synonyms: 'Synonyms',
  path: 'Position in the tree',
  review: 'Review',
  anatomyReview: 'Anatomical review',
  translationReview: 'Translation',
  reviewStatus: { unreviewed: 'unreviewed', reviewed: 'reviewed', 'needs-correction': 'needs correction' },
  draft: 'unreviewed translation',
  draftLegend: 'translation not reviewed by an expert yet',
  draftSample: 'Name',
  nameFallback: 'No Ukrainian name yet — the English name is shown.',
  missingName: 'Name missing',
  knownIssues: 'Known issues',
  gap: 'No geometry in this release',
  gapReasons: { licence: 'not included because of source licence terms', missing: 'not in the source data', excluded: 'excluded from the release' },
  geometry: 'Geometry',
  reviewNotice: 'The data has not had a complete independent anatomical review. “Unreviewed” does not mean “wrong”.',
  selected: (name) => `Selected: ${name}`,
  deselected: (name) => `Deselected: ${name}`,
  selectionCleared: 'Selection cleared',
  viewportLabel: '3D view. Arrows rotate, Shift+arrows pan, + and − zoom, F centres on the selection, Esc clears the selection.',
  webgl2Title: 'WebGL2 is not available',
  webgl2Text: 'This browser or device does not support WebGL2, so the 3D view cannot be shown. The structure tree, search, names and sources remain available.',
  contextLostTitle: 'Graphics context lost',
  contextLostText: 'The view is kept. Restoring may upload the data to the graphics memory again.',
  restore: 'Restore',
  brandLabel: 'Svitylo — open the website in a new tab',
  errors: {
    MANIFEST_UNAVAILABLE: 'The atlas metadata could not be loaded.',
    MANIFEST_INVALID: 'The atlas metadata is damaged or has a wrong format.',
    SCHEMA_UNSUPPORTED: 'This data version is not supported by the library.',
    DATA_URL_INVALID: 'The atlas data address is invalid.',
    DATA_VERSION_UNAVAILABLE: 'The required data version is not available on this site.',
    DATA_MISMATCH: 'The link was made for different data.',
    FILE_UNAVAILABLE: 'A model file is unavailable.',
    FILE_INTEGRITY: 'A model file is damaged (checksum mismatch).',
    FORMAT_UNSUPPORTED: 'A model file has an unsupported format.',
    UNKNOWN_ID: 'Structure not found.',
    STATE_INVALID: 'The link contains an invalid view state.',
    STATE_MALFORMED: 'The link is damaged.',
    STATE_TOO_LARGE: 'The view state is too large.',
    STATE_UNSUPPORTED_VERSION: 'The link was made by a newer version of the atlas.',
    WEBGL2_UNAVAILABLE: 'WebGL2 is not available.',
    CONTEXT_LOST: 'Graphics context lost.',
  },
  errorGeneric: 'Something went wrong.',
  unknownIdsInLink: (ids) => `The link references structures that are not in this data: ${ids}`,
  otherVersion: (version) => `Showing data version ${version}, which the link was made with.`,
};

export const UI_STRINGS: Record<UiLang, UiStrings> = { uk, en };

export function resolveStrings(lang: UiLang, overrides?: Partial<UiStrings>): UiStrings {
  return { ...(UI_STRINGS[lang] ?? en), ...(overrides ?? {}) };
}
