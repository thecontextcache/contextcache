"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const MEMORY_TYPES = ["decision", "finding", "definition", "note", "link", "todo"];

function buildDefaultApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export default function AppPage() {
  const router = useRouter();
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL || buildDefaultApiBase(), []);
  const [auth, setAuth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [memoryType, setMemoryType] = useState("decision");
  const [memoryContent, setMemoryContent] = useState("");
  const [recallQuery, setRecallQuery] = useState("");
  const [memoryPack, setMemoryPack] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function apiRequest(path, init = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "Request failed");
    return body;
  }

  async function load() {
    try {
      const me = await apiRequest("/auth/me");
      setAuth(me);
      const list = await apiRequest("/projects");
      setProjects(list);
      if (list.length && !projectId) setProjectId(String(list[0].id));
    } catch (err) {
      if ((err.message || "").toLowerCase().includes("unauthorized")) {
        router.replace("/auth");
        return;
      }
      if (process.env.NODE_ENV !== "production") console.error(err);
      setError("Could not load app data right now.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    window.location.href = "/auth";
  }

  async function createProject(event) {
    event.preventDefault();
    setError("");
    try {
      const project = await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify({ name: newProjectName }),
      });
      setNewProjectName("");
      setProjectId(String(project.id));
      setStatus("Project created.");
      await load();
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error(err);
      setError("Could not create project.");
    }
  }

  async function addMemory(event) {
    event.preventDefault();
    setError("");
    try {
      await apiRequest(`/projects/${projectId}/memories`, {
        method: "POST",
        body: JSON.stringify({ type: memoryType, content: memoryContent }),
      });
      setMemoryContent("");
      setStatus("Memory saved.");
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error(err);
      setError("Could not save memory.");
    }
  }

  async function recall() {
    setError("");
    try {
      const data = await apiRequest(`/projects/${projectId}/recall?query=${encodeURIComponent(recallQuery)}&limit=10`);
      setMemoryPack(data.memory_pack_text || "");
      setStatus(`Recall complete (${data.items?.length || 0} items)`);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error(err);
      setError("Recall failed. Please try again.");
    }
  }

  async function copyMemoryPack() {
    if (!memoryPack) return;
    setError("");
    setStatus("");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(memoryPack);
        setStatus("Memory pack copied.");
        return;
      }
    } catch {
      // Fall through to legacy copy method.
    }

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
      if (!ok) throw new Error("execCommand copy failed");
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
    anchor.download = "memory-pack.txt";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setStatus("Memory pack downloaded.");
  }

  return (
    <main className="stack-lg">
      <section className="card">
        <div className="row spread">
          <div>
            <h1>App</h1>
            <p className="muted">Signed in as {auth?.email || "..."}</p>
          </div>
          <div className="row">
            {auth?.is_admin ? <Link href="/admin" className="btn secondary">Admin</Link> : null}
            <button type="button" className="btn secondary" onClick={logout}>Logout</button>
          </div>
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Create Project</h2>
          <form onSubmit={createProject} className="stack">
            <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Project name" required />
            <button className="btn primary" type="submit">Create project</button>
          </form>
          <label>Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </section>

        <section className="card">
          <h2>Add Memory</h2>
          <form onSubmit={addMemory} className="stack">
            <select value={memoryType} onChange={(e) => setMemoryType(e.target.value)}>
              {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea value={memoryContent} onChange={(e) => setMemoryContent(e.target.value)} placeholder="Write a high-signal memory..." required />
            <button className="btn primary" type="submit">Publish memory</button>
          </form>
        </section>
      </div>

      <section className="card">
        <h2>Recall</h2>
        <div className="stack">
          <input value={recallQuery} onChange={(e) => setRecallQuery(e.target.value)} placeholder="What context do you need?" />
          <div className="row">
            <button className="btn primary" type="button" onClick={recall}>Run recall</button>
            <button className="btn secondary" type="button" onClick={copyMemoryPack} disabled={!memoryPack}>
              Copy
            </button>
            <button className="btn secondary" type="button" onClick={downloadMemoryPack} disabled={!memoryPack}>
              Download .txt
            </button>
          </div>
          <pre className="pre">{memoryPack || "Memory pack appears here."}</pre>
        </div>
      </section>

      {status ? <p className="ok">{status}</p> : null}
      {error ? <p className="err">{error}</p> : null}
    </main>
  );
}
