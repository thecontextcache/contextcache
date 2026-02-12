"use client";

import { useEffect, useMemo, useState } from "react";

const MEMORY_TYPES = ["decision", "finding", "definition", "note", "link", "todo"];

function buildDefaultApiBase() {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export default function Home() {
  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE_URL || buildDefaultApiBase(),
    []
  );

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [memoryType, setMemoryType] = useState("decision");
  const [memoryContent, setMemoryContent] = useState("");
  const [recallQuery, setRecallQuery] = useState("");
  const [memoryPack, setMemoryPack] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function request(path, init) {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      let detail = "Request failed";
      try {
        const body = await response.json();
        detail = body.detail || detail;
      } catch {
        // Ignore non-JSON errors and keep generic detail.
      }
      throw new Error(detail);
    }

    return response.json();
  }

  async function loadProjects() {
    try {
      const data = await request("/projects");
      setProjects(data);
      if (!projectId && data.length > 0) {
        setProjectId(String(data[0].id));
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function onCreateProject(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!newProjectName.trim()) {
      setError("Project name is required.");
      return;
    }

    try {
      const project = await request("/projects", {
        method: "POST",
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      setNewProjectName("");
      setProjectId(String(project.id));
      setStatus("Project created.");
      await loadProjects();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onAddMemory(event) {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!projectId) {
      setError("Select a project first.");
      return;
    }
    if (!memoryContent.trim()) {
      setError("Memory content is required.");
      return;
    }

    try {
      await request(`/projects/${projectId}/memories`, {
        method: "POST",
        body: JSON.stringify({ type: memoryType, content: memoryContent.trim() }),
      });
      setMemoryContent("");
      setStatus("Memory saved.");
    } catch (e) {
      setError(e.message);
    }
  }

  async function onRecall() {
    setError("");
    setStatus("");

    if (!projectId) {
      setError("Select a project first.");
      return;
    }

    try {
      const query = encodeURIComponent(recallQuery);
      const data = await request(`/projects/${projectId}/recall?query=${query}&limit=10`);
      setMemoryPack(data.memory_pack_text || "");
      setStatus(`Recall complete (${data.items?.length || 0} items).`);
    } catch (e) {
      setError(e.message);
    }
  }

  async function copyMemoryPack() {
    if (!memoryPack) return;
    setError("");
    setStatus("");

    // Prefer modern async clipboard in secure contexts.
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(memoryPack);
        setStatus("Memory pack copied.");
        return;
      }
    } catch {
      // Fall through to legacy copy method.
    }

    // Fallback for HTTP/insecure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = memoryPack;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);

      ta.focus();
      ta.select();

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);

      if (!ok) {
        throw new Error("execCommand copy failed");
      }

      setStatus("Memory pack copied.");
    } catch {
      setError("Copy failed in this browser on HTTP. Use Download .txt or run over HTTPS.");
    }
  }

  function downloadMemoryPack() {
    if (!memoryPack) return;
    const blob = new Blob([memoryPack], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `memory-pack-${projectId || "project"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Memory pack downloaded.");
  }

  return (
    <main className="container">
      <h1>ContextCache</h1>
      <p className="subtitle">Select project, publish memory cards, recall and export a memory pack.</p>

      <div className="grid">
        <section className="card">
          <h2>Project</h2>
          <form onSubmit={onCreateProject}>
            <label htmlFor="project">Select project</label>
            <select
              id="project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Choose project...</option>
              {projects.map((project) => (
                <option key={project.id} value={String(project.id)}>
                  {project.name}
                </option>
              ))}
            </select>

            <label htmlFor="new-project" style={{ marginTop: 10 }}>New project name</label>
            <div className="row">
              <input
                id="new-project"
                placeholder="e.g. Backend Refactor"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
              />
              <button type="submit">Create</button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>Add Memory</h2>
          <form onSubmit={onAddMemory}>
            <label htmlFor="memory-type">Type</label>
            <select
              id="memory-type"
              value={memoryType}
              onChange={(event) => setMemoryType(event.target.value)}
            >
              {MEMORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <label htmlFor="memory-content" style={{ marginTop: 10 }}>Content</label>
            <textarea
              id="memory-content"
              placeholder="What should future AI conversations remember?"
              value={memoryContent}
              onChange={(event) => setMemoryContent(event.target.value)}
            />
            <button type="submit">Publish Memory</button>
          </form>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Recall + Export</h2>
        <label htmlFor="recall-query">Query</label>
        <div className="row">
          <input
            id="recall-query"
            placeholder="postgres, auth, latency..."
            value={recallQuery}
            onChange={(event) => setRecallQuery(event.target.value)}
          />
          <button type="button" onClick={onRecall}>Recall</button>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="secondary" onClick={copyMemoryPack}>Copy</button>
          <button type="button" className="secondary" onClick={downloadMemoryPack}>Download .txt</button>
        </div>

        <pre className="pre">{memoryPack || "Run recall to generate a memory pack."}</pre>
        {status ? <div className="muted">{status}</div> : null}
        {error ? <div className="notice">{error}</div> : null}
        <div className="muted" style={{ marginTop: 8 }}>API: {apiBase}</div>
      </section>
    </main>
  );
}
