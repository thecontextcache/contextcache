type NodeId = string;
type EdgeId = string;
type ClusterId = string;

type Algo = 'louvain' | 'label-propagation' | 'spatial';

interface GraphNode {
  id: NodeId;
  x: number;
  y: number;
}

interface GraphEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
}

interface ClusterMetrics {
  id: ClusterId;
  nodeCount: number;
  edgeCount: number;
  density: number;
  avgDegree: number;
}

interface ClusterNode {
  nodeId: NodeId;
  clusterId: ClusterId;
  x: number;
  y: number;
}

interface ClusterEdge {
  id: EdgeId;
  sourceClusterId: ClusterId;
  targetClusterId: ClusterId;
  edgeCount: number;
}

interface OverlayHull {
  clusterId: ClusterId;
  points: { x: number; y: number }[];
  centroid: { x: number; y: number };
  radius: number;
}

interface ClusteringResult {
  algo: Algo;
  clusters: ClusterMetrics[];
  nodeAssignments: ClusterNode[];
  clusterEdges: ClusterEdge[];
  hulls: OverlayHull[];
  generatedAt: number;
}

type ClusterWorkerIn =
  | {
      type: 'INIT_GRAPH';
      nodes: Array<{ id: NodeId; x: number; y: number }>;
      edges: Array<{ id?: EdgeId; source: NodeId; target: NodeId }>;
    }
  | {
      type: 'RUN_CLUSTERING';
      requestId: string;
      algo?: 'louvain' | 'label-propagation';
    }
  | {
      type: 'APPLY_DELTA';
      requestId: string;
      addedNodes: Array<{ id: NodeId; x?: number; y?: number }>;
      removedNodeIds: NodeId[];
      addedEdges: Array<{ id?: EdgeId; source: NodeId; target: NodeId }>;
      removedEdgeIds: EdgeId[];
    }
  | {
      type: 'SYNC_POSITIONS';
      positions: Array<{ id: NodeId; x: number; y: number }>;
    }
  | {
      type: 'ABORT';
      requestId?: string;
    };

type ClusterWorkerOut =
  | {
      type: 'CLUSTERING_RESULT';
      requestId: string;
      result: ClusteringResult;
    }
  | {
      type: 'CLUSTERING_ERROR';
      requestId: string;
      error: string;
    }
  | {
      type: 'PROGRESS';
      requestId: string;
      phase: 'building' | 'iterating' | 'refining';
      progress: number;
    };

interface GraphState {
  nodes: Map<NodeId, GraphNode>;
  edges: Map<EdgeId, GraphEdge>;
  adjacency: Map<NodeId, Set<NodeId>>;
}

let state: GraphState = {
  nodes: new Map(),
  edges: new Map(),
  adjacency: new Map(),
};
let abortedRequestId: string | null = null;

function ensureAdjacency(id: NodeId) {
  if (!state.adjacency.has(id)) state.adjacency.set(id, new Set());
}

function addNode(id: NodeId, x = 0, y = 0) {
  state.nodes.set(id, { id, x, y });
  ensureAdjacency(id);
}

function removeNode(id: NodeId) {
  state.nodes.delete(id);
  const neighbors = state.adjacency.get(id);
  if (neighbors) {
    for (const n of neighbors) {
      state.adjacency.get(n)?.delete(id);
    }
  }
  state.adjacency.delete(id);
  for (const [edgeId, edge] of state.edges) {
    if (edge.source === id || edge.target === id) {
      state.edges.delete(edgeId);
    }
  }
}

function addEdge(id: EdgeId, source: NodeId, target: NodeId) {
  if (source === target) return;
  if (!state.nodes.has(source) || !state.nodes.has(target)) return;
  state.edges.set(id, { id, source, target });
  ensureAdjacency(source);
  ensureAdjacency(target);
  state.adjacency.get(source)?.add(target);
  state.adjacency.get(target)?.add(source);
}

function removeEdge(id: EdgeId) {
  const edge = state.edges.get(id);
  if (!edge) return;
  state.adjacency.get(edge.source)?.delete(edge.target);
  state.adjacency.get(edge.target)?.delete(edge.source);
  state.edges.delete(id);
}

function initGraph(msg: Extract<ClusterWorkerIn, { type: 'INIT_GRAPH' }>) {
  state = {
    nodes: new Map(),
    edges: new Map(),
    adjacency: new Map(),
  };
  for (const n of msg.nodes) addNode(n.id, n.x, n.y);
  for (const e of msg.edges) {
    const edgeId = e.id ?? `${e.source}->${e.target}`;
    addEdge(edgeId, e.source, e.target);
  }
}

function postProgress(requestId: string, phase: 'building' | 'iterating' | 'refining', progress: number) {
  const out: ClusterWorkerOut = {
    type: 'PROGRESS',
    requestId,
    phase,
    progress: Math.max(0, Math.min(1, progress)),
  };
  postMessage(out);
}

function degree(id: NodeId): number {
  return state.adjacency.get(id)?.size ?? 0;
}

