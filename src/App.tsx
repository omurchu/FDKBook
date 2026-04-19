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

function App() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [angleMatrix, setAngleMatrix] = useState<number[][]>([]);  // Added angleMatrix state 0-180 degrees
  const [strengthMatrix, setStrengthMatrix] = useState<number[][]>([]); // Added strengthMatrix state 0-5
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showTriangles, setShowTriangles] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>("No file chosen");

  const historyEndRef = useRef<HTMLDivElement | null>(null);

  type ParsedSheet = {
    concepts: Concept[];
    angleMatrix: number[][];
    strengthMatrix: number[][];
    foundTuples: boolean;
    n: number;
  };

  const norm = (v: any) => String(v ?? "").trim().toLowerCase();

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
    if (textCol < 0) textCol = colIndexOf("entire");

    // keep pdf/video in Concept even if absent in new sheets
    const pdfCol = colIndexOf("pdf link");
    const videoCol = colIndexOf("video link");   // legacy single video column
    const shortVideoCol = colIndexOf("short video");
    const longVideoCol = colIndexOf("long video");

    if (idCol < 0 || titleCol < 0 || textCol < 0) {
      throw new Error("Missing one of required columns: ID, Title, and Entry Text/Entire.");
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

      // Prefer legacy video link if present; otherwise fall back to short, then long
      const videoRaw = legacyVideoRaw || shortVideoRaw || longVideoRaw;

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

  const loadFromArrayBuffer = (buffer: ArrayBuffer, sourceLabel: string) => {
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    const parsed = parseSheet(data);

    console.log(
      `${sourceLabel}: loaded ${parsed.n} concepts; ` +
      (parsed.foundTuples ? "detected tuple 'strength; angle' format" : "using legacy angle-only format")
    );

    setConcepts(parsed.concepts);
    setAngleMatrix(parsed.angleMatrix);
    setStrengthMatrix(parsed.strengthMatrix);

    setSelectedConcept(parsed.concepts[0] ?? null);
    if (parsed.concepts[0]) {
      setHistory([parsed.concepts[0].id]);
      setHistoryIndex(0);
    } else {
      setHistory([]);
      setHistoryIndex(-1);
    }
  };


  // Auto-load default matrix file on startup
   
  React.useEffect(() => {
    const defaultPath = process.env.PUBLIC_URL + "/matrix_file/fdk_matrix.xlsx";

    fetch(defaultPath)
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        try {
          loadFromArrayBuffer(buffer, "Auto-load");
          setFileName("Default: fdk_matrix.xlsx");
        } catch (err) {
          console.error("Failed to auto-load default Excel file:", err);
        }
      })
      .catch(() => console.log("Default matrix file not found."));
  }, []);

  
  const trimOrEmpty = (v: any) => (typeof v === "string" ? v.trim() : (v ?? ""));

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

  const reader = new FileReader();
  reader.onload = (evt) => {
    const buffer = evt.target?.result as ArrayBuffer;
    if (!buffer) return;

    try {
      loadFromArrayBuffer(buffer, "User upload");
    } catch (err) {
      console.error("Failed to parse uploaded Excel file:", err);
    }
  };

  reader.readAsArrayBuffer(file);
};


  const handleSelectConcept = (concept: Concept) => {
    setSelectedConcept(concept);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(concept.id);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setSelectedConcept(concepts.find((c) => c.id === history[newIndex]) || null);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setSelectedConcept(concepts.find((c) => c.id === history[newIndex]) || null);
    }
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

   // Next in Story: up to two strongest connections by strength
  const nextStoryConcepts =
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
              rel.strength > 0 // only non-zero strength
          )
          .sort((a, b) => {
            // primary: strength DESC
            if (b.strength !== a.strength) return b.strength - a.strength;
            // tie-breaker: smaller angle first
            return a.angle - b.angle;
          })
          .slice(0, 2)
      : [];

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
      x: 10 + radius * Math.sin(angleRad),
      y: 150 - radius * Math.cos(angleRad),
    };
  };

    // Create a wedge path from angleStart→angleEnd at a given radius
  // const arcPath = (startDeg: number, endDeg: number, radius: number) => {
  //   const start = polarToCartesian(startDeg, radius);
  //   const end = polarToCartesian(endDeg, radius);
  //   return `M10,150 L${start.x},${start.y} A${radius},${radius} 0 0,1 ${end.x},${end.y} Z`;
  // };

  const g_radius = 150; // global radius for dial points

  return (
    <div className="app-container">
      <header className="app-header">
        <h2>FDK Triangulator</h2>
        <label className="file-button">
          Choose File
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </label>
        <span>{fileName}</span>
        <label>
          <input
            type="checkbox"
            checked={showTriangles}
            onChange={(e) => setShowTriangles(e.target.checked)}
          />
          Show Triangles
        </label>
      </header>

      <div className="pane-container">
        {/* Left Pane */}
        <div className="pane left-pane">
          <h3>Concepts</h3>
          <ul>
            {concepts.map((c) => (
              <li
                key={c.id}
                className={
                  selectedConcept?.id === c.id
                    ? "selected"
                    : history.includes(c.id)
                    ? "visited"
                    : ""
                }
                onClick={() => handleSelectConcept(c)}
              >
                {c.title}
              </li>
            ))} 
          </ul>
        </div>

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
        </div>

        {/* Right Pane */}
        <div className="pane right-pane">
          <div className="next-story-section">
            <h3>Next in Story!</h3>
            {nextStoryConcepts.length === 0 ? (
              <p className="next-story-empty">No strong suggestions yet.</p>
            ) : (
              <ul className="next-story-list">
                {nextStoryConcepts.map((rel, idx) => (
                  <li
                    key={idx}
                    className="next-story-item"
                    onClick={() => handleSelectConcept(rel.concept)}
                  >
                    {rel.concept.title}{" "}
                    <span className="next-story-meta">
                      (strength {rel.strength}, angle {rel.angle})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
                onClick={() => handleSelectConcept(rel.concept)}
              >
                {rel.concept.title} ({rel.angle})
              </li>
            ))}
          </ul>


          {showTriangles && (
            <div className="semidisc-container">
              <svg
                className="semidisc-svg"
                width="330"
                height="330"
                viewBox="0 0 330 330"
              >
                <path d="M10,150 L10,0 A150,150 0 0,1 152,73 Z" fill="#ffb6c1" />
                <path d="M10,150 L152,73 A150,150 0 0,1 154,226 Z" fill="#90ee90" />
                <path d="M10,150 L154,226 A150,150 0 0,1 10,300 Z" fill="#add8e6" />

                <circle cx="10" cy="150" r="5" fill="darkblue" stroke="black" />

                {relatedConcepts.map((rel, idx) => {
                  const pos = polarToCartesian(rel.angle, g_radius-10);
                  let yOffset = 0;
                  for (let j = 0; j < idx; j++) {
                    if (Math.abs(rel.angle - relatedConcepts[j].angle) < 15) {
                      yOffset += 12;
                    }
                  }
                  return (
                    <g key={idx}>
                      <line
                        x1="10"
                        y1="150"
                        x2={pos.x}
                        y2={pos.y}
                        stroke="black"
                        strokeDasharray="4"
                      />
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r="5"
                        fill={getRelationColor(rel.angle)}
                        stroke="black"
                      />
                      <text x={pos.x + 5} y={pos.y + yOffset} fontSize="13" fill="black">
                        {rel.concept.title}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}


          <div className="read-order">
            <h3>Reading History</h3>
            <ul>
              {history.map((id, idx) => {
                const c = concepts.find((c) => c.id === id);
                return (
                  <li key={idx} className={selectedConcept?.id === id ? "selected" : ""}>
                    {id} - {c?.title}
                  </li>
                );
              })}
              <div ref={historyEndRef} />
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
