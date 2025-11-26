export interface GraphNode {
  id: string;
  label: string;
  type: string;
  score: number;
  data?: any;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  count: number;
}

export interface GraphFilters {
  minScore: number;
  maxNodes: number;
  nodeTypes: Set<string>;
}

