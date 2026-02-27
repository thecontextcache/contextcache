import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

type WorkerNode = SimulationNodeDatum & {
  id: string;
  radius: number;
};

type WorkerEdge = SimulationLinkDatum<WorkerNode> & {
  source: string | WorkerNode;
  target: string | WorkerNode;
};

type InitMessage = {
  type: 'INIT_GRAPH';
  nodes: Array<{ id: string; x: number; y: number; radius: number }>;
  edges: Array<{ source: string; target: string }>;
};

type PauseMessage = { type: 'PAUSE_LAYOUT' };

type ResumeMessage = { type: 'RESUME_LAYOUT' };

type PinMessage = { type: 'PIN_NODE'; id: string; x: number; y: number };

type UnpinMessage = { type: 'UNPIN_NODE'; id: string };

type KickMessage = { type: 'KICK'; alpha?: number };

type WorkerMessage = InitMessage | PauseMessage | ResumeMessage | PinMessage | UnpinMessage | KickMessage;

let sim: Simulation<WorkerNode, WorkerEdge> | null = null;
let nodesById = new Map<string, WorkerNode>();
let sendCounter = 0;
let paused = false;

function emitPositions() {
  if (!sim) return;
  const nodes = sim.nodes();
  // Send every 2 ticks to reduce message overhead while staying smooth.
  sendCounter += 1;
  if (sendCounter % 2 !== 0) return;

  postMessage({
    type: 'POSITIONS',
    nodes: nodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })),
  });
}

function stopSimulation() {
  if (!sim) return;
  sim.stop();
}

function startSimulation() {
  if (!sim) return;
  if (paused) return;
  sim.alpha(Math.max(sim.alpha(), 0.12));
  sim.restart();
}

function initGraph(msg: InitMessage) {
  const nodes: WorkerNode[] = msg.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    vx: 0,
    vy: 0,
    radius: n.radius,
  }));

  nodesById = new Map(nodes.map((n) => [n.id, n]));

  const links: WorkerEdge[] = msg.edges
    .filter((e) => nodesById.has(e.source) && nodesById.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  sim?.stop();
  sim = forceSimulation(nodes)
    .force('charge', forceManyBody<WorkerNode>().strength(-32).theta(0.9).distanceMax(700))
    .force('link', forceLink<WorkerNode, WorkerEdge>(links).id((d) => d.id).distance(95).strength(0.08))
    .force('collide', forceCollide<WorkerNode>().radius((d) => d.radius + 4).strength(0.7))
    .force('center', forceCenter<WorkerNode>(0, 0))
    .alpha(0.9)
    .alphaDecay(0.025)
    .alphaMin(0.02)
    .on('tick', emitPositions)
    .on('end', () => {
      postMessage({ type: 'COOLED' });
    });

  sendCounter = 0;
  if (paused) {
    stopSimulation();
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'INIT_GRAPH':
      initGraph(msg);
      break;

    case 'PAUSE_LAYOUT':
      paused = true;
      stopSimulation();
      break;

    case 'RESUME_LAYOUT':
      paused = false;
      startSimulation();
      break;

    case 'PIN_NODE': {
      if (!sim) break;
      const node = nodesById.get(msg.id);
      if (!node) break;
      node.fx = msg.x;
      node.fy = msg.y;
      if (!paused) {
        sim.alpha(Math.max(sim.alpha(), 0.08)).restart();
      }
      break;
    }

    case 'UNPIN_NODE': {
      if (!sim) break;
      const node = nodesById.get(msg.id);
      if (!node) break;
      node.fx = null;
      node.fy = null;
      if (!paused) {
        sim.alpha(Math.max(sim.alpha(), 0.1)).restart();
      }
      break;
    }

    case 'KICK':
      if (!sim || paused) break;
      sim.alpha(Math.max(sim.alpha(), msg.alpha ?? 0.2)).restart();
      break;

    default:
      break;
  }
};
