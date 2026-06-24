// App.tsx
// Refactored to use only HTML elements + CSS for layout/styling.
// No Chakra UI or external UI libraries.
// Last updated: 2025-11-24 20:05 PDT (extended to support strength;angle cells)

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";

interface Concept {
  id: number;
  title: string;
  entire: string;
  pdf: string;
  video: string;       // legacy single video field
  shortVideo?: string; // new
  longVideo?: string;  // new
  valley?: string;
}

type ParsedSheet = {
  concepts: Concept[];
  angleMatrix: number[][];
  strengthMatrix: number[][];
  foundTuples: boolean;
  n: number;
};

type ConceptDefinition = {
  word: string;
  variants: string[];
  definition: string;
};

type WorkbookData = {
  matrixData: any[][];
  definitions: ConceptDefinition[];
  definitionsData: any[][];
  definitionsSheetName: string;
};

type ActiveTab = "home" | "graph";
type PathMode = "hide" | "simple" | "detailed";

type HistoryEntry = {
  id: number;
  choice: string;
};

type MediaLinkStatus = "Good" | "Broken" | "Unknown";
type MediaType = "Short Video" | "Long Video" | "PDF";

type MediaLinkReportRow = {
  id: number;
  title: string;
  mediaType: MediaType;
  link: string;
  status: MediaLinkStatus;
  reportedError: string;
};

type MatrixQaSeverity = "Info" | "Warning" | "Error";

type MatrixQaIssue = {
  severity: MatrixQaSeverity;
  sheet?: string;
  id?: number;
  title?: string;
  row?: number;
  column?: number;
  message: string;
};

type LinksSummaryRow = {
  id: number;
  title: string;
  outgoingLinkCount: number;
  incomingLinkCount: number;
  outMaxStrength: number;
  inMaxStrength: number;
};

type MatrixQaReport = {
  sourceName: string;
  generatedAt: string;
  matrixSize: number;
  headerRow: number;
  matrixStartColumn: number;
  definitionsSheetName: string;
  definitionsCount: number;
  issues: MatrixQaIssue[];
};

type GraphNode = {
  concept: Concept;
  x: number;
  y: number;
};

type GraphLink = {
  source: number;
  target: number;
  strength: number;
};

const norm = (v: any) => String(v ?? "").trim().toLowerCase();

const trimOrEmpty = (v: any) => (typeof v === "string" ? v.trim() : (v ?? ""));

const excelColumnName = (column?: number) => {
  if (!Number.isFinite(column) || !column || column < 1) return "";
  return XLSX.utils.encode_col(column - 1);
};

const splitIntoTwoLines = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [text.trim()];

  const midpoint = text.trim().length / 2;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 1; i < words.length; i++) {
    const lineLength = words.slice(0, i).join(" ").length;
    const distance = Math.abs(lineLength - midpoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
};

const INITIAL_NEXT_STORY_COUNT = 2;
const MAX_OTHER_SUGGESTION_CLICKS = 2;
const INITIAL_HISTORY_CHOICE = "j_Start";
const NEXT_STORY_ITEM_COLOR = "#fff8c6";
const DIAL_NEUTRAL_COLOR = "#e6e6e6";
const VALLEY_COLORS = [
  "#70b77e",
  "#f4a261",
  "#6c91c2",
  "#e76f51",
  "#8ab17d",
  "#b56576",
  "#2a9d8f",
  "#c9a227",
  "#9d6b53",
  "#5e8c61",
  "#d67ab1",
  "#7b8cde",
];
const GRAPH_WIDTH = 980;
const GRAPH_HEIGHT = 640;
const GRAPH_CENTER_X = GRAPH_WIDTH / 2 + 50;
const GRAPH_CENTER_Y = GRAPH_HEIGHT / 2;
const GRAPH_NODE_CLICK_ZOOM = 1.1;
const APP_TITLE = "Wayfinding";
const DEPLOYMENT_LABEL = "Wayfinder Alpha Deployed June 22, 2026, 10:55 PM PDT";
// Former titles: "Your Body Wisdom Encyclopedia"; "The Book of Your Body Wisdom"
const COMMENT_FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSfRsy9X9bVI-CdppeEJzgSb3ZbIa7dqoELENtiVRuVue1M4lw/formResponse";
const MAX_READER_HISTORY_LENGTH = 2000;
const ALPHA_TESTER_NAME_STORAGE_KEY = "fdkAlphaTesterName";
const SAVED_MATRIX_KEY = "fdkSavedMatrix";
const SAVED_MATRIX_NAME_KEY = "fdkSavedMatrixName";
const PANE_WIDTHS_STORAGE_KEY = "fdkPaneWidths";
const DEFAULT_PANE_WIDTHS = { left: 22, middle: 48, right: 30 };
const MIN_PANE_WIDTHS = { left: 12, middle: 28, right: 20 };
const SIMPLE_TRIANGLE_VIEWBOX_WIDTH = 664;
const SIMPLE_TRIANGLE_VIEWBOX_HEIGHT = 500;

const bufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    );
  }

  return btoa(binary);
};

const base64ToBuffer = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
};

const getConceptIdFromUrl = () => {
  const id = Number(new URLSearchParams(window.location.search).get("concept"));
  return Number.isFinite(id) && id > 0 ? id : null;
};

const updateConceptUrl = (conceptId: number, mode: "push" | "replace" = "push") => {
  const url = new URL(window.location.href);
  url.searchParams.set("concept", String(conceptId));

  if (mode === "replace") {
    window.history.replaceState({ conceptId }, "", url.toString());
  } else {
    window.history.pushState({ conceptId }, "", url.toString());
  }
};