function runLabelPropagation(maxIterations = 20): Map<NodeId, ClusterId> {
  const labels = new Map<NodeId, ClusterId>();
  for (const id of state.nodes.keys()) labels.set(id, id);
  const nodeIds = Array.from(state.nodes.keys()).sort();

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = 0;
    for (const id of nodeIds) {
      const neighbors = state.adjacency.get(id);
      if (!neighbors || neighbors.size === 0) continue;
      const counts = new Map<ClusterId, number>();
      for (const n of neighbors) {
        const label = labels.get(n);
        if (!label) continue;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      let bestLabel = labels.get(id) ?? id;
      let bestCount = -1;
      for (const [label, cnt] of counts) {
        if (cnt > bestCount || (cnt === bestCount && label < bestLabel)) {
          bestLabel = label;
          bestCount = cnt;
        }
      }
      if (bestLabel !== labels.get(id)) {
        labels.set(id, bestLabel);
        changed += 1;
      }
    }
    if (changed === 0) break;
  }
  return labels;
}

function runLouvainLike(maxPasses = 5): Map<NodeId, ClusterId> {
  const nodeIds = Array.from(state.nodes.keys()).sort();
  const m2 = Math.max(1, state.edges.size * 2);
  const community = new Map<NodeId, ClusterId>();
  const totalDegreeByCommunity = new Map<ClusterId, number>();
  const nodeDegree = new Map<NodeId, number>();

  for (const id of nodeIds) {
    const d = degree(id);
    nodeDegree.set(id, d);
    community.set(id, id);
    totalDegreeByCommunity.set(id, d);
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = 0;
    for (const id of nodeIds) {
      const currentCommunity = community.get(id) ?? id;
      const d = nodeDegree.get(id) ?? 0;
      const neighbors = state.adjacency.get(id);
      if (!neighbors || neighbors.size === 0) continue;

      const neighborCommunityWeight = new Map<ClusterId, number>();
      for (const n of neighbors) {
        const c = community.get(n) ?? n;
        neighborCommunityWeight.set(c, (neighborCommunityWeight.get(c) ?? 0) + 1);
      }

      totalDegreeByCommunity.set(currentCommunity, (totalDegreeByCommunity.get(currentCommunity) ?? 0) - d);

      let bestCommunity = currentCommunity;
      let bestGain = 0;
      for (const [candidateCommunity, k_i_in] of neighborCommunityWeight) {
        const sigmaTot = totalDegreeByCommunity.get(candidateCommunity) ?? 0;
        const gain = k_i_in - (sigmaTot * d) / m2;
        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = candidateCommunity;
        }
      }

      community.set(id, bestCommunity);
      totalDegreeByCommunity.set(bestCommunity, (totalDegreeByCommunity.get(bestCommunity) ?? 0) + d);
      if (bestCommunity !== currentCommunity) moved += 1;
    }

    if (moved === 0) break;
  }

  // Compact community labels.
  const compact = new Map<ClusterId, ClusterId>();
  let idx = 1;
  for (const id of nodeIds) {
    const c = community.get(id) ?? id;
    if (!compact.has(c)) {
      compact.set(c, `c${idx}`);
      idx += 1;
    }
    community.set(id, compact.get(c)!);
  }
  return community;
}

function computeConvexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 3) return points;
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<{ x: number; y: number }> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function buildResult(assignments: Map<NodeId, ClusterId>, algo: Algo): ClusteringResult {
  const byClusterNodes = new Map<ClusterId, NodeId[]>();
  for (const [nodeId, clusterId] of assignments) {
    const arr = byClusterNodes.get(clusterId) ?? [];
    arr.push(nodeId);
    byClusterNodes.set(clusterId, arr);
  }

  const nodeAssignments: ClusterNode[] = [];
  for (const [nodeId, clusterId] of assignments) {
    const node = state.nodes.get(nodeId);
    if (!node) continue;
    nodeAssignments.push({
      nodeId,
      clusterId,
      x: node.x,
      y: node.y,
    });
  }

  const clusterMetrics: ClusterMetrics[] = [];
  for (const [clusterId, nodeIds] of byClusterNodes) {
    const nodeSet = new Set(nodeIds);
    let internalEdges = 0;
    let degreeSum = 0;
    for (const id of nodeIds) {
      const neighbors = state.adjacency.get(id);
      degreeSum += neighbors?.size ?? 0;
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (nodeSet.has(n) && id < n) internalEdges += 1;
      }
    }
    const n = nodeIds.length;
    const density = n > 1 ? (2 * internalEdges) / (n * (n - 1)) : 0;
    clusterMetrics.push({
      id: clusterId,
      nodeCount: n,
      edgeCount: internalEdges,
      density,
      avgDegree: n > 0 ? degreeSum / n : 0,
    });
  }
  clusterMetrics.sort((a, b) => b.nodeCount - a.nodeCount);

  const clusterEdgeMap = new Map<string, ClusterEdge>();
  for (const edge of state.edges.values()) {
    const c1 = assignments.get(edge.source);
    const c2 = assignments.get(edge.target);
    if (!c1 || !c2 || c1 === c2) continue;
    const [sourceClusterId, targetClusterId] = c1 < c2 ? [c1, c2] : [c2, c1];
    const key = `${sourceClusterId}->${targetClusterId}`;
    const existing = clusterEdgeMap.get(key);
    if (existing) {
      existing.edgeCount += 1;
    } else {
      clusterEdgeMap.set(key, {
        id: key,
        sourceClusterId,
        targetClusterId,
        edgeCount: 1,
      });
    }
  }

  const hulls: OverlayHull[] = [];
  for (const [clusterId, nodeIds] of byClusterNodes) {
    if (nodeIds.length < 3) continue;
    const pts: Array<{ x: number; y: number }> = [];
    let cx = 0;
    let cy = 0;
    for (const id of nodeIds) {
      const node = state.nodes.get(id);
      if (!node) continue;
      pts.push({ x: node.x, y: node.y });
      cx += node.x;
      cy += node.y;
    }
    if (pts.length < 3) continue;
    const centroid = { x: cx / pts.length, y: cy / pts.length };
    const hull = computeConvexHull(pts);
    let radius = 0;
    for (const p of pts) {
      const dx = p.x - centroid.x;
      const dy = p.y - centroid.y;
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy));
    }
    hulls.push({
      clusterId,
      points: hull,
      centroid,
      radius,
    });
  }

  return {
    algo,
    clusters: clusterMetrics,
    nodeAssignments,
    clusterEdges: Array.from(clusterEdgeMap.values()),
    hulls,
    generatedAt: Date.now(),
  };
}

