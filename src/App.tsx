// App.tsx
// Refactored to use only HTML elements + CSS for layout/styling.
// No Chakra UI or external UI libraries.
// Last updated: 2025-09-18 20:05 PDT

import React, { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

interface Concept {
  id: number;
  title: string;
  entire: string;
  pdf: string;
  video: string;
}

function App() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [matrix, setMatrix] = useState<number[][]>([]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showTriangles, setShowTriangles] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>("No file chosen");

  const historyEndRef = useRef<HTMLDivElement | null>(null);

  // // Prevent pane 3 from always jumping to bottom; instead, keep latest entry visible if near bottom
  // useEffect(() => {
  //   if (historyEndRef.current) {
  //     historyEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  //   }
  // }, [history]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const buffer = evt.target?.result as ArrayBuffer;
      if (!buffer) return;
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

      const concepts: Concept[] = [];
      for (let i = 2; i < 37; i++) {
        concepts.push({
          id: Number(data[i][3]),
          title: data[i][4],
          entire: data[i][2],
          pdf: data[i][0],
          video: data[i][1],
        });
      }

      const matrix: number[][] = [];
      for (let i = 2; i < 37; i++) {
        const row: number[] = [];
        for (let j = 5; j < 40; j++) {
          row.push(Number(data[i][j]) || 0);
        }
        matrix.push(row);
      }

      setConcepts(concepts);
      setMatrix(matrix);
      setSelectedConcept(concepts[0]);
      setHistory([concepts[0].id]);
      setHistoryIndex(0);
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

  const relatedConcepts = selectedConcept
    ? concepts
        .map((c, idx) => ({
          concept: c,
          strength: matrix[selectedConcept.id - 1][idx],
        }))
        .filter((rel) => rel.strength > 0)
        .sort((a, b) => a.strength - b.strength)
    : [];

  const getRelationColor = (strength: number) => {
    if (strength <= 59) return "#add8e6";
    if (strength <= 119) return "#90ee90";
    return "#ffb6c1";
  };

  const polarToCartesian = (angleDeg: number, radius: number) => {
    const angleRad = (Math.PI / 180) * angleDeg;
    return {
      x: 10 + radius * Math.sin(angleRad),
      y: 150 - radius * Math.cos(angleRad),
    };
  };

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
                className={selectedConcept?.id === c.id ? "selected" : ""}
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
          <h3>Related Concepts</h3>
          <ul>
            {relatedConcepts.map((rel, idx) => (
              <li
                key={idx}
                style={{
                  backgroundColor: getRelationColor(rel.strength),
                  padding: "0.25rem 0.5rem",
                  margin: "0.1rem 0",
                  lineHeight: "1.2",
                }}
                onClick={() => handleSelectConcept(rel.concept)}
              >
                {rel.concept.title} ({rel.strength})
              </li>
            ))}
          </ul>

          {showTriangles && (
            <div className="semidisc-container">
              <svg width="330" height="330" viewBox="0 0 330 330">
                <path d="M10,150 L10,0 A150,150 0 0,1 152,73 Z" fill="#add8e6" />
                <path d="M10,150 L152,73 A150,150 0 0,1 154,226 Z" fill="#90ee90" />
                <path d="M10,150 L154,226 A150,150 0 0,1 10,300 Z" fill="#ffb6c1" />
                <circle cx="10" cy="150" r="5" fill="darkblue" stroke="black" />

                {relatedConcepts.map((rel, idx) => {
                  const pos = polarToCartesian(rel.strength, 135);
                  let yOffset = 0;
                  for (let j = 0; j < idx; j++) {
                    if (Math.abs(rel.strength - relatedConcepts[j].strength) < 15) {
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
                        fill={getRelationColor(rel.strength)}
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
            <h3>Read Order</h3>
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