const getGraphHistoryPathClass = (choice: string) => {
  if (choice.startsWith("j_NextinStory_")) return "graph-history-path-next-story";
  if (choice === "j_Leap") return "graph-history-path-leap";
  if (choice === "j_History") return "graph-history-path-history";
  if (choice === "j_TOC") return "graph-history-path-toc";
  if (choice === "J_node") return "graph-history-path-node";
  return "graph-history-path-next-story";
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildDefinitionTerms = (definitions: ConceptDefinition[]) =>
  definitions
    .flatMap((entry) =>
      [entry.word, ...entry.variants]
        .map((term) => term.trim())
        .filter(Boolean)
        .map((term) => ({ term, definition: entry.definition, word: entry.word }))
    )
    .sort((a, b) => b.term.length - a.term.length);

const renderTextWithDefinitions = (
  text: string,
  definitions: ConceptDefinition[],
  keyPrefix: string
) => {
  const terms = buildDefinitionTerms(definitions);
  if (terms.length === 0) return [text];

  const termByLower = new Map<string, typeof terms[number]>();
  terms.forEach((entry) => {
    const key = entry.term.toLowerCase();
    if (!termByLower.has(key)) termByLower.set(key, entry);
  });

  const pattern = new RegExp(
    `(^|[^A-Za-z0-9])(${terms.map((entry) => escapeRegExp(entry.term)).join("|")})(?=$|[^A-Za-z0-9])`,
    "gi"
  );
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const prefix = match[1] ?? "";
    const matchedTerm = match[2] ?? "";
    const termStart = match.index + prefix.length;
    const termEnd = termStart + matchedTerm.length;
    const definitionEntry = termByLower.get(matchedTerm.toLowerCase());

    if (!definitionEntry) continue;

    if (termStart > lastIndex) {
      nodes.push(text.slice(lastIndex, termStart));
    }

    nodes.push(
      <span
        key={`${keyPrefix}-definition-${termStart}`}
        className="definition-term"
        data-definition={definitionEntry.definition}
        title={definitionEntry.definition}
        tabIndex={0}
      >
        {matchedTerm}
      </span>
    );
    lastIndex = termEnd;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const renderTextWithLinks = (text: string, definitions: ConceptDefinition[] = []) => {
  const nodes: React.ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        ...renderTextWithDefinitions(
          text.slice(lastIndex, match.index),
          definitions,
          `content-${lastIndex}`
        )
      );
    }

    nodes.push(
      <a
        key={`content-link-${match.index}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
      >
        {match[1]}
      </a>
    );
    lastIndex = linkPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(
      ...renderTextWithDefinitions(text.slice(lastIndex), definitions, `content-${lastIndex}`)
    );
  }

  return nodes;
};

const isNumericLike = (v: any) => {
  const s = String(v ?? "").trim();
  if (!s) return false;
  // allow "3; 90" tuple or "90"
  if (s.includes(";")) {
    const parts = s.split(";").map(p => p.trim());
    return parts.length >= 2 && parts.every(p => p === "" ? false : !Number.isNaN(Number(p)));
  }
  return !Number.isNaN(Number(s));
};

const parseCellToStrengthAngle = (raw: any) => {
  let angleVal = 0;
  let strengthVal = 0;
  let foundTuple = false;

  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const s = String(raw).trim();

    if (s.includes(";")) {
      const [strengthPart, anglePart] = s.split(";").map(v => v.trim());
      const parsedStrength = Number(strengthPart);
      const parsedAngle = Number(anglePart);

      if (!Number.isNaN(parsedStrength) || !Number.isNaN(parsedAngle)) {
        foundTuple = true;
      }

      strengthVal = Number.isNaN(parsedStrength) ? 0 : parsedStrength;
      angleVal = Number.isNaN(parsedAngle) ? 0 : parsedAngle;
    } else {
      // Legacy format: angle only
      const num = Number(s);
      if (!Number.isNaN(num)) {
        angleVal = num;
        strengthVal = 0;
      }
    }
  }

  return { angleVal, strengthVal, foundTuple };
};

const isWellFormedMatrixCell = (raw: any) => {
  const s = String(raw ?? "").trim();
  if (!s) return true;

  if (s.includes(";")) {
    const parts = s.split(";").map((part) => part.trim());
    return parts.length === 2 && parts.every((part) => part !== "" && !Number.isNaN(Number(part)));
  }

  return !Number.isNaN(Number(s));
};

const parseDefinitionsSheet = (wb: XLSX.WorkBook): ConceptDefinition[] => {
  const definitionsSheetName =
    wb.SheetNames.find((sheetName) => norm(sheetName) === "definitions") ?? wb.SheetNames[1];
  if (!definitionsSheetName) return [];

  const ws = wb.Sheets[definitionsSheetName];
  if (!ws) return [];

  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(20, data.length); r++) {
    const rowNorm = (data[r] ?? []).map(norm);
    if (rowNorm.includes("word") && rowNorm.includes("definition")) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx < 0) return [];

  const header = data[headerRowIdx] ?? [];
  const colIndexOf = (label: string) => header.findIndex((c: any) => norm(c) === label);
  const wordCol = colIndexOf("word");
  const variantsCol = colIndexOf("variants");
  const definitionCol = colIndexOf("definition");

  if (wordCol < 0 || definitionCol < 0) return [];

  return data
    .slice(headerRowIdx + 1)
    .map((row) => {
      const word = String(trimOrEmpty(row[wordCol]));
      const variants =
        variantsCol >= 0
          ? String(trimOrEmpty(row[variantsCol]))
              .split(";")
              .map((variant) => variant.trim())
              .filter(Boolean)
          : [];
      const definition = String(trimOrEmpty(row[definitionCol]));

      return { word, variants, definition };
    })
    .filter((entry) => entry.word && entry.definition);
};

const readWorkbookData = (buffer: ArrayBuffer): WorkbookData => {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const definitionsSheetName =
    wb.SheetNames.find((sheetName) => norm(sheetName) === "definitions") ?? "";
  const definitionsData = definitionsSheetName
    ? (XLSX.utils.sheet_to_json(wb.Sheets[definitionsSheetName], { header: 1 }) as any[][])
    : [];

  return {
    matrixData: XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][],
    definitions: parseDefinitionsSheet(wb),
    definitionsData,
    definitionsSheetName,
  };
};

const parseSheet = (data: any[][]): ParsedSheet => {
  // 1) Find header row (first ~20 rows)
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(20, data.length); r++) {
    const row = data[r] ?? [];
    const rowNorm = row.map(norm);
    // look for any row that contains "id" and "title"
    if (rowNorm.includes("id") && rowNorm.includes("title")) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx < 0) {
    throw new Error("Could not find a header row containing 'ID' and 'Title'.");
  }

  const header = data[headerRowIdx] ?? [];

  // 2) Column indices for concept fields (support old+new)
  const colIndexOf = (label: string) => header.findIndex((c: any) => norm(c) === label);

  const idCol = colIndexOf("id");
  const titleCol = colIndexOf("title");

  // new format uses "Entry Text"; old uses "Entire"
  let textCol = colIndexOf("entry text");
  if (textCol < 0) textCol = colIndexOf("text entries");
  if (textCol < 0) textCol = colIndexOf("entire");

  // keep pdf/video in Concept even if absent in new sheets
  let pdfCol = colIndexOf("pdf link");
  if (pdfCol < 0) pdfCol = colIndexOf("pdf");
  const videoCol = colIndexOf("video link");   // legacy single video column
  const shortVideoCol = colIndexOf("short video");
  const longVideoCol = colIndexOf("long video");
  const valleyCol = colIndexOf("valley");

  if (idCol < 0 || titleCol < 0 || textCol < 0) {
    throw new Error("Missing one of required columns: ID, Title, and Entry Text/Text Entries/Entire.");
  }

  // 3) Find matrix start column: first numeric header cell (e.g., "1")
  let matrixStartCol = -1;
  for (let c = 0; c < header.length; c++) {
    const v = header[c];
    const s = String(v ?? "").trim();
    if (s !== "" && !Number.isNaN(Number(s))) {
      matrixStartCol = c;
      break;
    }
  }
  if (matrixStartCol < 0) {
    throw new Error("Could not find matrix column headers (numeric IDs) in the header row.");
  }

  // Determine N based on consecutive numeric headers
  const matrixHeaderIds: number[] = [];
  for (let c = matrixStartCol; c < header.length; c++) {
    const s = String(header[c] ?? "").trim();
    if (s === "" || Number.isNaN(Number(s))) break;
    matrixHeaderIds.push(Number(s));
  }
  const n = matrixHeaderIds.length;
  if (n <= 0) throw new Error("Matrix appears to have zero columns.");

  // 4) Determine old vs new layout:
  // Old: row after header contains transposed titles in the matrix region (mostly non-numeric strings)
  // New: row after header immediately contains matrix values (numeric/tuple/blank)
  const rowAfterHeader = data[headerRowIdx + 1] ?? [];
  let nonNumericCount = 0;
  let sampleCount = 0;
  for (let c = matrixStartCol; c < matrixStartCol + Math.min(n, 20); c++) {
    const cell = rowAfterHeader[c];
    const s = String(cell ?? "").trim();
    if (s === "") continue;
    sampleCount++;
    if (!isNumericLike(cell)) nonNumericCount++;
  }
  const looksLikeTitleRow = sampleCount > 0 && nonNumericCount / sampleCount > 0.6;

  // If old: matrix starts one row later (skip title row)
  const matrixRowStart = looksLikeTitleRow ? headerRowIdx + 2 : headerRowIdx + 1;
  const conceptRowStart = headerRowIdx + 1; // concept rows start immediately after header in both formats

  // 5) Load concepts (first n concept rows)
  const concepts: Concept[] = [];
  for (let i = 0; i < n; i++) {
    const row = data[conceptRowStart + i] ?? [];
    const pdfRaw = pdfCol >= 0 ? trimOrEmpty(row[pdfCol]) : "";
    const legacyVideoRaw = videoCol >= 0 ? trimOrEmpty(row[videoCol]) : "";
    const shortVideoRaw = shortVideoCol >= 0 ? trimOrEmpty(row[shortVideoCol]) : "";
    const longVideoRaw = longVideoCol >= 0 ? trimOrEmpty(row[longVideoCol]) : "";
    const valleyRaw = valleyCol >= 0 ? String(trimOrEmpty(row[valleyCol])) : "";

    // Prefer newer video columns when present; fall back to the legacy single video link.
    const videoRaw = shortVideoRaw || longVideoRaw || legacyVideoRaw;

    concepts.push({
      id: Number(row[idCol]) || matrixHeaderIds[i] || (i + 1),
      title: trimOrEmpty(row[titleCol]),
      entire: trimOrEmpty(row[textCol]),
      pdf: pdfRaw,
      video: videoRaw,
      shortVideo: shortVideoRaw,
      longVideo: longVideoRaw,
      valley: valleyRaw,
    });
  }

  // 6) Build angle + strength matrices by ID, then normalize to concept array order.
  const conceptIndexById = new Map<number, number>();
  concepts.forEach((concept, index) => {
    if (Number.isFinite(concept.id) && !conceptIndexById.has(concept.id)) {
      conceptIndexById.set(concept.id, index);
    }
  });

  const matrixRowIndexById = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const row = data[conceptRowStart + i] ?? [];
    const rowId = Number(row[idCol]);
    const sourceId = Number.isFinite(rowId) ? rowId : matrixHeaderIds[i];
    if (Number.isFinite(sourceId) && !matrixRowIndexById.has(sourceId)) {
      matrixRowIndexById.set(sourceId, i);
    }
  }

  const angleMatrix: number[][] = Array.from({ length: concepts.length }, () =>
    Array(concepts.length).fill(0)
  );
  const strengthMatrix: number[][] = Array.from({ length: concepts.length }, () =>
    Array(concepts.length).fill(0)
  );
  let foundTuples = false;

  concepts.forEach((sourceConcept, sourceIndex) => {
    const matrixRowIndex = matrixRowIndexById.get(sourceConcept.id);
    if (matrixRowIndex === undefined) return;

    const row = data[matrixRowStart + matrixRowIndex] ?? [];
    for (let j = 0; j < n; j++) {
      const targetIndex = conceptIndexById.get(matrixHeaderIds[j]);
      if (targetIndex === undefined) continue;

      const raw = row[matrixStartCol + j];
      const parsed = parseCellToStrengthAngle(raw);
      if (parsed.foundTuple) foundTuples = true;
      angleMatrix[sourceIndex][targetIndex] = parsed.angleVal;
      strengthMatrix[sourceIndex][targetIndex] = parsed.strengthVal;
    }
  });

  return { concepts, angleMatrix, strengthMatrix, foundTuples, n };
};

const findHeaderRow = (data: any[][]) => {
  for (let r = 0; r < Math.min(20, data.length); r++) {
    const row = data[r] ?? [];
    const rowNorm = row.map(norm);
    if (rowNorm.includes("id") && rowNorm.includes("title")) return r;
  }

  return -1;
};

const analyzeMatrixData = (data: any[][], sourceName: string): MatrixQaReport => {
  const issues: MatrixQaIssue[] = [];
  const headerRowIdx = findHeaderRow(data);

  if (headerRowIdx < 0) {
    return {
      sourceName,
      generatedAt: new Date().toLocaleString(),
      matrixSize: 0,
      headerRow: 0,
      matrixStartColumn: 0,
      definitionsSheetName: "",
      definitionsCount: 0,
      issues: [
        {
          severity: "Error",
          sheet: "Sheet",
          message: "Could not find a header row containing ID and Title.",
        },
      ],
    };
  }

  const header = data[headerRowIdx] ?? [];
  const colIndexOf = (label: string) => header.findIndex((c: any) => norm(c) === label);
  const idCol = colIndexOf("id");
  const titleCol = colIndexOf("title");

  let textCol = colIndexOf("entry text");
  if (textCol < 0) textCol = colIndexOf("text entries");
  if (textCol < 0) textCol = colIndexOf("entire");
  let pdfCol = colIndexOf("pdf link");
  if (pdfCol < 0) pdfCol = colIndexOf("pdf");
  const videoCol = colIndexOf("video link");
  const shortVideoCol = colIndexOf("short video");
  const longVideoCol = colIndexOf("long video");

  if (idCol < 0) issues.push({ severity: "Error", message: "Missing required ID column." });
  if (titleCol < 0) issues.push({ severity: "Error", message: "Missing required Title column." });
  if (textCol < 0) {
    issues.push({
      severity: "Error",
      message: "Missing required Entry Text/Text Entries/Entire column.",
    });
  }

  let matrixStartCol = -1;
  for (let c = 0; c < header.length; c++) {
    const s = String(header[c] ?? "").trim();
    if (s !== "" && !Number.isNaN(Number(s))) {
      matrixStartCol = c;
      break;
    }
  }

  if (matrixStartCol < 0) {
    issues.push({ severity: "Error", message: "Could not find numeric matrix header columns." });
    return {
      sourceName,
      generatedAt: new Date().toLocaleString(),
      matrixSize: 0,
      headerRow: headerRowIdx + 1,
      matrixStartColumn: 0,
      definitionsSheetName: "",
      definitionsCount: 0,
      issues,
    };
  }

  const matrixHeaderIds: number[] = [];
  for (let c = matrixStartCol; c < header.length; c++) {
    const s = String(header[c] ?? "").trim();
    if (s === "" || Number.isNaN(Number(s))) break;
    matrixHeaderIds.push(Number(s));
  }

  const matrixSize = matrixHeaderIds.length;
  const duplicateHeaderIds = matrixHeaderIds.filter(
    (id, index) => matrixHeaderIds.indexOf(id) !== index
  );
  Array.from(new Set(duplicateHeaderIds)).forEach((id) => {
    issues.push({
      severity: "Error",
      id,
      message: `Duplicate numeric matrix header ID ${id}.`,
    });
  });

  for (let i = 1; i < matrixHeaderIds.length; i++) {
    if (matrixHeaderIds[i] <= matrixHeaderIds[i - 1]) {
      issues.push({
        severity: "Info",
        id: matrixHeaderIds[i],
        column: matrixStartCol + i + 1,
        message: "Matrix header IDs are not strictly increasing at this column. The app now uses ID lookup, so this is OK if intentional.",
      });
    }
  }

  const rowAfterHeader = data[headerRowIdx + 1] ?? [];
  let nonNumericCount = 0;
  let sampleCount = 0;
  for (let c = matrixStartCol; c < matrixStartCol + Math.min(matrixSize, 20); c++) {
    const cell = rowAfterHeader[c];
    const s = String(cell ?? "").trim();
    if (s === "") continue;
    sampleCount++;
    if (!isNumericLike(cell)) nonNumericCount++;
  }
  const looksLikeTitleRow = sampleCount > 0 && nonNumericCount / sampleCount > 0.6;
  const conceptRowStart = headerRowIdx + 1;
  const matrixRowStart = looksLikeTitleRow ? headerRowIdx + 2 : headerRowIdx + 1;

  const rowIds: number[] = [];
  const matrixHeaderIdSet = new Set(matrixHeaderIds);
  const conceptRowsWithNumericIds: Array<{
    id: number;
    title: string;
    rowNumber: number;
    rowIndex: number;
  }> = [];

  for (let r = conceptRowStart; r < data.length; r++) {
    const row = data[r] ?? [];
    const rowId = Number(row[idCol]);
    if (!Number.isFinite(rowId)) continue;

    const title = titleCol >= 0 ? String(trimOrEmpty(row[titleCol])) : "";
    conceptRowsWithNumericIds.push({
      id: rowId,
      title,
      rowNumber: r + 1,
      rowIndex: r - conceptRowStart,
    });
  }

  if (conceptRowsWithNumericIds.length !== matrixSize) {
    issues.push({
      severity: "Warning",
      message: `Found ${conceptRowsWithNumericIds.length} concept rows with numeric IDs, but ${matrixSize} numeric matrix columns.`,
    });
  }

  conceptRowsWithNumericIds.forEach((conceptRow) => {
    if (!matrixHeaderIdSet.has(conceptRow.id)) {
      issues.push({
        severity: "Error",
        id: conceptRow.id,
        title: conceptRow.title,
        row: conceptRow.rowNumber,
        column: idCol + 1,
        message: `Concept row ID ${conceptRow.id} does not have a matching matrix header column.`,
      });
    }
  });

  for (let i = 0; i < matrixSize; i++) {
    const sheetRowNumber = conceptRowStart + i + 1;
    const row = data[conceptRowStart + i] ?? [];
    const matrixRow = data[matrixRowStart + i] ?? [];
    const expectedId = matrixHeaderIds[i];
    const rawId = row[idCol];
    const rowId = Number(rawId);
    const effectiveRowId = Number.isFinite(rowId) ? rowId : expectedId;
    const title = titleCol >= 0 ? String(trimOrEmpty(row[titleCol])) : "";
    const text = textCol >= 0 ? String(trimOrEmpty(row[textCol])) : "";
    const hasPdf = pdfCol >= 0 && String(trimOrEmpty(row[pdfCol])) !== "";
    const hasVideo =
      (videoCol >= 0 && String(trimOrEmpty(row[videoCol])) !== "") ||
      (shortVideoCol >= 0 && String(trimOrEmpty(row[shortVideoCol])) !== "") ||
      (longVideoCol >= 0 && String(trimOrEmpty(row[longVideoCol])) !== "");
    const conceptCells = row.slice(0, matrixStartCol);
    const isEmptyConceptRow = conceptCells.every((cell) => String(cell ?? "").trim() === "");

    if (isEmptyConceptRow) {
      issues.push({
        severity: "Warning",
        id: expectedId,
        row: sheetRowNumber,
        message: "Empty concept row inside the active matrix range.",
      });
      continue;
    }

    if (!Number.isFinite(rowId)) {
      issues.push({
        severity: "Error",
        id: expectedId,
        row: sheetRowNumber,
        message: `Concept row for matrix header ${expectedId} does not have a numeric ID.`,
      });
    } else {
      rowIds.push(rowId);
      if (rowId !== expectedId) {
        issues.push({
          severity: "Info",
          id: rowId,
          title,
          row: sheetRowNumber,
          column: idCol + 1,
          message: `Concept row ID ${rowId} does not match matrix header ID ${expectedId} at the same position. The app now resolves matrix rows and columns by ID.`,
        });
      }
    }

    if (!title) {
      issues.push({
        severity: "Warning",
          id: effectiveRowId,
          row: sheetRowNumber,
          column: titleCol + 1,
          message: "Concept row is missing a Title.",
      });
    }

    if (textCol >= 0 && !text) {
      const mediaTypes = [hasVideo ? "video" : "", hasPdf ? "PDF" : ""].filter(Boolean);
      const mediaNote =
        mediaTypes.length > 0 ? `, but has a ${mediaTypes.join("/")}.` : ".";

      issues.push({
        severity: "Warning",
        id: effectiveRowId,
        title,
        row: sheetRowNumber,
        column: textCol + 1,
        message: `Concept row is missing content text${mediaNote}`,
      });
    }

    let rowCandidateCount = 0;
    let incomingCandidateCount = 0;
    for (let j = 0; j < matrixSize; j++) {
      const raw = matrixRow[matrixStartCol + j];
      const cellText = String(raw ?? "").trim();

      if (!isWellFormedMatrixCell(raw)) {
        issues.push({
          severity: "Error",
          id: Number.isFinite(rowId) ? rowId : expectedId,
          title,
          row: matrixRowStart + i + 1,
          column: matrixStartCol + j + 1,
          message: `Malformed matrix cell "${cellText}". Expected 0, a number, or rating; weight such as 4; 30.`,
        });
        continue;
      }

      const parsed = parseCellToStrengthAngle(raw);
      const hasCandidate = parsed.strengthVal > 0 || parsed.angleVal > 0;
      if (hasCandidate) rowCandidateCount++;

      if (effectiveRowId === matrixHeaderIds[j] && hasCandidate) {
        issues.push({
          severity: "Warning",
          id: effectiveRowId,
          title,
          row: matrixRowStart + i + 1,
          column: matrixStartCol + j + 1,
          message: "Self-link cell is non-zero.",
        });
      }

      if (parsed.strengthVal < 0 || parsed.strengthVal > 5) {
        issues.push({
          severity: "Warning",
          id: effectiveRowId,
          title,
          row: matrixRowStart + i + 1,
          column: matrixStartCol + j + 1,
          message: `Rating/strength ${parsed.strengthVal} is outside expected 0-5 range.`,
        });
      }

      if (parsed.angleVal < 0 || parsed.angleVal > 180) {
        issues.push({
          severity: "Warning",
          id: effectiveRowId,
          title,
          row: matrixRowStart + i + 1,
          column: matrixStartCol + j + 1,
          message: `Weight/angle ${parsed.angleVal} is outside expected 0-180 range.`,
        });
      }
    }

    const incomingColumnIndex = matrixHeaderIds.findIndex((id) => id === effectiveRowId);
    if (incomingColumnIndex >= 0) {
      for (let r = 0; r < matrixSize; r++) {
        const sourceRow = data[matrixRowStart + r] ?? [];
        const parsed = parseCellToStrengthAngle(sourceRow[matrixStartCol + incomingColumnIndex]);
        if (parsed.strengthVal > 0 || parsed.angleVal > 0) incomingCandidateCount++;
      }
    }

    if (rowCandidateCount === 0) {
      issues.push({
        severity: "Warning",
        id: effectiveRowId,
        title,
        row: matrixRowStart + i + 1,
        message: "This concept has zero outgoing non-zero candidate links.",
      });
    }

    if (incomingColumnIndex >= 0 && incomingCandidateCount === 0) {
      issues.push({
        severity: "Warning",
        id: effectiveRowId,
        title,
        column: matrixStartCol + incomingColumnIndex + 1,
        message: "This concept has zero incoming non-zero candidate links.",
      });
    }

  }

  const duplicateRowIds = rowIds.filter((id, index) => rowIds.indexOf(id) !== index);
  Array.from(new Set(duplicateRowIds)).forEach((id) => {
    issues.push({
      severity: "Error",
      id,
      message: `Duplicate concept row ID ${id}.`,
    });
  });

  const rowIdSet = new Set(rowIds);
  matrixHeaderIds.forEach((id, index) => {
    if (!rowIdSet.has(id)) {
      issues.push({
        severity: "Error",
        id,
        column: matrixStartCol + index + 1,
        message: `Matrix header ID ${id} does not have a matching concept row ID.`,
      });
    }
  });

  return {
    sourceName,
    generatedAt: new Date().toLocaleString(),
    matrixSize,
    headerRow: headerRowIdx + 1,
    matrixStartColumn: matrixStartCol + 1,
    definitionsSheetName: "",
    definitionsCount: 0,
    issues,
  };
};

const findDefinitionsHeaderRow = (data: any[][]) => {
  for (let r = 0; r < Math.min(20, data.length); r++) {
    const rowNorm = (data[r] ?? []).map(norm);
    if (rowNorm.includes("word") || rowNorm.includes("variants") || rowNorm.includes("definition")) {
      return r;
    }
  }

  return -1;
};

const termAppearsInConceptText = (term: string, concepts: Concept[]) => {
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(term)}(?=$|[^A-Za-z0-9])`, "i");
  return concepts.some((concept) => pattern.test(concept.entire));
};

const analyzeDefinitionsData = (
  workbookData: WorkbookData,
  concepts: Concept[]
): { issues: MatrixQaIssue[]; definitionsCount: number } => {
  const issues: MatrixQaIssue[] = [];
  const sheetName = workbookData.definitionsSheetName || "definitions";

  if (!workbookData.definitionsSheetName) {
    return {
      definitionsCount: 0,
      issues: [
        {
          severity: "Warning",
          sheet: "definitions",
          message: "Definitions sheet is missing. Add a second tab named definitions with Word, Variants, and Definition columns.",
        },
      ],
    };
  }

  const data = workbookData.definitionsData;
  const headerRowIdx = findDefinitionsHeaderRow(data);
  if (headerRowIdx < 0) {
    return {
      definitionsCount: 0,
      issues: [
        {
          severity: "Error",
          sheet: sheetName,
          message: "Definitions sheet is missing a header row with Word, Variants, and Definition columns.",
        },
      ],
    };
  }

  const header = data[headerRowIdx] ?? [];
  const colIndexOf = (label: string) => header.findIndex((c: any) => norm(c) === label);
  const wordCol = colIndexOf("word");
  const variantsCol = colIndexOf("variants");
  const definitionCol = colIndexOf("definition");

  if (wordCol < 0) {
    issues.push({
      severity: "Error",
      sheet: sheetName,
      row: headerRowIdx + 1,
      message: "Definitions sheet is missing required Word column.",
    });
  }
  if (variantsCol < 0) {
    issues.push({
      severity: "Warning",
      sheet: sheetName,
      row: headerRowIdx + 1,
      message: "Definitions sheet is missing Variants column. Word matches will still work.",
    });
  }
  if (definitionCol < 0) {
    issues.push({
      severity: "Error",
      sheet: sheetName,
      row: headerRowIdx + 1,
      message: "Definitions sheet is missing required Definition column.",
    });
  }

  if (wordCol < 0 || definitionCol < 0) {
    return { issues, definitionsCount: 0 };
  }

  const seenTerms = new Map<string, { term: string; row: number; definition: string }>();
  let definitionsCount = 0;

  data.slice(headerRowIdx + 1).forEach((row, offset) => {
    const rowNumber = headerRowIdx + offset + 2;
    const word = String(trimOrEmpty(row[wordCol]));
    const definition = String(trimOrEmpty(row[definitionCol]));
    const rawVariants = variantsCol >= 0 ? String(trimOrEmpty(row[variantsCol])) : "";
    const variants = rawVariants.split(";").map((variant) => variant.trim());
    const nonEmptyVariants = variants.filter(Boolean);
    const isEmptyRow = row.every((cell) => String(cell ?? "").trim() === "");

    if (isEmptyRow) return;

    if (!word) {
      issues.push({
        severity: "Error",
        sheet: sheetName,
        row: rowNumber,
        column: wordCol + 1,
        message: "Definition row is missing a Word.",
      });
    }

    if (!definition) {
      issues.push({
        severity: "Error",
        sheet: sheetName,
        row: rowNumber,
        column: definitionCol + 1,
        message: "Definition row is missing a Definition.",
      });
    }

    if (rawVariants && variants.some((variant) => variant === "")) {
      issues.push({
        severity: "Info",
        sheet: sheetName,
        row: rowNumber,
        column: variantsCol + 1,
        message: "Variants has an empty item between semicolons.",
      });
    }

    const terms = [word, ...nonEmptyVariants].filter(Boolean);
    if (word && definition) definitionsCount++;

    terms.forEach((term) => {
      const key = term.toLowerCase();
      const previous = seenTerms.get(key);

      if (previous) {
        issues.push({
          severity: previous.definition === definition ? "Warning" : "Error",
          sheet: sheetName,
          row: rowNumber,
          message:
            previous.definition === definition
              ? `Duplicate definition term "${term}" also appears on row ${previous.row}.`
              : `Definition term "${term}" also appears on row ${previous.row} with a different definition.`,
        });
      } else {
        seenTerms.set(key, { term, row: rowNumber, definition });
      }

      if (!termAppearsInConceptText(term, concepts)) {
        issues.push({
          severity: "Info",
          sheet: sheetName,
          row: rowNumber,
          message: `Definition term "${term}" was not found in any Entry Text.`,
        });
      }
    });
  });

  if (definitionsCount === 0 && issues.every((issue) => issue.severity !== "Error")) {
    issues.push({
      severity: "Warning",
      sheet: sheetName,
      message: "Definitions sheet has no usable definition rows.",
    });
  }

  return { issues, definitionsCount };
};

const analyzeWorkbookData = (workbookData: WorkbookData, sourceName: string): MatrixQaReport => {
  const report = analyzeMatrixData(workbookData.matrixData, sourceName);

  try {
    const parsed = parseSheet(workbookData.matrixData);
    const definitionsQa = analyzeDefinitionsData(workbookData, parsed.concepts);
    return {
      ...report,
      definitionsSheetName: workbookData.definitionsSheetName || "",
      definitionsCount: definitionsQa.definitionsCount,
      issues: [...report.issues, ...definitionsQa.issues],
    };
  } catch {
    const definitionsQa = analyzeDefinitionsData(workbookData, []);
    return {
      ...report,
      definitionsSheetName: workbookData.definitionsSheetName || "",
      definitionsCount: definitionsQa.definitionsCount,
      issues: [...report.issues, ...definitionsQa.issues],
    };
  }
};

function ConceptGraph({
  concepts,
  angleMatrix,
  strengthMatrix,
  selectedConcept,
  history,
  nextStoryConcepts,
  getRelationColor,
  onPreviewConcept,
  onOpenConcept,
  pathMode,
  onPathModeChange,
}: {
  concepts: Concept[];
  angleMatrix: number[][];
  strengthMatrix: number[][];
  selectedConcept: Concept | null;
  history: HistoryEntry[];
  nextStoryConcepts: Array<{ concept: Concept; angle: number; strength: number }>;
  getRelationColor: (angle: number) => string;
  onPreviewConcept: (concept: Concept) => void;
  onOpenConcept: (concept: Concept) => void;
  pathMode: PathMode;
  onPathModeChange: (mode: PathMode) => void;
}) {
  const [zoomScale, setZoomScale] = React.useState(1);
  const [focusConceptId, setFocusConceptId] = React.useState<number | null>(null);
  const [hoveredGraphConceptId, setHoveredGraphConceptId] = React.useState<number | null>(null);
  const [minimumStrength, setMinimumStrength] = React.useState(4);
  const [graphPan, setGraphPan] = React.useState({ x: 0, y: 0 });
  const [isDraggingGraph, setIsDraggingGraph] = React.useState(false);
  const clickTimerRef = React.useRef<number | null>(null);
  const graphDragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const valleyLegendItems = React.useMemo(() => {
    const valleys = Array.from(
      new Set(
        concepts
          .map((concept) => String(concept.valley ?? "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return valleys.map((valley, index) => ({
      valley,
      color: VALLEY_COLORS[index % VALLEY_COLORS.length],
    }));
  }, [concepts]);
  const valleyColorByName = React.useMemo(
    () => new Map(valleyLegendItems.map((item) => [item.valley, item.color])),
    [valleyLegendItems]
  );
  const hasValleyColors = valleyLegendItems.length > 0;

  React.useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const previewGraphNode = (concept: Concept) => {
    const isAlreadyFocused = focusConceptId === concept.id;
    setFocusConceptId(isAlreadyFocused ? null : concept.id);
    setZoomScale(isAlreadyFocused ? 1 : GRAPH_NODE_CLICK_ZOOM);
    onPreviewConcept(concept);
  };

  const scheduleGraphNodePreview = (concept: Concept) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = window.setTimeout(() => {
      previewGraphNode(concept);
      clickTimerRef.current = null;
    }, 220);
  };

  const openGraphNode = (concept: Concept) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    setFocusConceptId(concept.id);
    setZoomScale(GRAPH_NODE_CLICK_ZOOM);
    onOpenConcept(concept);
  };

  const { nodes, links } = React.useMemo(() => {
    const graphLinks: GraphLink[] = [];

    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const strength = Math.max(strengthMatrix[i]?.[j] ?? 0, strengthMatrix[j]?.[i] ?? 0);
        if (strength >= minimumStrength) {
          graphLinks.push({ source: i, target: j, strength });
        }
      }
    }

    const max = graphLinks.reduce((current, link) => Math.max(current, link.strength), 1);
    const radius = Math.min(GRAPH_WIDTH, GRAPH_HEIGHT) * 0.38;
    const graphNodes: GraphNode[] = concepts.map((concept, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(concepts.length, 1);
      return {
        concept,
        x: GRAPH_CENTER_X + Math.cos(angle) * radius,
        y: GRAPH_CENTER_Y + Math.sin(angle) * radius,
      };
    });

    const velocities = graphNodes.map(() => ({ x: 0, y: 0 }));
    const iterations = Math.min(260, 90 + concepts.length * 3);

    for (let step = 0; step < iterations; step++) {
      for (let i = 0; i < graphNodes.length; i++) {
        for (let j = i + 1; j < graphNodes.length; j++) {
          const a = graphNodes[i];
          const b = graphNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distanceSquared = Math.max(dx * dx + dy * dy, 25);
          const distance = Math.sqrt(distanceSquared);
          const force = 1200 / distanceSquared;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          velocities[i].x -= fx;
          velocities[i].y -= fy;
          velocities[j].x += fx;
          velocities[j].y += fy;
        }
      }

      for (const link of graphLinks) {
        const a = graphNodes[link.source];
        const b = graphNodes[link.target];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const desired = 180 - (link.strength / max) * 95;
        const force = (distance - desired) * 0.008 * (link.strength / max);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        velocities[link.source].x += fx;
        velocities[link.source].y += fy;
        velocities[link.target].x -= fx;
        velocities[link.target].y -= fy;
      }

      for (let i = 0; i < graphNodes.length; i++) {
        const node = graphNodes[i];
        velocities[i].x += (GRAPH_CENTER_X - node.x) * 0.002;
        velocities[i].y += (GRAPH_CENTER_Y - node.y) * 0.002;
        velocities[i].x *= 0.82;
        velocities[i].y *= 0.82;
        node.x = Math.min(GRAPH_WIDTH - 44, Math.max(44, node.x + velocities[i].x));
        node.y = Math.min(GRAPH_HEIGHT - 36, Math.max(36, node.y + velocities[i].y));
      }
    }

    return { nodes: graphNodes, links: graphLinks };
  }, [concepts, strengthMatrix, minimumStrength]);

  const focusedConcept =
    focusConceptId !== null
      ? concepts.find((concept) => concept.id === focusConceptId) ?? null
      : null;
  const focusedIndex = focusedConcept
    ? concepts.findIndex((concept) => concept.id === focusedConcept.id)
    : -1;
  const selectedNode =
    selectedConcept ? nodes.find((node) => node.concept.id === selectedConcept.id) : null;
  const focusNode =
    nodes.find((node) => node.concept.id === focusConceptId) ?? selectedNode;
  const historyConceptIds = new Set(history.map((entry) => entry.id));
  const nextStoryConceptIds = new Set(nextStoryConcepts.map((rel) => rel.concept.id));
  const relatedAngleById = new Map<number, number>();
  const nodeByConceptId = new Map(nodes.map((node) => [node.concept.id, node]));
  const historyPathEntries = history
    .map((entry) => {
      const node = nodeByConceptId.get(entry.id);
      return node ? { node, choice: entry.choice } : null;
    })
    .filter((entry): entry is { node: GraphNode; choice: string } => Boolean(entry));

  if (focusedIndex >= 0) {
    concepts.forEach((concept, index) => {
      const angle = angleMatrix[focusedIndex]?.[index] ?? 0;
      if (concept.id !== focusedConcept?.id && angle > 0) {
        relatedAngleById.set(concept.id, angle);
      }
    });
  }

  const isZoomed = zoomScale > 1.01 && Boolean(focusNode);
  const baseGraphTransform = isZoomed && focusNode
    ? `translate(${GRAPH_CENTER_X}, ${GRAPH_CENTER_Y}) scale(${zoomScale}) translate(${-focusNode.x}, ${-focusNode.y})`
    : `scale(${zoomScale})`;
  const graphTransform = `translate(${graphPan.x}, ${graphPan.y}) ${baseGraphTransform}`;
  const showHistoryPathLines = pathMode !== "hide";
  const showPathwayLegend = pathMode === "detailed";
  const valleyLegendHeight = 34 + valleyLegendItems.length * 18;
  const zoomIn = () => setZoomScale((scale) => Math.min(scale * 1.25, 4));
  const zoomOut = () => setZoomScale((scale) => Math.max(scale / 1.25, 0.6));
  const handleGraphWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoomScale((scale) => Math.min(4, Math.max(0.6, scale * zoomFactor)));
  };
  const getSvgPoint = (event: React.PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return { x: 0, y: 0 };

    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * GRAPH_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * GRAPH_HEIGHT,
    };
  };
  const handleGraphBackgroundPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    if (event.button !== 0) return;

    const point = getSvgPoint(event);
    graphDragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      panX: graphPan.x,
      panY: graphPan.y,
    };
    setIsDraggingGraph(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleGraphBackgroundPointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    const drag = graphDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = getSvgPoint(event);
    setGraphPan({
      x: drag.panX + point.x - drag.startX,
      y: drag.panY + point.y - drag.startY,
    });
  };
  const stopGraphBackgroundDrag = (event: React.PointerEvent<SVGRectElement>) => {
    const drag = graphDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    graphDragRef.current = null;
    setIsDraggingGraph(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (concepts.length === 0) {
    return (
      <div className="graph-empty">
        Load a matrix file to see the concept network.
      </div>
    );
  }

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <span>{concepts.length} concepts</span>
        <span>{links.length} strength links</span>
        <button onClick={zoomOut}>Zoom out</button>
        <button onClick={zoomIn}>Zoom in</button>
        <div className="graph-path-mode-control" role="radiogroup" aria-label="Path visualization">
          <span>Path:</span>
          {[
            { value: "hide", label: "Hide" },
            { value: "simple", label: "Simple" },
            { value: "detailed", label: "Detailed" },
          ].map((option) => (
            <label
              key={option.value}
              className="graph-path-mode-option"
            >
              <input
                type="radio"
                name="path-mode"
                value={option.value}
                checked={pathMode === option.value}
                onChange={() => onPathModeChange(option.value as PathMode)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <label className="graph-strength-control">
          Min strength
          <select
            value={minimumStrength}
            onChange={(event) => setMinimumStrength(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <svg
        className={`graph-svg ${isDraggingGraph ? "is-dragging" : ""}`}
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        role="img"
        onWheel={handleGraphWheel}
      >
        <defs>
          <marker
            id="history-arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
          </marker>
        </defs>
        <rect
          className="graph-pan-background"
          x="0"
          y="0"
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          onPointerDown={handleGraphBackgroundPointerDown}
          onPointerMove={handleGraphBackgroundPointerMove}
          onPointerUp={stopGraphBackgroundDrag}
          onPointerCancel={stopGraphBackgroundDrag}
        />
        <g transform={graphTransform}>
          {links.map((link) => {
            const source = nodes[link.source];
            const target = nodes[link.target];
            const touchesSelected =
              focusedConcept &&
              (source.concept.id === focusedConcept.id || target.concept.id === focusedConcept.id);
            return (
              <line
                key={`${source.concept.id}-${target.concept.id}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={touchesSelected ? "#111" : "#667085"}
                strokeOpacity={touchesSelected ? 0.48 : 0.22}
                strokeWidth={touchesSelected ? 0.8 + link.strength * 0.65 : 0.8}
              />
            );
          })}
          {showHistoryPathLines && historyPathEntries.slice(1).map((entry, index) => {
            const previousEntry = historyPathEntries[index];
            const node = entry.node;
            const previousNode = previousEntry.node;
            const pathClassName =
              pathMode === "simple"
                ? "graph-history-path graph-history-path-next-story"
                : `graph-history-path ${getGraphHistoryPathClass(entry.choice)}`;
            return (
              <line
                key={`history-${previousNode.concept.id}-${node.concept.id}-${index}`}
                className={pathClassName}
                x1={previousNode.x}
                y1={previousNode.y}
                x2={node.x}
                y2={node.y}
                markerEnd="url(#history-arrowhead)"
              />
            );
          })}
          {selectedNode &&
            nextStoryConcepts.map((rel) => {
              const targetNode = nodeByConceptId.get(rel.concept.id);
              if (!targetNode) return null;

              return (
                <line
                  key={`next-story-suggestion-${rel.concept.id}`}
                  className="graph-next-story-link"
                  x1={selectedNode.x}
                  y1={selectedNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                />
              );
            })}
          {nodes.map((node) => {
            const isSelected = selectedConcept?.id === node.concept.id;
            const relationAngle = relatedAngleById.get(node.concept.id);
            const isRelated = relationAngle !== undefined;
            const isHistory = historyConceptIds.has(node.concept.id);
            const isNextStory = nextStoryConceptIds.has(node.concept.id);
            const isHovered = hoveredGraphConceptId === node.concept.id;
            const hasVideo = Boolean(node.concept.video);
            const hasPdf = Boolean(node.concept.pdf);
            const hasMedia = hasVideo || hasPdf;
            const mediaLabel = node.concept.video ? "Video" : node.concept.pdf ? "PDF" : "";
            const graphNodeLabel =
              isHovered && mediaLabel
                ? `${mediaLabel}: ${node.concept.title}`
                : node.concept.title;
            const showLabel = isSelected || isHistory || isNextStory || isHovered || (isZoomed && isRelated);
            const valley = String(node.concept.valley ?? "").trim();
            const valleyFill = valleyColorByName.get(valley);
            const fill = hasValleyColors
              ? valleyFill ?? "#d9eef7"
              : isSelected
              ? "#0f4c81"
              : isRelated
              ? getRelationColor(relationAngle)
              : isHistory
              ? "#e6f3ff"
              : isNextStory
              ? NEXT_STORY_ITEM_COLOR
              : "#d9eef7";
            const nodeRadius = isSelected ? 10 : isRelated ? 8 : 6;
            const nodeStroke = isHistory
              ? "#c1121f"
              : isNextStory
              ? "#d6b800"
              : isSelected
              ? "#061f35"
              : isRelated
              ? "#222"
              : "#4b7f95";
            const nodeStrokeWidth = isHistory ? 3 : isNextStory ? 2.4 : isSelected ? 3 : isRelated ? 2 : 1.2;

            return (
              <g
                key={node.concept.id}
                className="graph-node"
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => setHoveredGraphConceptId(node.concept.id)}
                onMouseLeave={() => setHoveredGraphConceptId(null)}
                onFocus={() => setHoveredGraphConceptId(node.concept.id)}
                onBlur={() => setHoveredGraphConceptId(null)}
                onClick={() => scheduleGraphNodePreview(node.concept)}
                onDoubleClick={() => openGraphNode(node.concept)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    previewGraphNode(node.concept);
                  }
                }}
              >
                {hasMedia ? (
                  <>
                    <circle
                      r={nodeRadius}
                      fill={fill}
                      stroke={nodeStroke}
                      strokeWidth={nodeStrokeWidth}
                    />
                    {hasVideo ? (
                      <path
                        className="graph-media-icon"
                        d="M-3.2,-4.5 L-3.2,4.5 L5,0 Z"
                      />
                    ) : (
                      <path
                        className="graph-media-icon"
                        d="M-4.5,-5.5 H1.5 L4.5,-2.5 V5.5 H-4.5 Z M1.5,-5.5 V-2.5 H4.5"
                      />
                    )}
                  </>
                ) : (
                  <circle
                    r={nodeRadius}
                    fill={fill}
                    stroke={nodeStroke}
                    strokeWidth={nodeStrokeWidth}
                  />
                )}
                {showLabel && (
                  <text
                    x="12"
                    y="4"
                    fontSize={isSelected ? 14 : 11}
                    fontWeight={isSelected ? 700 : 400}
                    fill={isSelected ? "#111" : "#344054"}
                  >
                    {graphNodeLabel}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        {hasValleyColors && (
          <g className="graph-valley-legend" transform="translate(18, 18)">
            <rect className="graph-valley-legend-bg" width="202" height={valleyLegendHeight} rx="4" />
            <text className="graph-valley-legend-title" x="12" y="22">
              The Valleys
            </text>
            {valleyLegendItems.map((item, index) => {
              const y = 45 + index * 18;
              return (
                <g key={item.valley} transform={`translate(12, ${y})`}>
                  <circle
                    className="graph-valley-legend-swatch"
                    cx="6"
                    cy="-4"
                    r="6"
                    fill={item.color}
                  />
                  <text className="graph-valley-legend-label" x="20" y="0">
                    {item.valley}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        {showPathwayLegend && (
        <g className="graph-pathway-legend" transform={`translate(18, ${GRAPH_HEIGHT - 184})`}>
          <rect className="graph-pathway-legend-bg" width="202" height="166" rx="4" />
          <text className="graph-pathway-legend-title" x="12" y="22">
            How you travelled
          </text>
          {[
            { label: "Next in Story", className: "graph-history-path-next-story" },
            { label: "A wild leap", className: "graph-history-path-leap" },
            { label: "Reading history", className: "graph-history-path-history" },
            { label: "TOC", className: "graph-history-path-toc" },
            { label: "Selected graph node", className: "graph-history-path-node" },
            { label: "Current suggestions", className: "graph-next-story-link" },
          ].map((item, index) => {
            const y = 45 + index * 18;
            return (
              <g key={item.label} transform={`translate(12, ${y})`}>
                <line
                  className={`graph-pathway-legend-line ${item.className}`}
                  x1="0"
                  y1="0"
                  x2="32"
                  y2="0"
                />
                <text className="graph-pathway-legend-label" x="42" y="4">
                  {item.label}
                </text>
              </g>
            );
          })}
        </g>
        )}
      </svg>
    </div>
  );
}

function App() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [definitions, setDefinitions] = useState<ConceptDefinition[]>([]);
  const [angleMatrix, setAngleMatrix] = useState<number[][]>([]);  // Added angleMatrix state 0-180 degrees
  const [strengthMatrix, setStrengthMatrix] = useState<number[][]>([]); // Added strengthMatrix state 0-5
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [pathMode, setPathMode] = useState<PathMode>("simple");
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [showAbout, setShowAbout] = useState<boolean>(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState<boolean>(false);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [showHistoryQa, setShowHistoryQa] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showSearchDialog, setShowSearchDialog] = useState<boolean>(false);
  const [showTriangles, setShowTriangles] = useState<boolean>(true);
  const [simpleTriangleOnly, setSimpleTriangleOnly] = useState<boolean>(true);
  const [showDialColors, setShowDialColors] = useState<boolean>(false);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [showRelatedConcepts, setShowRelatedConcepts] = useState<boolean>(false);
  const [showStrengthsAndAngles, setShowStrengthsAndAngles] = useState<boolean>(false);
  const [hoveredDialConceptId, setHoveredDialConceptId] = useState<number | null>(null);
  const [simpleTriangleLabelOffsets, setSimpleTriangleLabelOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [paneWidths, setPaneWidths] = useState(() => {
    try {
      const saved = window.localStorage.getItem(PANE_WIDTHS_STORAGE_KEY);
      if (!saved) return DEFAULT_PANE_WIDTHS;
      const parsed = JSON.parse(saved);
      const left = Number(parsed.left);
      const middle = Number(parsed.middle);
      const right = Number(parsed.right);
      if (![left, middle, right].every(Number.isFinite)) return DEFAULT_PANE_WIDTHS;
      return { left, middle, right };
    } catch {
      return DEFAULT_PANE_WIDTHS;
    }
  });
  const [nextStoryOffset, setNextStoryOffset] = useState<number>(0);
  const [otherSuggestionClicks, setOtherSuggestionClicks] = useState<number>(0);
  const [fileName, setFileName] = useState<string>("No file chosen");
  const [loadError, setLoadError] = useState<string>("");
  const [showMediaReport, setShowMediaReport] = useState<boolean>(false);
  const [mediaReportRows, setMediaReportRows] = useState<MediaLinkReportRow[]>([]);
  const [mediaReportRunning, setMediaReportRunning] = useState<boolean>(false);
  const [mediaReportCopied, setMediaReportCopied] = useState<boolean>(false);
  const [showLinksSummaryReport, setShowLinksSummaryReport] = useState<boolean>(false);
  const [linksSummaryRows, setLinksSummaryRows] = useState<LinksSummaryRow[]>([]);
  const [showMatrixQaReport, setShowMatrixQaReport] = useState<boolean>(false);
  const [matrixQaReport, setMatrixQaReport] = useState<MatrixQaReport | null>(null);
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [likeConceptContent, setLikeConceptContent] = useState<"" | "Yes" | "No">("");
  const [likeHowYouGotHere, setLikeHowYouGotHere] = useState<"" | "Yes" | "No">("");
  const [alphaTesterName, setAlphaTesterName] = useState<string>(() =>
    window.sessionStorage.getItem(ALPHA_TESTER_NAME_STORAGE_KEY) ?? ""
  );
  const [alphaTesterNameSubmitted, setAlphaTesterNameSubmitted] = useState<boolean>(() =>
    Boolean(window.sessionStorage.getItem(ALPHA_TESTER_NAME_STORAGE_KEY))
  );
  const [alphaTesterNameError, setAlphaTesterNameError] = useState<string>("");
  const [commentSubmissionPending, setCommentSubmissionPending] = useState<boolean>(false);
  const [commentSubmitted, setCommentSubmitted] = useState<boolean>(false);

  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const tocItemRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const commentFormRef = useRef<HTMLFormElement | null>(null);
  const paneContainerRef = useRef<HTMLDivElement | null>(null);
  const simpleTriangleSvgRef = useRef<SVGSVGElement | null>(null);
  const paneDragRef = useRef<{
    pair: "left-middle" | "middle-right";
    startX: number;
    containerWidth: number;
    startWidths: typeof DEFAULT_PANE_WIDTHS;
  } | null>(null);
  const simpleTriangleLabelDragRef = useRef<{
    key: string;
    startClientX: number;
    startClientY: number;
    startOffset: { x: number; y: number };
    scaleX: number;
    scaleY: number;
    moved: boolean;
  } | null>(null);
  const suppressSimpleTriangleClickRef = useRef<string | null>(null);

  const loadFromArrayBuffer = React.useCallback((buffer: ArrayBuffer, sourceLabel: string) => {
    const workbookData = readWorkbookData(buffer);
    const parsed = parseSheet(workbookData.matrixData);
    setLoadError("");

    console.log(
      `${sourceLabel}: loaded ${parsed.n} concepts; ` +
      (parsed.foundTuples ? "detected tuple 'strength; angle' format" : "using legacy angle-only format") +
      `; loaded ${workbookData.definitions.length} definitions`
    );

    setConcepts(parsed.concepts);
    setDefinitions(workbookData.definitions);
    setAngleMatrix(parsed.angleMatrix);
    setStrengthMatrix(parsed.strengthMatrix);

    const urlConceptId = getConceptIdFromUrl();
    const initialConcept =
      parsed.concepts.find((concept) => concept.id === urlConceptId) ??
      parsed.concepts[0] ??
      null;

    setSelectedConcept(initialConcept);
    if (initialConcept) {
      setHistory([{ id: initialConcept.id, choice: INITIAL_HISTORY_CHOICE }]);
      setHistoryIndex(0);
      updateConceptUrl(initialConcept.id, "replace");
    } else {
      setHistory([]);
      setHistoryIndex(-1);
    }
  }, []);


  // Auto-load default matrix file on startup
   
  React.useEffect(() => {
    try {
      const savedMatrix = window.localStorage.getItem(SAVED_MATRIX_KEY);
      if (savedMatrix) {
        loadFromArrayBuffer(base64ToBuffer(savedMatrix), "Saved upload");
        const savedName = window.localStorage.getItem(SAVED_MATRIX_NAME_KEY);
        setFileName(savedName ? `Active Matrix: ${savedName}` : "Active Matrix: saved local matrix");
        return;
      }
    } catch (err) {
      console.error("Failed to load saved matrix; falling back to default matrix.", err);
      window.localStorage.removeItem(SAVED_MATRIX_KEY);
      window.localStorage.removeItem(SAVED_MATRIX_NAME_KEY);
    }

    const defaultPath = process.env.PUBLIC_URL + "/matrix_file/fdk_matrix.xlsx";

    fetch(defaultPath)
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        try {
          loadFromArrayBuffer(buffer, "Auto-load");
          setFileName("Active Matrix: fdk_matrix.xlsx");
        } catch (err) {
          console.error("Failed to auto-load default Excel file:", err);
          setLoadError(err instanceof Error ? err.message : "Failed to auto-load default Excel file.");
        }
      })
      .catch(() => console.log("Default matrix file not found."));
  }, [loadFromArrayBuffer]);

  React.useEffect(() => {
    if (!selectedConcept || activeTab !== "home") return;

    setNextStoryOffset(0);
    setOtherSuggestionClicks(0);
    setHoveredDialConceptId(null);
    window.setTimeout(() => {
      tocItemRefs.current[selectedConcept.id]?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 0);
  }, [selectedConcept, historyIndex, activeTab]);

  React.useEffect(() => {
    if (concepts.length === 0) return;

    const handlePopState = () => {
      const conceptId = getConceptIdFromUrl();
      const concept = concepts.find((c) => c.id === conceptId) ?? concepts[0];

      setSelectedConcept(concept);
      setHistory((previousHistory) => {
        const existingIndex = previousHistory.map((entry) => entry.id).lastIndexOf(concept.id);
        if (existingIndex >= 0) {
          setHistoryIndex(existingIndex);
          return previousHistory;
        }

        setHistoryIndex(previousHistory.length);
        return [...previousHistory, { id: concept.id, choice: "j_Browser" }];
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [concepts]);

  React.useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(PANE_WIDTHS_STORAGE_KEY, JSON.stringify(paneWidths));
    } catch {
      // Pane resizing still works if localStorage is unavailable.
    }
  }, [paneWidths]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const labelDrag = simpleTriangleLabelDragRef.current;
      if (labelDrag) {
        const dx = event.clientX - labelDrag.startClientX;
        const dy = event.clientY - labelDrag.startClientY;
        if (Math.hypot(dx, dy) > 4) labelDrag.moved = true;

        setSimpleTriangleLabelOffsets((previousOffsets) => ({
          ...previousOffsets,
          [labelDrag.key]: {
            x: labelDrag.startOffset.x + dx * labelDrag.scaleX,
            y: labelDrag.startOffset.y + dy * labelDrag.scaleY,
          },
        }));
        event.preventDefault();
        return;
      }

      const drag = paneDragRef.current;
      if (!drag || drag.containerWidth <= 0) return;

      const deltaPct = ((event.clientX - drag.startX) / drag.containerWidth) * 100;
      setPaneWidths(() => {
        const next = { ...drag.startWidths };

        if (drag.pair === "left-middle") {
          const combined = drag.startWidths.left + drag.startWidths.middle;
          const left = Math.min(
            combined - MIN_PANE_WIDTHS.middle,
            Math.max(MIN_PANE_WIDTHS.left, drag.startWidths.left + deltaPct)
          );
          next.left = left;
          next.middle = combined - left;
        } else {
          const visibleTotal = showToc
            ? drag.startWidths.middle + drag.startWidths.right
            : drag.startWidths.middle + drag.startWidths.right;
          const adjustedDelta = showToc ? deltaPct : (deltaPct * visibleTotal) / 100;
          const combined = drag.startWidths.middle + drag.startWidths.right;
          const middle = Math.min(
            combined - MIN_PANE_WIDTHS.right,
            Math.max(MIN_PANE_WIDTHS.middle, drag.startWidths.middle + adjustedDelta)
          );
          next.middle = middle;
          next.right = combined - middle;
        }

        return next;
      });
    };

    const handlePointerUp = () => {
      const labelDrag = simpleTriangleLabelDragRef.current;
      if (labelDrag?.moved) {
        suppressSimpleTriangleClickRef.current = labelDrag.key;
      }
      simpleTriangleLabelDragRef.current = null;
      document.body.classList.remove("simple-triangle-label-dragging");

      paneDragRef.current = null;
      document.body.classList.remove("pane-resizing");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [showToc]);

  const withHttps = (url: string) => {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return "https://" + url;
  };

  const isYouTube = (url: string) => /(?:youtube\.com|youtu\.be)/i.test(url);

  // Extract ID from watch, youtu.be, embed, or shorts
  const youTubeId = (url: string) => {
    const u = withHttps(url);
    const m =
      u.match(/[?&]v=([^&#]+)/) || // watch?v=ID
      u.match(/youtu\.be\/([^?&#/]+)/) || // youtu.be/ID
      u.match(/youtube\.com\/embed\/([^?&#/]+)/) || // /embed/ID
      u.match(/youtube\.com\/shorts\/([^?&#/]+)/); // /shorts/ID
    return m ? m[1] : "";
  };

  // Build a robust embed src, including origin and sane params
  const ytEmbedSrc = (id: string) =>
    `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(
      window.location.origin
    )}`;

  const checkYouTubeLink = async (url: string): Promise<Pick<MediaLinkReportRow, "status" | "reportedError">> => {
    const normalizedUrl = withHttps(url);
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      normalizedUrl
    )}&format=json`;

    try {
      const response = await fetch(oembedUrl);
      if (response.ok) {
        return { status: "Good", reportedError: "" };
      }

      let reportedError = `YouTube oEmbed returned HTTP ${response.status}`;
      try {
        const errorText = (await response.text()).trim();
        if (errorText) reportedError = errorText;
      } catch {
        // Keep the HTTP status if the response body cannot be read.
      }

      return { status: "Broken", reportedError };
    } catch (error) {
      return {
        status: "Unknown",
        reportedError: error instanceof Error ? error.message : "Unable to inspect YouTube link.",
      };
    }
  };

  const checkStandardLink = async (url: string): Promise<Pick<MediaLinkReportRow, "status" | "reportedError">> => {
    const normalizedUrl = withHttps(url);

    for (const method of ["HEAD", "GET"] as const) {
      try {
        const response = await fetch(normalizedUrl, {
          method,
          redirect: "follow",
          cache: "no-store",
        });

        if (response.ok) {
          return { status: "Good", reportedError: "" };
        }

        return {
          status: "Broken",
          reportedError: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
        };
      } catch (error) {
        if (method === "HEAD") continue;

        return {
          status: "Unknown",
          reportedError: error instanceof Error ? error.message : "Unable to inspect link.",
        };
      }
    }

    return { status: "Unknown", reportedError: "Unable to inspect link." };
  };

  const checkMediaLink = (url: string) =>
    isYouTube(url) ? checkYouTubeLink(url) : checkStandardLink(url);

  const buildMediaReportRows = () =>
    concepts.flatMap((concept) => {
      const mediaLinks: Array<{ mediaType: MediaType; link: string | undefined }> = [
        { mediaType: "Short Video", link: concept.shortVideo },
        { mediaType: "Long Video", link: concept.longVideo },
        { mediaType: "PDF", link: concept.pdf },
      ];

      return mediaLinks
        .map(({ mediaType, link }) => ({ mediaType, link: String(link ?? "").trim() }))
        .filter(({ link }) => Boolean(link))
        .map(({ mediaType, link }) => ({
          id: concept.id,
          title: concept.title,
          mediaType,
          link,
          status: "Unknown" as MediaLinkStatus,
          reportedError: "",
        }));
    });

  const handleTestMediaLinks = async () => {
    const initialRows = buildMediaReportRows();
    setMediaReportRows(initialRows);
    setShowMediaReport(true);
    setMediaReportCopied(false);
    setIsMenuOpen(false);

    if (initialRows.length === 0) return;

    setMediaReportRunning(true);
    const checkedRows: MediaLinkReportRow[] = [];

    for (const row of initialRows) {
      const result = await checkMediaLink(row.link);
      const checkedRow = { ...row, ...result };
      checkedRows.push(checkedRow);
      setMediaReportRows([...checkedRows, ...initialRows.slice(checkedRows.length)]);
    }

    setMediaReportRunning(false);
  };

  const handleCopyMediaReport = async () => {
    const header = ["ID", "Title", "Media_Type", "Link", "Status", "Reported Error"];
    const escapeCell = (value: string | number) =>
      String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ");
    const tableText = [header, ...mediaReportRows.map((row) => [
      row.id,
      row.title,
      row.mediaType,
      row.link,
      row.status,
      row.reportedError,
    ])]
      .map((row) => row.map(escapeCell).join("\t"))
      .join("\n");

    await navigator.clipboard.writeText(tableText);
    setMediaReportCopied(true);
    window.setTimeout(() => setMediaReportCopied(false), 1800);
  };

  const buildLinksSummaryRows = (): LinksSummaryRow[] =>
    concepts.map((concept, conceptIndex) => {
      let outgoingLinkCount = 0;
      let incomingLinkCount = 0;
      let outMaxStrength = 0;
      let inMaxStrength = 0;

      concepts.forEach((_, targetIndex) => {
        const strength = strengthMatrix[conceptIndex]?.[targetIndex] ?? 0;
        const angle = angleMatrix[conceptIndex]?.[targetIndex] ?? 0;
        if (strength > 0 || angle > 0) {
          outgoingLinkCount++;
          outMaxStrength = Math.max(outMaxStrength, strength);
        }
      });

      concepts.forEach((_, sourceIndex) => {
        const strength = strengthMatrix[sourceIndex]?.[conceptIndex] ?? 0;
        const angle = angleMatrix[sourceIndex]?.[conceptIndex] ?? 0;
        if (strength > 0 || angle > 0) {
          incomingLinkCount++;
          inMaxStrength = Math.max(inMaxStrength, strength);
        }
      });

      return {
        id: concept.id,
        title: concept.title,
        outgoingLinkCount,
        incomingLinkCount,
        outMaxStrength,
        inMaxStrength,
      };
    });

  const handleShowLinksSummaryReport = () => {
    setLinksSummaryRows(buildLinksSummaryRows());
    setShowLinksSummaryReport(true);
    setIsMenuOpen(false);
  };

 const handleResetMatrix = () => {
  try {
    window.localStorage.removeItem(SAVED_MATRIX_KEY);
    window.localStorage.removeItem(SAVED_MATRIX_NAME_KEY);
  } catch {
    // Ignore storage cleanup errors and still try to reload the default matrix.
  }

  setIsMenuOpen(false);
  const defaultPath = process.env.PUBLIC_URL + "/matrix_file/fdk_matrix.xlsx";

  fetch(defaultPath)
    .then((res) => res.arrayBuffer())
    .then((buffer) => {
      try {
        loadFromArrayBuffer(buffer, "Reset to default");
        setFileName("Active Matrix: fdk_matrix.xlsx");
      } catch (err) {
        console.error("Failed to reload default Excel file:", err);
        setLoadError(err instanceof Error ? err.message : "Failed to reload default Excel file.");
      }
    })
    .catch(() => setLoadError("Failed to reload default matrix."));
};

 const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setFileName(file.name);
  setIsMenuOpen(false);

  const reader = new FileReader();
  reader.onload = (evt) => {
    const buffer = evt.target?.result as ArrayBuffer;
    if (!buffer) return;

    try {
      loadFromArrayBuffer(buffer, "User upload");
      setMatrixQaReport(analyzeWorkbookData(readWorkbookData(buffer), file.name));
      setShowMatrixQaReport(true);
      try {
        window.localStorage.setItem(SAVED_MATRIX_KEY, bufferToBase64(buffer));
        window.localStorage.setItem(SAVED_MATRIX_NAME_KEY, file.name);
        setFileName(`Active Matrix: ${file.name}`);
      } catch (storageErr) {
        console.error("Loaded matrix, but could not save it for refresh.", storageErr);
        setLoadError("Loaded matrix, but could not save it for refresh.");
      }
    } catch (err) {
      console.error("Failed to parse uploaded Excel file:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to parse uploaded Excel file.");
    }
  };
  reader.onerror = () => {
    setLoadError("Failed to read the selected Excel file.");
  };

  reader.readAsArrayBuffer(file);
};


  const handleSelectConcept = (
    concept: Concept,
    choice: string,
    urlMode: "push" | "replace" = "push"
  ) => {
    setSelectedConcept(concept);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ id: concept.id, choice });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    updateConceptUrl(concept.id, urlMode);
  };

  const handlePreviewGraphConcept = (concept: Concept) => {
    setSelectedConcept(concept);
    updateConceptUrl(concept.id, "replace");
  };

  const handleOpenGraphConcept = (concept: Concept) => {
    setActiveTab("home");
    handleSelectConcept(concept, "J_node");
  };

  const handleClearHistory = () => {
    if (!selectedConcept) {
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }

    setHistory([{ id: selectedConcept.id, choice: INITIAL_HISTORY_CHOICE }]);
    setHistoryIndex(0);
  };

  const searchResults = searchQuery.trim()
    ? concepts.filter((concept) =>
        concept.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : [];

  const handleSearchSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    setShowSearchDialog(true);
  };

  const handleSelectSearchResult = (concept: Concept) => {
    setShowSearchDialog(false);
    setSearchQuery("");
    setActiveTab("home");
    handleSelectConcept(concept, "j_Search");
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const concept = concepts.find((c) => c.id === history[newIndex].id) || null;
      setHistoryIndex(newIndex);
      setSelectedConcept(concept);
      if (concept) updateConceptUrl(concept.id);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const concept = concepts.find((c) => c.id === history[newIndex].id) || null;
      setHistoryIndex(newIndex);
      setSelectedConcept(concept);
      if (concept) updateConceptUrl(concept.id);
    }
  };

  const handleSelectHistoryItem = (entry: HistoryEntry & { index: number }) => {
    const concept = concepts.find((c) => c.id === entry.id);
    if (!concept) return;

    setHistoryIndex(entry.index);
    setSelectedConcept(concept);
    updateConceptUrl(concept.id);
  };

  const handleQuickFeedback = (
    field: "content" | "journey",
    value: "Yes" | "No"
  ) => {
    if (commentSubmissionPending) return;

    const fallbackComment =
      field === "content"
        ? `Like the content? ${value}`
        : `Like how you got here? ${value}`;

    if (field === "content") {
      setLikeConceptContent(value);
      setLikeHowYouGotHere("");
    } else {
      setLikeConceptContent("");
      setLikeHowYouGotHere(value);
    }

    if (!feedbackComment.trim()) {
      setFeedbackComment(fallbackComment);
    }
    setCommentSubmitted(false);

    window.setTimeout(() => {
      commentFormRef.current?.requestSubmit();
    }, 0);
  };

  const handleCommentSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const trimmedName = alphaTesterName.trim();

    if (trimmedName.length < 3) {
      event.preventDefault();
      setAlphaTesterNameError("Please enter a name at least three characters long.");
      return;
    }

    if (!feedbackComment.trim() && !likeConceptContent && !likeHowYouGotHere) {
      event.preventDefault();
      setFeedbackComment(`Alpha tester name: ${trimmedName}`);
      setAlphaTesterNameError("");
      window.sessionStorage.setItem(ALPHA_TESTER_NAME_STORAGE_KEY, trimmedName);
      setAlphaTesterName(trimmedName);
      setAlphaTesterNameSubmitted(true);

      window.setTimeout(() => {
        commentFormRef.current?.requestSubmit();
      }, 0);
      return;
    }

    window.sessionStorage.setItem(ALPHA_TESTER_NAME_STORAGE_KEY, trimmedName);
    setAlphaTesterName(trimmedName);
    setAlphaTesterNameSubmitted(true);
    setAlphaTesterNameError("");
    setCommentSubmissionPending(true);
    setCommentSubmitted(false);
  };

  const selectedConceptIndex = selectedConcept
    ? concepts.findIndex((concept) => concept.id === selectedConcept.id)
    : -1;

  const relatedConcepts =
    selectedConcept && selectedConceptIndex >= 0 && angleMatrix[selectedConceptIndex]
      ? concepts
          .map((c, idx) => ({
            concept: c,
            angle: angleMatrix[selectedConceptIndex]?.[idx] ?? 0,
            strength: strengthMatrix[selectedConceptIndex]?.[idx] ?? 0,
          }))
          .filter((rel) => rel.angle > 0)
          .sort((a, b) => b.angle - a.angle)
      : [];

  const activeHistory = historyIndex >= 0 ? history.slice(0, historyIndex + 1) : [];
  const activeHistoryIds = activeHistory.map((entry) => entry.id);
  const historyIds = history.map((entry) => entry.id);
  const seenConceptIds = new Set(activeHistoryIds);
  const unseenConcepts = concepts.filter((concept) => !seenConceptIds.has(concept.id));

  // Next in Story: strongest unseen connections by strength
  const allNextStoryConcepts =
    selectedConcept && selectedConceptIndex >= 0 && strengthMatrix[selectedConceptIndex]
      ? concepts
          .map((c, idx) => ({
            concept: c,
            angle: angleMatrix[selectedConceptIndex]?.[idx] ?? 0,
            strength: strengthMatrix[selectedConceptIndex]?.[idx] ?? 0,
          }))
          .filter(
            (rel) =>
              rel.concept.id !== selectedConcept.id && // ignore self
              !seenConceptIds.has(rel.concept.id) && // only concepts not yet seen by this point in history
              rel.strength > 0 // only non-zero strength
          )
          .sort((a, b) => {
            // primary: strength DESC
            if (b.strength !== a.strength) return b.strength - a.strength;
            // tie-breaker: smaller angle first
            return a.angle - b.angle;
          })
      : [];
  const nextStoryConcepts = allNextStoryConcepts.slice(
    nextStoryOffset,
    nextStoryOffset + INITIAL_NEXT_STORY_COUNT
  );
  const nextStorySubmission = nextStoryConcepts
    .map((rel) => `${rel.concept.id}: ${rel.concept.title}`)
    .join(" | ");
  const trimmedAlphaTesterName = alphaTesterName.trim();
  const trimmedFeedbackComment = feedbackComment.trim();
  const commentSubmissionText =
    trimmedAlphaTesterName && trimmedFeedbackComment
      ? trimmedFeedbackComment.startsWith(`${trimmedAlphaTesterName}:`)
        ? trimmedFeedbackComment
        : `${trimmedAlphaTesterName}: ${trimmedFeedbackComment}`
      : trimmedFeedbackComment;
  const canShowOtherSuggestions =
    otherSuggestionClicks < MAX_OTHER_SUGGESTION_CLICKS &&
    nextStoryOffset + INITIAL_NEXT_STORY_COUNT * 2 <= allNextStoryConcepts.length;
  const nextStoryConceptIds = new Set(nextStoryConcepts.map((rel) => rel.concept.id));
  const dialRelatedConcepts = relatedConcepts.filter(
    (rel) => !nextStoryConceptIds.has(rel.concept.id)
  );
  const hoveredDialRelation =
    dialRelatedConcepts.find((rel) => rel.concept.id === hoveredDialConceptId) ?? null;

  const handleLeapIntoUnknown = () => {
    if (unseenConcepts.length === 0) return;

    const currentValley = String(selectedConcept?.valley ?? "").trim().toLowerCase();
    const crossValleyConcepts = currentValley
      ? unseenConcepts.filter(
          (concept) => String(concept.valley ?? "").trim().toLowerCase() !== currentValley
        )
      : [];
    const leapCandidates = crossValleyConcepts.length > 0 ? crossValleyConcepts : unseenConcepts;
    const randomIndex = Math.floor(Math.random() * leapCandidates.length);
    handleSelectConcept(leapCandidates[randomIndex], "j_Leap");
  };

  const handleShowOtherSuggestions = () => {
    if (!canShowOtherSuggestions) return;

    setNextStoryOffset((offset) => offset + INITIAL_NEXT_STORY_COUNT);
    setOtherSuggestionClicks((clicks) => clicks + 1);
  };

  const getRelationColor = (angle: number) => {
    if (angle <= 59) return "#add8e6";
    if (angle <= 119) return "#90ee90";
    return "#ffb6c1";
  };

  // const polarToCartesian = (angleDeg: number, radius: number) => {
  //   const angleRad = (Math.PI / 180) * angleDeg;
  //   return {
  //     x: 10 + radius * Math.sin(angleRad),
  //     y: 150 - radius * Math.cos(angleRad),
  //   };
  // };

  const polarToCartesian = (angleDeg: number, radius: number) => {
    // Flip semantic angle so 0° is at the bottom and 180° at the top
    const flipped = 180 - angleDeg;
    const angleRad = (Math.PI / 180) * flipped;

    return {
      x: 20 + radius * Math.sin(angleRad),
      y: 185 - radius * Math.cos(angleRad),
    };
  };

    // Create a wedge path from angleStart→angleEnd at a given radius
  // const arcPath = (startDeg: number, endDeg: number, radius: number) => {
  //   const start = polarToCartesian(startDeg, radius);
  //   const end = polarToCartesian(endDeg, radius);
  //   return `M10,150 L${start.x},${start.y} A${radius},${radius} 0 0,1 ${end.x},${end.y} Z`;
  // };

  const dialOrigin = { x: 20, y: 185 };
  const g_radius = 150; // global radius for dial points
  const simpleTriangleTitle = selectedConcept?.title ?? "";
  const simpleTriangleTitleLines = splitIntoTwoLines(simpleTriangleTitle);
  const simpleTriangleTitleWidth = Math.max(
    60,
    ...simpleTriangleTitleLines.map((line) => line.length * 6.4)
  );
  const simpleTriangleOrigin = {
    x: 28 + Math.min(270, simpleTriangleTitleWidth + 24),
    y: simpleTriangleTitleLines.length > 1 ? 195 : 185,
  };
  const simpleTrianglePoint = (angleDeg: number, radius: number) => {
    const flipped = 180 - angleDeg;
    const angleRad = (Math.PI / 180) * flipped;

    return {
      x: simpleTriangleOrigin.x + radius * Math.sin(angleRad),
      y: simpleTriangleOrigin.y - radius * Math.cos(angleRad),
    };
  };
  const simpleNextStoryConcepts = nextStoryConcepts.slice(0, INITIAL_NEXT_STORY_COUNT);
  const leapPoint = simpleTrianglePoint(90, g_radius * 2);
  const simpleLeapLabelWidth = 120;
  const simpleLeapLabelGap = 10;
  const simpleLeapRightEdge = 640;
  const simpleLeapLineEnd = {
    x: Math.min(leapPoint.x, simpleLeapRightEdge - simpleLeapLabelWidth - simpleLeapLabelGap - 4),
    y: leapPoint.y,
  };
  const simpleLeapLabelX = simpleLeapLineEnd.x + simpleLeapLabelGap;
  const simpleChoiceLabelWidth = 190;
  const simpleChoiceLabelHeight = 68;
  const simpleChoiceLabelMinX = -20;
  const simpleChoiceLabelMaxX = 640 - simpleChoiceLabelWidth - 4;
  const simpleChoiceLabelMaxY = 352;
  const clampSimpleChoiceX = (x: number) =>
    Math.min(simpleChoiceLabelMaxX, Math.max(simpleChoiceLabelMinX, x));
  const clampSimpleChoiceY = (y: number) =>
    Math.min(simpleChoiceLabelMaxY, Math.max(-48, y));
  const simpleChoiceLabelLayouts = simpleNextStoryConcepts.map((rel, idx) => {
    const point = simpleTrianglePoint(rel.angle, g_radius);
    const key = selectedConcept
      ? `${selectedConcept.id}:${rel.concept.id}`
      : `unknown:${rel.concept.id}`;
    const manualOffset = simpleTriangleLabelOffsets[key];
    const closeAngles =
      simpleNextStoryConcepts.length > 1 &&
      Math.abs(simpleNextStoryConcepts[0].angle - simpleNextStoryConcepts[1].angle) < 20;
    const bothAtExtremeEdge =
      closeAngles &&
      simpleNextStoryConcepts.every((item) => item.angle < 20 || item.angle > 170);
    const baseLabelX = point.x + 10;
    const baseLabelY = point.y - simpleChoiceLabelHeight / 2;
    const xNudge = bothAtExtremeEdge && idx === 1 ? 168 : 0;
    const yNudge = bothAtExtremeEdge ? -18 : 0;

    return {
      key,
      point,
      x: clampSimpleChoiceX(baseLabelX + xNudge + (manualOffset?.x ?? 0)),
      y: clampSimpleChoiceY(baseLabelY + yNudge + (manualOffset?.y ?? 0)),
      bothAtExtremeEdge,
      hasManualOffset: Boolean(manualOffset),
    };
  });

  if (
    simpleChoiceLabelLayouts.length === 2 &&
    !simpleChoiceLabelLayouts.some((layout) => layout.bothAtExtremeEdge || layout.hasManualOffset)
  ) {
    const [firstLayout, secondLayout] = simpleChoiceLabelLayouts;
    const collisionSeparationMultiplier = 1.3;
    const horizontalOverlap =
      firstLayout.x < secondLayout.x + simpleChoiceLabelWidth &&
      firstLayout.x + simpleChoiceLabelWidth > secondLayout.x;
    const verticalOverlap =
      firstLayout.y < secondLayout.y + simpleChoiceLabelHeight + 10 &&
      firstLayout.y + simpleChoiceLabelHeight + 10 > secondLayout.y;

    if (horizontalOverlap && verticalOverlap) {
      const [upperIndex, lowerIndex] =
        firstLayout.y <= secondLayout.y ? [0, 1] : [1, 0];
      const upper = simpleChoiceLabelLayouts[upperIndex];
      const lower = simpleChoiceLabelLayouts[lowerIndex];
      const neededGap = (simpleChoiceLabelHeight + 14) * collisionSeparationMultiplier;
      const currentGap = lower.y - upper.y;
      const extraGap = Math.max(0, neededGap - currentGap);
      const [leftIndex, rightIndex] =
        firstLayout.x <= secondLayout.x ? [0, 1] : [1, 0];
      const left = simpleChoiceLabelLayouts[leftIndex];
      const right = simpleChoiceLabelLayouts[rightIndex];
      const overlapAmount =
        Math.min(
          firstLayout.x + simpleChoiceLabelWidth,
          secondLayout.x + simpleChoiceLabelWidth
        ) - Math.max(firstLayout.x, secondLayout.x);
      const horizontalPush = Math.max(0, overlapAmount * (collisionSeparationMultiplier - 1));

      upper.y = clampSimpleChoiceY(upper.y - extraGap / 2);
      lower.y = clampSimpleChoiceY(lower.y + extraGap / 2);
      left.x = clampSimpleChoiceX(left.x - horizontalPush / 2);
      right.x = clampSimpleChoiceX(right.x + horizontalPush / 2);

      simpleChoiceLabelLayouts.forEach((layout) => {
        layout.x = Math.max(layout.x, Math.min(layout.point.x + 10, simpleChoiceLabelMaxX));
      });
    }
  }
  const displayedHistory = history
    .map((entry, index) => ({ ...entry, index }))
    .reverse();
  const fullReaderHistory = history
    .map((entry) => {
      const concept = concepts.find((item) => item.id === entry.id);
      return `${entry.id}: ${concept?.title ?? "Unknown concept"} [${entry.choice}]`;
    })
    .join(" > ");
  const omittedHistoryPrefix = "[Earlier history omitted] ";
  const readerHistory =
    fullReaderHistory.length <= MAX_READER_HISTORY_LENGTH
      ? fullReaderHistory
      : `${omittedHistoryPrefix}${fullReaderHistory.slice(
          fullReaderHistory.length - MAX_READER_HISTORY_LENGTH + omittedHistoryPrefix.length
        )}`;
  const visibleMiddleRightTotal = paneWidths.middle + paneWidths.right;
  const displayedPaneWidths = showToc
    ? paneWidths
    : {
        left: 0,
        middle: (paneWidths.middle / visibleMiddleRightTotal) * 100,
        right: (paneWidths.right / visibleMiddleRightTotal) * 100,
      };
  const paneStyle = (width: number): React.CSSProperties => ({
    flex: `0 0 ${width}%`,
  });
  const startPaneResize = (
    pair: "left-middle" | "middle-right",
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const containerWidth = paneContainerRef.current?.getBoundingClientRect().width ?? 0;
    paneDragRef.current = {
      pair,
      startX: event.clientX,
      containerWidth,
      startWidths: paneWidths,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("pane-resizing");
  };
  const startSimpleTriangleLabelDrag = (
    key: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    const svgRect = simpleTriangleSvgRef.current?.getBoundingClientRect();
    if (!svgRect || svgRect.width <= 0 || svgRect.height <= 0) return;

    simpleTriangleLabelDragRef.current = {
      key,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: simpleTriangleLabelOffsets[key] ?? { x: 0, y: 0 },
      scaleX: SIMPLE_TRIANGLE_VIEWBOX_WIDTH / svgRect.width,
      scaleY: SIMPLE_TRIANGLE_VIEWBOX_HEIGHT / svgRect.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("simple-triangle-label-dragging");
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h2>{APP_TITLE}</h2>
        <div className="tab-bar" role="tablist" aria-label="Main views">
          <button
            className={activeTab === "home" ? "active" : ""}
            onClick={() => setActiveTab("home")}
            role="tab"
            aria-selected={activeTab === "home"}
          >
            Explore
          </button>
          <button
            className={activeTab === "graph" ? "active" : ""}
            onClick={() => setActiveTab("graph")}
            role="tab"
            aria-selected={activeTab === "graph"}
          >
            Path
          </button>
        </div>
        {showSearch && (
          <form className="title-search" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search Concept titles"
              aria-label="Search concept titles"
            />
            <button type="submit" aria-label="Search">
              &#128269;
            </button>
          </form>
        )}
        <details
          className="app-menu"
          open={isMenuOpen}
          ref={menuRef}
          onToggle={(event) => setIsMenuOpen(event.currentTarget.open)}
        >
          <summary>Settings</summary>
          <div className="app-menu-panel">
            <label className="file-button">
              Load local matrix
              <input
                type="file"
                accept=".xlsx, .xls"
                onClick={(e) => {
                  e.currentTarget.value = "";
                }}
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </label>
            <button
              type="button"
              className="menu-item-button"
              onClick={handleResetMatrix}
            >
              Reset to default matrix
            </button>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={showTriangles}
                onChange={(e) => {
                  setShowTriangles(e.target.checked);
                  setIsMenuOpen(false);
                }}
              />
              Show Triangles
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={simpleTriangleOnly}
                onChange={(e) => {
                  setSimpleTriangleOnly(e.target.checked);
                  setIsMenuOpen(false);
                }}
              />
              Simple Triangle Only
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={showDialColors}
                onChange={(e) => {
                  setShowDialColors(e.target.checked);
                  setIsMenuOpen(false);
                }}
              />
              Show dial colors
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={showToc}
                onChange={(e) => {
                  setShowToc(e.target.checked);
                  setIsMenuOpen(false);
                }}
              />
              Show TOC
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={showRelatedConcepts}
                onChange={(e) => {
                  setShowRelatedConcepts(e.target.checked);
                  setIsMenuOpen(false);
                }}
              />
              Show Related Concepts
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={showSearch}
                onChange={(e) => {
                  setShowSearch(e.target.checked);
                  if (!e.target.checked) {
                    setShowSearchDialog(false);
                    setSearchQuery("");
                  }
                  setIsMenuOpen(false);
                }}
              />
              Show Search box
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={showStrengthsAndAngles}
                onChange={(e) => {
                  setShowStrengthsAndAngles(e.target.checked);
                  setIsMenuOpen(false);
                }}
              />
              Show strengths and angles
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={showHistoryQa}
                onChange={(e) => {
                  setShowHistoryQa(e.target.checked);
                  setIsMenuOpen(false);
                }}
              />
              Show History QA
            </label>
            <button
              className="menu-item-button"
              onClick={() => {
                setShowClearHistoryConfirm(true);
                setIsMenuOpen(false);
              }}
            >
              Clear History
            </button>
            <button
              className="menu-item-button"
              onClick={handleTestMediaLinks}
              disabled={mediaReportRunning || concepts.length === 0}
            >
              {mediaReportRunning ? "Testing media links..." : "Test media links"}
            </button>
            <button
              className="menu-item-button"
              onClick={handleShowLinksSummaryReport}
              disabled={concepts.length === 0}
            >
              Links Summary Report
            </button>
            <button
              className="menu-item-button"
              onClick={() => {
                setShowAbout(true);
                setIsMenuOpen(false);
              }}
            >
              About
            </button>
          </div>
        </details>
        <span>{fileName}</span>
        {loadError && <span className="load-error">{loadError}</span>}
      </header>

      {showAbout && (
        <div className="about-box">
          <button
            className="about-close"
            onClick={() => setShowAbout(false)}
            aria-label="Close About"
          >
            x
          </button>
          <p className="about-title">FDK Network of Knowledge</p>
          <p>{DEPLOYMENT_LABEL}</p>
          <p>All content is created by Carie Fox.</p>
          <p>Copyright Carie Fox 2026. All rights reserved</p>
        </div>
      )}

      {showClearHistoryConfirm && (
        <div
          className="confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm clear history"
        >
          <p>
            This will clear all reading history!
            <br />
            <br />
            Do you want to proceed?
          </p>
          <div className="confirm-actions">
            <button
              onClick={() => {
                handleClearHistory();
                setShowClearHistoryConfirm(false);
              }}
            >
              Yes
            </button>
            <button onClick={() => setShowClearHistoryConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showSearchDialog && (
        <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search results">
          <button
            className="search-close"
            onClick={() => setShowSearchDialog(false)}
            aria-label="Close search results"
          >
            x
          </button>
          <h3>Search Results</h3>
          {searchResults.length === 0 ? (
            <p className="search-empty">No matching titles.</p>
          ) : (
            <ul>
              {searchResults.map((concept) => (
                <li key={concept.id}>
                  <button onClick={() => handleSelectSearchResult(concept)}>
                    {concept.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showMediaReport && (
        <div
          className="media-report-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Media link test report"
        >
          <button
            className="search-close"
            onClick={() => setShowMediaReport(false)}
            aria-label="Close media link report"
          >
            x
          </button>
          <div className="media-report-header">
            <h3>Media Link Test Report</h3>
            <button
              className="media-report-copy"
              onClick={handleCopyMediaReport}
              disabled={mediaReportRows.length === 0}
              aria-label="Copy media link report table"
              title="Copy table"
            >
              <span aria-hidden="true">📋</span>
            </button>
            {mediaReportCopied && <span className="media-report-copied">Copied</span>}
          </div>
          <p className="media-report-summary">
            {mediaReportRunning
              ? "Testing media links..."
              : `${mediaReportRows.length} media link${mediaReportRows.length === 1 ? "" : "s"} checked.`}
          </p>
          {mediaReportRows.length === 0 ? (
            <p className="search-empty">No Short Video, Long Video, or PDF links were found.</p>
          ) : (
            <div className="media-report-table-wrap">
              <table className="media-report-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Media_Type</th>
                    <th>Link</th>
                    <th>Status</th>
                    <th>Reported Error</th>
                  </tr>
                </thead>
                <tbody>
                  {mediaReportRows.map((row, index) => (
                    <tr key={`${row.id}-${row.mediaType}-${index}`}>
                      <td>{row.id}</td>
                      <td>{row.title}</td>
                      <td>{row.mediaType}</td>
                      <td>
                        <a href={withHttps(row.link)} target="_blank" rel="noopener noreferrer">
                          {row.link}
                        </a>
                      </td>
                      <td className={`media-status media-status-${row.status.toLowerCase()}`}>
                        {row.status}
                      </td>
                      <td>{row.reportedError}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showLinksSummaryReport && (
        <div
          className="links-summary-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Links summary report"
        >
          <button
            className="search-close"
            onClick={() => setShowLinksSummaryReport(false)}
            aria-label="Close links summary report"
          >
            x
          </button>
          <h3>Links Summary Report</h3>
          <p className="links-summary-summary">
            {linksSummaryRows.length} concepts · based on the currently active matrix
          </p>

          <div className="links-summary-table-wrap">
            <table className="links-summary-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Outgoing_Links</th>
                  <th>Incoming_Links</th>
                  <th>Out_Max_Strength</th>
                  <th>In_Max_Strength</th>
                </tr>
              </thead>
              <tbody>
                {linksSummaryRows.map((row, index) => (
                  <tr key={`links-summary-${row.id}-${index}`}>
                    <td>{row.id}</td>
                    <td>{row.title}</td>
                    <td>{row.outgoingLinkCount}</td>
                    <td>{row.incomingLinkCount}</td>
                    <td>{row.outMaxStrength}</td>
                    <td>{row.inMaxStrength}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showMatrixQaReport && matrixQaReport && (
        <div
          className="matrix-qa-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Matrix QA report"
        >
          <button
            className="search-close"
            onClick={() => setShowMatrixQaReport(false)}
            aria-label="Close matrix QA report"
          >
            x
          </button>
          <h3>Matrix QA Report</h3>
          <p className="matrix-qa-summary">
            {matrixQaReport.sourceName} · {matrixQaReport.matrixSize} matrix entries · header row{" "}
            {matrixQaReport.headerRow}, matrix starts at column {matrixQaReport.matrixStartColumn} ·{" "}
            definitions:{" "}
            {matrixQaReport.definitionsSheetName
              ? `${matrixQaReport.definitionsCount} rows in ${matrixQaReport.definitionsSheetName}`
              : "missing"}{" "}
            Â·{" "}
            {matrixQaReport.issues.filter((issue) => issue.severity === "Error").length} errors,{" "}
            {matrixQaReport.issues.filter((issue) => issue.severity === "Warning").length} warnings
          </p>

          <h4>Inconsistencies</h4>
          {matrixQaReport.issues.length === 0 ? (
            <p className="search-empty">No inconsistencies found.</p>
          ) : (
            <div className="matrix-qa-table-wrap">
              <table className="matrix-qa-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Sheet</th>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Row</th>
                    <th>Column</th>
                    <th>Excel_Col</th>
                    <th>Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixQaReport.issues.map((issue, index) => (
                    <tr key={`matrix-qa-issue-${index}`}>
                      <td className={`matrix-qa-severity matrix-qa-${issue.severity.toLowerCase()}`}>
                        {issue.severity}
                      </td>
                      <td>{issue.sheet ?? "Sheet"}</td>
                      <td>{issue.id ?? ""}</td>
                      <td>{issue.title ?? ""}</td>
                      <td>{issue.row ?? ""}</td>
                      <td>{issue.column ?? ""}</td>
                      <td>{excelColumnName(issue.column)}</td>
                      <td>{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "home" && (
      <div className="pane-container" role="tabpanel" aria-label="Home" ref={paneContainerRef}>
        {/* Left Pane */}
        {showToc && (
          <div className="pane left-pane" style={paneStyle(displayedPaneWidths.left)}>
            <h3>Concepts</h3>
            <ul>
              {concepts.map((c) => (
                <li
                  key={c.id}
                  ref={(el) => {
                    tocItemRefs.current[c.id] = el;
                  }}
                  className={
                    selectedConcept?.id === c.id
                      ? "selected"
                      : historyIds.includes(c.id)
                      ? "visited"
                      : ""
                  }
                  onClick={() => handleSelectConcept(c, "j_TOC")}
                >
                  {c.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        {showToc && (
          <div
            className="pane-resize-handle"
            role="separator"
            aria-label="Resize concepts and content panes"
            aria-orientation="vertical"
            onPointerDown={(event) => startPaneResize("left-middle", event)}
          />
        )}

        {/* Middle Pane */}
        <div className="pane middle-pane" style={paneStyle(displayedPaneWidths.middle)}>
          <h3>{selectedConcept?.title || "Content"}</h3>
          {selectedConcept && (selectedConcept.pdf || selectedConcept.video) && (
            <div className="resource-row">
              {selectedConcept.pdf && (
                <a
                  className="btn-link"
                  href={withHttps(selectedConcept.pdf)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open PDF"
                >
                  📄 PDF
                </a>
              )}

              {selectedConcept.video &&
                (() => {
                  const raw = withHttps(selectedConcept.video);
                  if (!isYouTube(raw)) {
                    return (
                      <a
                        className="btn-link"
                        href={raw}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Video"
                      >
                        🎬 Video
                      </a>
                    );
                  }
                  const id = youTubeId(raw);
                  if (!id) {
                    // If we can’t parse an ID, just show a link
                    return (
                      <a
                        className="btn-link"
                        href={raw}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open on YouTube"
                      >
                        ▶ Open on YouTube
                      </a>
                    );
                  }
                  return (
                    <div className="video-embed">
                      <iframe
                        title="YouTube"
                        width="100%"
                        height="280"
                        src={ytEmbedSrc(id)}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                      {/* Fallback link in case Shorts refuses to play in an embed */}
                      <div style={{ padding: "0.25rem 0" }}>
                        <a
                          className="btn-link"
                          href={`https://www.youtube.com/watch?v=${id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on YouTube"
                        >
                          ↗ Open on YouTube
                        </a>
                      </div>
                    </div>
                  );
                })()}
            </div>
          )}

          <div className="content-box">
            {selectedConcept?.entire ? renderTextWithLinks(selectedConcept.entire, definitions) : null}
          </div>
          <div className="nav-buttons">
            <button onClick={handleBack} disabled={historyIndex <= 0}>
              Back
            </button>
            <button onClick={handleForward} disabled={historyIndex >= history.length - 1}>
              Forward
            </button>
            <span className="quick-feedback-divider" aria-hidden="true" />
            <span className="quick-feedback-label">Like this content?</span>
            <button
              className="quick-feedback-button"
              onClick={() => handleQuickFeedback("content", "Yes")}
              disabled={commentSubmissionPending}
              aria-label="Like this concept content"
              title="Like this concept content"
            >
              <span aria-hidden="true">👍</span>
            </button>
            <button
              className="quick-feedback-button"
              onClick={() => handleQuickFeedback("content", "No")}
              disabled={commentSubmissionPending}
              aria-label="Dislike this concept content"
              title="Dislike this concept content"
            >
              <span aria-hidden="true">👎</span>
            </button>
            <span className="quick-feedback-divider" aria-hidden="true" />
            <span className="quick-feedback-label">Like how you got here?</span>
            <button
              className="quick-feedback-button journey-feedback-button"
              onClick={() => handleQuickFeedback("journey", "Yes")}
              disabled={commentSubmissionPending}
              aria-label="Like how you got here"
              title="Like how you got here"
            >
              <span aria-hidden="true">👍</span>
            </button>
            <button
              className="quick-feedback-button journey-feedback-button"
              onClick={() => handleQuickFeedback("journey", "No")}
              disabled={commentSubmissionPending}
              aria-label="Dislike how you got here"
              title="Dislike how you got here"
            >
              <span aria-hidden="true">👎</span>
            </button>
          </div>
          <div className="comment-form-section">
            <h3>Alpha Testers</h3>
            <p>
              Please comment at least every 5 entries or so, as this helps our nascent tracking system.
            </p>
            <form
              ref={commentFormRef}
              className="comment-form"
              action={COMMENT_FORM_ACTION}
              method="POST"
              target="comment-form-response"
              onSubmit={handleCommentSubmit}
            >
              <div className="alpha-tester-name-row">
                {!alphaTesterNameSubmitted && (
                  <p className="alpha-tester-name-prompt">
                    Please enter your name and click the Submit button
                  </p>
                )}
                <label htmlFor="alpha-tester-name">Alpha tester name</label>
                <input
                  id="alpha-tester-name"
                  type="text"
                  value={alphaTesterName}
                  onChange={(event) => {
                    setAlphaTesterName(event.target.value);
                    setAlphaTesterNameSubmitted(false);
                    setAlphaTesterNameError("");
                    setCommentSubmitted(false);
                  }}
                  aria-label="Alpha tester name"
                  aria-describedby={alphaTesterNameError ? "alpha-tester-name-error" : undefined}
                  placeholder="Your name"
                />
              </div>
              {alphaTesterNameError && (
                <span
                  id="alpha-tester-name-error"
                  className="alpha-tester-name-error"
                  role="alert"
                >
                  {alphaTesterNameError}
                </span>
              )}
              <label className="comment-textarea-label" htmlFor="alpha-tester-comment">
                Comments
              </label>
              <textarea
                id="alpha-tester-comment"
                value={feedbackComment}
                onChange={(event) => {
                  setFeedbackComment(event.target.value);
                  setLikeConceptContent("");
                  setLikeHowYouGotHere("");
                  setCommentSubmitted(false);
                }}
                placeholder="Your thoughts here"
                aria-label="Comment"
                rows={4}
              />
              <input
                type="hidden"
                name="entry.1214227783"
                value={commentSubmissionText}
              />
              <input
                type="hidden"
                name="entry.1883454059"
                value={selectedConcept?.id ?? ""}
              />
              <input
                type="hidden"
                name="entry.1305451169"
                value={selectedConcept?.title ?? ""}
              />
              <input
                type="hidden"
                name="entry.1973485510"
                value={readerHistory}
              />
              <input
                type="hidden"
                name="entry.1292115929"
                value={nextStorySubmission}
              />
              <input
                type="hidden"
                name="entry.1334530910"
                value={likeConceptContent}
              />
              <input
                type="hidden"
                name="entry.1310490354"
                value={likeHowYouGotHere}
              />
              <input
                type="hidden"
                name="entry.430995053"
                value={trimmedAlphaTesterName}
              />
              <div className="comment-form-actions">
                <button type="submit" disabled={commentSubmissionPending}>
                  {commentSubmissionPending ? "Submitting..." : "Submit"}
                </button>
                {commentSubmitted && (
                  <span role="status">Thank you. Your comment was submitted.</span>
                )}
              </div>
            </form>
            <iframe
              className="comment-form-response"
              name="comment-form-response"
              title="Comment submission response"
              onLoad={() => {
                if (!commentSubmissionPending) return;

                setFeedbackComment("");
                setLikeConceptContent("");
                setLikeHowYouGotHere("");
                setCommentSubmissionPending(false);
                setCommentSubmitted(true);
              }}
            />
          </div>
        </div>

        {/* Right Pane */}
        <div
          className="pane-resize-handle"
          role="separator"
          aria-label="Resize content and next in story panes"
          aria-orientation="vertical"
          onPointerDown={(event) => startPaneResize("middle-right", event)}
        />
        <div className="pane right-pane" style={paneStyle(displayedPaneWidths.right)}>
          <div className="next-story-section">
            <h3>Next in Story!</h3>
            {simpleTriangleOnly ? (
              <div className="simple-triangle-container">
                <svg
                  ref={simpleTriangleSvgRef}
                  className="simple-triangle-svg"
                  width="720"
                  height="420"
                  viewBox="-24 -70 664 500"
                  preserveAspectRatio="xMinYMid meet"
                >
                  <defs>
                    <marker
                      id="simple-triangle-leap-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="4"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M0,0 L8,4 L0,8 Z" />
                    </marker>
                  </defs>
                  <text
                    className="simple-triangle-current-title"
                    x="18"
                  >
                    {simpleTriangleTitleLines.map((line, index) => (
                      <tspan
                        key={`simple-title-line-${index}`}
                        x="18"
                        y={simpleTriangleTitleLines.length > 1 ? 176 + index * 20 : simpleTriangleOrigin.y + 4}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                  <circle
                    className="simple-triangle-origin"
                    cx={simpleTriangleOrigin.x}
                    cy={simpleTriangleOrigin.y}
                    r="4"
                  />

                  {simpleNextStoryConcepts.map((rel, idx) => {
                    const labelLayout = simpleChoiceLabelLayouts[idx];

                    return (
                      <g key={`simple-next-story-${rel.concept.id}`}>
                        <line
                          className="simple-triangle-next-line"
                          x1={simpleTriangleOrigin.x}
                          y1={simpleTriangleOrigin.y}
                          x2={labelLayout.point.x}
                          y2={labelLayout.point.y}
                        />
                        <circle
                          className="simple-triangle-endpoint"
                          cx={labelLayout.point.x}
                          cy={labelLayout.point.y}
                          r="5"
                        />
                        <foreignObject
                          x={labelLayout.x}
                          y={labelLayout.y}
                          width={simpleChoiceLabelWidth}
                          height={simpleChoiceLabelHeight}
                        >
                          <button
                            className="simple-triangle-choice"
                            style={{ backgroundColor: getRelationColor(rel.angle) }}
                            onPointerDown={(event) =>
                              startSimpleTriangleLabelDrag(labelLayout.key, event)
                            }
                            onClick={() => {
                              if (suppressSimpleTriangleClickRef.current === labelLayout.key) {
                                suppressSimpleTriangleClickRef.current = null;
                                return;
                              }

                              handleSelectConcept(
                                rel.concept,
                                `j_NextinStory_${nextStoryOffset + idx + 1}`
                              );
                            }}
                          >
                            {rel.concept.video && (
                              <span className="simple-triangle-media-icon" aria-label="Has video" title="Video">
                                ▶
                              </span>
                            )}
                            {rel.concept.pdf && (
                              <span className="simple-triangle-media-icon" aria-label="Has PDF" title="PDF">
                                📄
                              </span>
                            )}
                            <span>{rel.concept.title}</span>
                          </button>
                        </foreignObject>
                      </g>
                    );
                  })}

                  <line
                    className="simple-triangle-leap-line"
                    x1={simpleTriangleOrigin.x}
                    y1={simpleTriangleOrigin.y}
                    x2={simpleLeapLineEnd.x}
                    y2={simpleLeapLineEnd.y}
                    markerEnd="url(#simple-triangle-leap-arrow)"
                  />
                  <foreignObject
                    x={simpleLeapLabelX}
                    y={simpleLeapLineEnd.y - 18}
                    width={simpleLeapLabelWidth}
                    height="42"
                  >
                    <button
                      className="simple-triangle-leap"
                      onClick={handleLeapIntoUnknown}
                      disabled={unseenConcepts.length === 0}
                    >
                      <strong>take a wild leap?</strong>
                    </button>
                  </foreignObject>
                </svg>
                <button
                  className="other-suggestions-button"
                  onClick={handleShowOtherSuggestions}
                  disabled={!canShowOtherSuggestions}
                >
                  Want other suggestions?
                </button>
              </div>
            ) : nextStoryConcepts.length === 0 ? (
              <p className="next-story-empty">
                There are no new concepts from here that you have not already seen.
              </p>
            ) : (
              <ul className="next-story-list">
                {nextStoryConcepts.map((rel, idx) => (
                  <li
                    key={rel.concept.id}
                    className="next-story-item"
                    style={{ backgroundColor: getRelationColor(rel.angle) }}
                    onClick={() =>
                      handleSelectConcept(rel.concept, `j_NextinStory_${nextStoryOffset + idx + 1}`)
                    }
                  >
                    <span className="next-story-title">
                      {rel.concept.video && (
                        <span className="next-story-media-icon" aria-label="Has video" title="Video">
                          ▶
                        </span>
                      )}
                      {rel.concept.pdf && (
                        <span className="next-story-media-icon" aria-label="Has PDF" title="PDF">
                          📄
                        </span>
                      )}
                      <span>{rel.concept.title}</span>
                    </span>
                    {showStrengthsAndAngles && (
                      <span className="next-story-meta">
                        {" "}(strength {rel.strength}, angle {rel.angle})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!simpleTriangleOnly && (
              <>
                <button
                  className="other-suggestions-button"
                  onClick={handleShowOtherSuggestions}
                  disabled={!canShowOtherSuggestions}
                >
                  Want other suggestions?
                </button>

                <div className="leap-section">
                  <p>Don't like any of our suggestions?</p>
                  <button
                    className="leap-button"
                    onClick={handleLeapIntoUnknown}
                    disabled={unseenConcepts.length === 0}
                  >
                    Leap into the unknown!
                  </button>
                </div>
              </>
            )}
          </div>

          {showRelatedConcepts && (
            <div className="related-concepts-section">
              <h3>Related Concepts</h3>
              <ul>
                {relatedConcepts.map((rel, idx) => (
                  <li
                    key={idx}
                    style={{
                      backgroundColor: getRelationColor(rel.angle),
                      padding: "0.25rem 0.5rem",
                      margin: "0.1rem 0",
                      lineHeight: "1.2",
                    }}
                    onClick={() => handleSelectConcept(rel.concept, "j_Related")}
                  >
                    {rel.concept.title}
                    {showStrengthsAndAngles && ` (${rel.angle})`}
                  </li>
                ))}
              </ul>
            </div>
          )}


          {showTriangles && !simpleTriangleOnly && (
            <div className="semidisc-container">
              <svg
                className="semidisc-svg"
                width="418"
                height="330"
                viewBox="-50 -8 430 386"
                preserveAspectRatio="xMinYMid meet"
              >
                <path
                  d={`M${dialOrigin.x},${dialOrigin.y} L${polarToCartesian(180, g_radius).x},${polarToCartesian(180, g_radius).y} A${g_radius},${g_radius} 0 0,1 ${polarToCartesian(120, g_radius).x},${polarToCartesian(120, g_radius).y} Z`}
                  fill={showDialColors ? "#ffb6c1" : DIAL_NEUTRAL_COLOR}
                />
                <path
                  d={`M${dialOrigin.x},${dialOrigin.y} L${polarToCartesian(120, g_radius).x},${polarToCartesian(120, g_radius).y} A${g_radius},${g_radius} 0 0,1 ${polarToCartesian(60, g_radius).x},${polarToCartesian(60, g_radius).y} Z`}
                  fill={showDialColors ? "#90ee90" : DIAL_NEUTRAL_COLOR}
                />
                <path
                  d={`M${dialOrigin.x},${dialOrigin.y} L${polarToCartesian(60, g_radius).x},${polarToCartesian(60, g_radius).y} A${g_radius},${g_radius} 0 0,1 ${polarToCartesian(0, g_radius).x},${polarToCartesian(0, g_radius).y} Z`}
                  fill={showDialColors ? "#add8e6" : DIAL_NEUTRAL_COLOR}
                />

                <circle cx={dialOrigin.x} cy={dialOrigin.y} r="5" fill="darkblue" stroke="black" />

                {dialRelatedConcepts.map((rel) => {
                  const pos = polarToCartesian(rel.angle, g_radius-10);
                  return (
                    <g key={`related-${rel.concept.id}`}>
                      <line
                        x1={dialOrigin.x}
                        y1={dialOrigin.y}
                        x2={pos.x}
                        y2={pos.y}
                        stroke="black"
                        strokeDasharray="4"
                      />
                      <circle
                        className="semidisc-related-disc"
                        cx={pos.x}
                        cy={pos.y}
                        r="5"
                        fill={showDialColors ? getRelationColor(rel.angle) : DIAL_NEUTRAL_COLOR}
                        stroke="black"
                        tabIndex={0}
                        onMouseEnter={() => setHoveredDialConceptId(rel.concept.id)}
                        onMouseLeave={() => setHoveredDialConceptId(null)}
                        onFocus={() => setHoveredDialConceptId(rel.concept.id)}
                        onBlur={() => setHoveredDialConceptId(null)}
                      />
                    </g>
                  );
                })}

                {nextStoryConcepts.map((rel, idx) => {
                  const pos = polarToCartesian(rel.angle, g_radius-10);
                  const labelPos = polarToCartesian(rel.angle, g_radius+28);
                  let yOffset = 13 * (rel.angle / 180);
                  let xOffset = 0;
                  const textAnchor = rel.angle > 45 && rel.angle < 135 ? "end" : "start";
                  const anchorOffset = textAnchor === "start" ? 10 : textAnchor === "end" ? -10 : 0;
                  for (let j = 0; j < idx; j++) {
                    if (Math.abs(rel.angle - nextStoryConcepts[j].angle) < 15) {
                      yOffset += 12;
                    }
                  }
                  if (
                    idx < 2 &&
                    nextStoryConcepts.length > 1 &&
                    Math.abs(nextStoryConcepts[0].angle - nextStoryConcepts[1].angle) < 18
                  ) {
                    xOffset = idx === 0 ? -18 : 18;
                    yOffset += idx === 0 ? -20 : -6;
                  }
                  return (
                    <g key={`next-story-${rel.concept.id}`}>
                      <line
                        x1={dialOrigin.x}
                        y1={dialOrigin.y}
                        x2={pos.x}
                        y2={pos.y}
                        stroke="black"
                      />
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r="5"
                        fill={NEXT_STORY_ITEM_COLOR}
                        stroke="black"
                      />
                      <text
                        className="semidisc-next-story-label"
                        x={labelPos.x + anchorOffset + xOffset}
                        y={labelPos.y + yOffset}
                        fontSize="13"
                        fill="black"
                        textAnchor={textAnchor}
                      >
                        {rel.concept.title}
                      </text>
                    </g>
                  );
                })}

                {hoveredDialRelation && (() => {
                  const pos = polarToCartesian(hoveredDialRelation.angle, g_radius-10);
                  const labelWidth = Math.max(hoveredDialRelation.concept.title.length * 7, 40);
                  return (
                    <g className="semidisc-hover-label">
                      <rect
                        x={pos.x + 3}
                        y={pos.y - 14}
                        width={labelWidth}
                        height="18"
                        fill="white"
                        stroke="#ccc"
                      />
                      <text
                        x={pos.x + 7}
                        y={pos.y}
                        fontSize="13"
                        fill="#444"
                      >
                        {hoveredDialRelation.concept.title}
                      </text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          )}


          <div className="read-order">
            <h3>Reading History</h3>
            <ul>
              {displayedHistory.map(({ id, choice, index }) => {
                const c = concepts.find((c) => c.id === id);
                return (
                  <li
                    key={index}
                    className={selectedConcept?.id === id ? "selected" : ""}
                    onClick={() => handleSelectHistoryItem({ id, choice, index })}
                  >
                    {showHistoryQa && `${id} - ${choice} - `}
                    {c?.title}
                  </li>
                );
              })}
              <div ref={historyEndRef} />
            </ul>
          </div>
        </div>
      </div>
      )}

      {activeTab === "graph" && (
        <div className="graph-tab" role="tabpanel" aria-label="Graph">
          <ConceptGraph
            concepts={concepts}
            angleMatrix={angleMatrix}
            strengthMatrix={strengthMatrix}
            selectedConcept={selectedConcept}
            history={history}
            nextStoryConcepts={nextStoryConcepts}
            getRelationColor={getRelationColor}
            onPreviewConcept={handlePreviewGraphConcept}
            onOpenConcept={handleOpenGraphConcept}
            pathMode={pathMode}
            onPathModeChange={setPathMode}
          />
        </div>
      )}
    </div>
  );
}

export default App;