async function runClustering(requestId: string, algo: 'louvain' | 'label-propagation') {
  try {
    abortedRequestId = null;
    postProgress(requestId, 'building', 0.05);
    if (state.nodes.size === 0) {
      const empty: ClusteringResult = {
        algo,
        clusters: [],
        nodeAssignments: [],
        clusterEdges: [],
        hulls: [],
        generatedAt: Date.now(),
      };
      const out: ClusterWorkerOut = { type: 'CLUSTERING_RESULT', requestId, result: empty };
      postMessage(out);
      return;
    }

    let assignments: Map<NodeId, ClusterId>;
    if (algo === 'louvain') {
      postProgress(requestId, 'iterating', 0.2);
      assignments = runLouvainLike();
      postProgress(requestId, 'refining', 0.75);
      if (abortedRequestId === requestId) return;
      const clusterCount = new Set(assignments.values()).size;
      if (clusterCount <= 1 || clusterCount > state.nodes.size * 0.75) {
        assignments = runLabelPropagation(12);
      }
    } else {
      postProgress(requestId, 'iterating', 0.35);
      assignments = runLabelPropagation(20);
      postProgress(requestId, 'refining', 0.75);
    }

    if (abortedRequestId === requestId) return;
    const result = buildResult(assignments, algo);
    postProgress(requestId, 'refining', 1);
    const out: ClusterWorkerOut = {
      type: 'CLUSTERING_RESULT',
      requestId,
      result,
    };
    postMessage(out);
  } catch (error) {
    const out: ClusterWorkerOut = {
      type: 'CLUSTERING_ERROR',
      requestId,
      error: error instanceof Error ? error.message : 'Unknown clustering error',
    };
    postMessage(out);
  }
}

function applyDelta(msg: Extract<ClusterWorkerIn, { type: 'APPLY_DELTA' }>) {
  const prevNodes = Math.max(1, state.nodes.size);
  const prevEdges = Math.max(1, state.edges.size);

  for (const id of msg.removedEdgeIds) removeEdge(id);
  for (const id of msg.removedNodeIds) removeNode(id);
  for (const n of msg.addedNodes) addNode(n.id, n.x ?? 0, n.y ?? 0);
  for (const e of msg.addedEdges) {
    addEdge(e.id ?? `${e.source}->${e.target}`, e.source, e.target);
  }

  const nodeDelta =
    (msg.addedNodes.length + msg.removedNodeIds.length) / prevNodes;
  const edgeDelta =
    (msg.addedEdges.length + msg.removedEdgeIds.length) / prevEdges;

  const algo: 'louvain' | 'label-propagation' = nodeDelta > 0.05 || edgeDelta > 0.1 ? 'louvain' : 'label-propagation';
  void runClustering(msg.requestId, algo);
}

self.onmessage = (event: MessageEvent<ClusterWorkerIn>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'INIT_GRAPH':
      initGraph(msg);
      break;
    case 'RUN_CLUSTERING':
      void runClustering(msg.requestId, msg.algo ?? 'louvain');
      break;
    case 'APPLY_DELTA':
      applyDelta(msg);
      break;
    case 'SYNC_POSITIONS':
      for (const p of msg.positions) {
        const node = state.nodes.get(p.id);
        if (node) {
          node.x = p.x;
          node.y = p.y;
        }
      }
      break;
    case 'ABORT':
      abortedRequestId = msg.requestId ?? '__all__';
      break;
    default:
      break;
  }
};
