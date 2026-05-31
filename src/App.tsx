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
}

type ParsedSheet = {
  concepts: Concept[];
  angleMatrix: number[][];
  strengthMatrix: number[][];
  foundTuples: boolean;
  n: number;
};

type ActiveTab = "home" | "graph";
type PathMode = "hide" | "simple" | "detailed";

type HistoryEntry = {
  id: number;
  choice: string;
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

const INITIAL_NEXT_STORY_COUNT = 2;
const MAX_OTHER_SUGGESTION_CLICKS = 2;
const INITIAL_HISTORY_CHOICE = "j_Start";
const NEXT_STORY_ITEM_COLOR = "#fff8c6";
const DIAL_NEUTRAL_COLOR = "#e6e6e6";
const GRAPH_WIDTH = 980;
const GRAPH_HEIGHT = 640;
const GRAPH_CENTER_X = GRAPH_WIDTH / 2 + 50;
const GRAPH_CENTER_Y = GRAPH_HEIGHT / 2;
const GRAPH_NODE_CLICK_ZOOM = 1.1;
const COMMENT_FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSfRsy9X9bVI-CdppeEJzgSb3ZbIa7dqoELENtiVRuVue1M4lw/formResponse";
const MAX_READER_HISTORY_LENGTH = 2000;

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
    });
  }

  // 6) Build angle + strength matrices (n x n)
  const angleMatrix: number[][] = [];
  const strengthMatrix: number[][] = [];
  let foundTuples = false;

  for (let i = 0; i < n; i++) {
    const row = data[matrixRowStart + i] ?? [];
    const aRow: number[] = [];
    const sRow: number[] = [];

    for (let j = 0; j < n; j++) {
      const raw = row[matrixStartCol + j];
      const parsed = parseCellToStrengthAngle(raw);
      if (parsed.foundTuple) foundTuples = true;
      aRow.push(parsed.angleVal);
      sRow.push(parsed.strengthVal);
    }

    angleMatrix.push(aRow);
    strengthMatrix.push(sRow);
  }

  return { concepts, angleMatrix, strengthMatrix, foundTuples, n };
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
        <title>Concept strength network</title>
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
            const hasMedia = Boolean(node.concept.pdf || node.concept.video);
            const mediaLabel = node.concept.video ? "Video" : node.concept.pdf ? "PDF" : "";
            const graphNodeLabel =
              isHovered && mediaLabel
                ? `${mediaLabel}: ${node.concept.title}`
                : node.concept.title;
            const showLabel = isSelected || isHistory || isNextStory || isHovered || (isZoomed && isRelated);
            const fill = isSelected
              ? "#0f4c81"
              : isRelated
              ? getRelationColor(relationAngle)
              : isHistory
              ? "#e6f3ff"
              : isNextStory
              ? NEXT_STORY_ITEM_COLOR
              : "#d9eef7";

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
                  <rect
                    x={-(isSelected ? 10 : isRelated ? 8 : 6)}
                    y={-(isSelected ? 10 : isRelated ? 8 : 6)}
                    width={(isSelected ? 10 : isRelated ? 8 : 6) * 2}
                    height={(isSelected ? 10 : isRelated ? 8 : 6) * 2}
                    fill={fill}
                    stroke={isHistory ? "#c1121f" : isNextStory ? "#d6b800" : isSelected ? "#061f35" : isRelated ? "#222" : "#4b7f95"}
                    strokeWidth={isHistory ? 3 : isNextStory ? 2.4 : isSelected ? 3 : isRelated ? 2 : 1.2}
                  />
                ) : (
                  <circle
                    r={isSelected ? 10 : isRelated ? 8 : 6}
                    fill={fill}
                    stroke={isHistory ? "#c1121f" : isNextStory ? "#d6b800" : isSelected ? "#061f35" : isRelated ? "#222" : "#4b7f95"}
                    strokeWidth={isHistory ? 3 : isNextStory ? 2.4 : isSelected ? 3 : isRelated ? 2 : 1.2}
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
        {showPathwayLegend && (
        <g className="graph-pathway-legend" transform={`translate(18, ${GRAPH_HEIGHT - 184})`}>
          <rect className="graph-pathway-legend-bg" width="178" height="166" rx="4" />
          <text className="graph-pathway-legend-title" x="12" y="22">
            Pathways
          </text>
          {[
            { label: "Next in Story", className: "graph-history-path-next-story" },
            { label: "Leap", className: "graph-history-path-leap" },
            { label: "History", className: "graph-history-path-history" },
            { label: "TOC", className: "graph-history-path-toc" },
            { label: "Node", className: "graph-history-path-node" },
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
  const [showDialColors, setShowDialColors] = useState<boolean>(false);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [showRelatedConcepts, setShowRelatedConcepts] = useState<boolean>(false);
  const [showStrengthsAndAngles, setShowStrengthsAndAngles] = useState<boolean>(false);
  const [hoveredDialConceptId, setHoveredDialConceptId] = useState<number | null>(null);
  const [nextStoryOffset, setNextStoryOffset] = useState<number>(0);
  const [otherSuggestionClicks, setOtherSuggestionClicks] = useState<number>(0);
  const [fileName, setFileName] = useState<string>("No file chosen");
  const [loadError, setLoadError] = useState<string>("");
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [commentSubmissionPending, setCommentSubmissionPending] = useState<boolean>(false);
  const [commentSubmitted, setCommentSubmitted] = useState<boolean>(false);

  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const tocItemRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const menuRef = useRef<HTMLDetailsElement | null>(null);

  const loadFromArrayBuffer = React.useCallback((buffer: ArrayBuffer, sourceLabel: string) => {
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    const parsed = parseSheet(data);
    setLoadError("");

    console.log(
      `${sourceLabel}: loaded ${parsed.n} concepts; ` +
      (parsed.foundTuples ? "detected tuple 'strength; angle' format" : "using legacy angle-only format")
    );

    setConcepts(parsed.concepts);
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
  }, [selectedConcept, activeTab]);

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

  const handleSelectHistoryItem = (entry: HistoryEntry) => {
    const concept = concepts.find((c) => c.id === entry.id);
    if (!concept) return;

    handleSelectConcept(concept, "j_History");
  };

  const relatedConcepts =
    selectedConcept && angleMatrix[selectedConcept.id - 1]
      ? concepts
          .map((c, idx) => ({
            concept: c,
            angle: angleMatrix[selectedConcept.id - 1]?.[idx] ?? 0,
            strength: strengthMatrix[selectedConcept.id - 1]?.[idx] ?? 0,
          }))
          .filter((rel) => rel.angle > 0)
          .sort((a, b) => b.angle - a.angle)
      : [];

  const historyIds = history.map((entry) => entry.id);
  const seenConceptIds = new Set(historyIds);
  const unseenConcepts = concepts.filter((concept) => !seenConceptIds.has(concept.id));

   // Next in Story: strongest unseen connections by strength
  const allNextStoryConcepts =
    selectedConcept && strengthMatrix[selectedConcept.id - 1]
      ? concepts
          .map((c, idx) => ({
            concept: c,
            angle: angleMatrix[selectedConcept.id - 1]?.[idx] ?? 0,
            strength: strengthMatrix[selectedConcept.id - 1]?.[idx] ?? 0,
          }))
          .filter(
            (rel) =>
              rel.concept.id !== selectedConcept.id && // ignore self
              !seenConceptIds.has(rel.concept.id) && // only concepts not yet seen this session
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

    const randomIndex = Math.floor(Math.random() * unseenConcepts.length);
    handleSelectConcept(unseenConcepts[randomIndex], "j_Leap");
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

  return (
    <div className="app-container">
      <header className="app-header">
        <h2>The Book of Your Body Wisdom</h2>
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
            Trace
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
              Choose File
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

      {activeTab === "home" && (
      <div className="pane-container" role="tabpanel" aria-label="Home">
        {/* Left Pane */}
        {showToc && (
          <div className="pane left-pane">
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

        {/* Middle Pane */}
        <div className="pane middle-pane">
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

          <div className="content-box">{selectedConcept?.entire}</div>
          <div className="nav-buttons">
            <button onClick={handleBack} disabled={historyIndex <= 0}>
              Back
            </button>
            <button onClick={handleForward} disabled={historyIndex >= history.length - 1}>
              Forward
            </button>
          </div>
          <div className="comment-form-section">
            <h3>What do you think?</h3>
            <p>
              This is a feedback area for Wanderers exploring the Book of Your Body Wisdom app.
            </p>
            <form
              className="comment-form"
              action={COMMENT_FORM_ACTION}
              method="POST"
              target="comment-form-response"
              onSubmit={() => {
                setCommentSubmissionPending(true);
                setCommentSubmitted(false);
              }}
            >
              <textarea
                name="entry.1214227783"
                value={feedbackComment}
                onChange={(event) => {
                  setFeedbackComment(event.target.value);
                  setCommentSubmitted(false);
                }}
                placeholder="Your thoughts here"
                aria-label="Comment"
                rows={4}
                required
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
                setCommentSubmissionPending(false);
                setCommentSubmitted(true);
              }}
            />
          </div>
        </div>

        {/* Right Pane */}
        <div className="pane right-pane">
          <div className="next-story-section">
            <h3>Next in Story!</h3>
            {nextStoryConcepts.length === 0 ? (
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
                    {rel.concept.title}
                    {showStrengthsAndAngles && (
                      <span className="next-story-meta">
                        {" "}(strength {rel.strength}, angle {rel.angle})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

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


          {showTriangles && (
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
                    onClick={() => handleSelectHistoryItem({ id, choice })}
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
