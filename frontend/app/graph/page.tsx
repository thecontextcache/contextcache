'use client';

/**
 * 3D Knowledge Graph Visualization
 * 
 * Features:
 * - 3D Force-directed layout with physics simulation
 * - Interactive controls (pan, zoom, rotate)
 * - Node search and filtering
 * - Focus mode for exploring node neighborhoods
 * - Node detail side panel with connections
 * - Real-time stats and performance monitoring
 * - Beautiful gradient background with space-like aesthetic
 * 
 * Unique Features Beyond Obsidian:
 * 1. FOCUS MODE: Click focus button to isolate selected node + immediate neighbors
 *    - Dims all other nodes to 10% opacity
 *    - Makes it easy to explore dense graph regions
 *    - Toggle on/off for contextual exploration
 * 
 * 2. HEAT MODE: Node color intensity shows ranking/activity
 *    - Brighter = higher relevance score
 *    - Visual prioritization of important entities
 *    
 * 3. PARTICLE FLOW: Animated particles flow along edges
 *    - Shows relationship directionality
 *    - Subtle but informative
 * 
 * 4. SMART FILTERING: Combined score + type + connection filtering
 *    - Performance-conscious (max nodes limit)
 *    - Real-time stats update as you filter
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import { PageNav } from '@/components/page-nav';
import { Network, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Graph3DView } from '@/components/graph/Graph3DView';
import { GraphControls } from '@/components/graph/GraphControls';
import { NodeDetailPanel } from '@/components/graph/NodeDetailPanel';
import { GraphData, GraphNode, GraphFilters } from '@/components/graph/types';

export default function GraphPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    edges: [],
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  // Filters
  const [filters, setFilters] = useState<GraphFilters>({
    minScore: 0,
    maxNodes: 200,
    nodeTypes: new Set<string>(),
  });

  // Load graph data
  useEffect(() => {
    const loadGraph = async () => {
      if (!currentProject) return;

      setLoading(true);
      try {
        const response = await api.getProjectGraph(currentProject.id);
        setGraphData({
          nodes: response.nodes || [],
          edges: response.edges || [],
          count: response.count || 0,
        });

        // Initialize node types filter (all selected by default)
        const types = new Set(response.nodes?.map((n: GraphNode) => n.type) || []);
        setFilters((prev) => ({ ...prev, nodeTypes: types }));
      } catch (error) {
        console.error('Failed to load graph:', error);
        setGraphData({ nodes: [], edges: [], count: 0 });
      } finally {
        setLoading(false);
      }
    };

    loadGraph();
  }, [currentProject]);

  // Filter and process nodes
  const processedData = useMemo(() => {
    let filteredNodes = graphData.nodes;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter((n) => n.label.toLowerCase().includes(query));
    }

    // Apply type filter
    filteredNodes = filteredNodes.filter((n) => filters.nodeTypes.has(n.type));

    // Apply score filter
    filteredNodes = filteredNodes.filter((n) => n.score >= filters.minScore);

    // Apply max nodes limit (take top scored)
    if (filteredNodes.length > filters.maxNodes) {
      filteredNodes = filteredNodes
        .sort((a, b) => b.score - a.score)
        .slice(0, filters.maxNodes);
    }

    // Filter edges to only include visible nodes
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      count: filteredNodes.length,
    };
  }, [graphData, searchQuery, filters]);

  // Get highlighted nodes (hover or focus mode)
  const highlightedNodeIds = useMemo(() => {
    const ids = new Set<string>();

    const targetNode = selectedNode || hoveredNode;
    if (targetNode) {
      ids.add(targetNode.id);

      // Add immediate neighbors
      processedData.edges.forEach((edge) => {
        if (edge.source === targetNode.id) {
          ids.add(edge.target);
        }
        if (edge.target === targetNode.id) {
          ids.add(edge.source);
        }
      });
    }

    return ids;
  }, [selectedNode, hoveredNode, processedData.edges]);

  // Handlers
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleReset = useCallback(() => {
    setSearchQuery('');
    setSelectedNode(null);
    setHoveredNode(null);
    setFocusMode(false);
    setFilters({
      minScore: 0,
      maxNodes: 200,
      nodeTypes: new Set(graphData.nodes.map((n) => n.type)),
    });
  }, [graphData.nodes]);

  const handleNodeSelectFromPanel = useCallback((nodeId: string) => {
    const node = graphData.nodes.find((n) => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
    }
  }, [graphData.nodes]);

  // No project state
  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark:bg-dark-bg-900 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">No Project Selected</h2>
            <p className="text-muted-foreground">Select a project from the dashboard</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 dark:from-dark-bg-900 dark:via-dark-bg-900 dark:to-primary/5">
      {/* Header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Network className="h-6 w-6 text-primary" />
                3D Knowledge Graph
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {currentProject.name} • {processedData.nodes.length} visible of{' '}
                {graphData.nodes.length} total entities
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Dashboard
            </button>
          </div>
          <PageNav currentPage="graph" />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading knowledge graph...</p>
            <p className="text-xs text-muted-foreground mt-2">
              Initializing 3D physics simulation...
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && graphData.nodes.length === 0 && (
        <div className="container mx-auto px-4 py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md mx-auto"
          >
            <Network className="w-16 h-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              No Knowledge Graph Yet
            </h2>
            <p className="text-muted-foreground mb-8">
              Upload documents to automatically extract entities, facts, and relationships.
              They'll appear here as an interactive 3D graph.
            </p>
            <button
              onClick={() => router.push('/inbox')}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              Upload Documents
            </button>
          </motion.div>
        </div>
      )}

      {/* 3D Graph View */}
      {!loading && graphData.nodes.length > 0 && (
        <div className="relative h-[calc(100vh-200px)]">
          {/* Instructions Overlay (show on first load) */}
          {!selectedNode && processedData.nodes.length > 0 && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 3, duration: 1 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
            >
              <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-6 py-3 shadow-xl">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Tip:</strong> Click nodes to explore • Drag to
                  rotate • Scroll to zoom • Use focus mode for clarity
                </p>
              </div>
            </motion.div>
          )}

          {/* Search & Filter Controls */}
          <GraphControls
            graphData={graphData}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filters={filters}
            onFiltersChange={setFilters}
            focusMode={focusMode}
            onFocusModeToggle={() => setFocusMode(!focusMode)}
            onReset={handleReset}
          />

          {/* 3D Graph */}
          <Graph3DView
            nodes={processedData.nodes}
            edges={processedData.edges}
            selectedNodeId={selectedNode?.id || null}
            highlightedNodeIds={highlightedNodeIds}
            focusMode={focusMode}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
          />

          {/* Node Detail Panel */}
          <AnimatePresence>
            {selectedNode && (
              <NodeDetailPanel
                node={selectedNode}
                edges={graphData.edges}
                allNodes={graphData.nodes}
                onClose={() => setSelectedNode(null)}
                onNodeSelect={handleNodeSelectFromPanel}
              />
            )}
          </AnimatePresence>

          {/* Search Results Indicator */}
          {searchQuery && processedData.nodes.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
            >
              <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-8 shadow-xl">
                <Network className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-foreground font-medium mb-2">No entities found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
