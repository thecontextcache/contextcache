'use client';

import { useEffect, useRef, useState } from 'react';
import cytoscape, { Core, NodeSingular } from 'cytoscape';
// @ts-ignore - no types available
import coseBilkent from 'cytoscape-cose-bilkent';

if (typeof window !== 'undefined') {
  cytoscape.use(coseBilkent);
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  score: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

interface GraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  overlay: 'rank' | 'recency' | 'none';
  onNodeClick: (node: GraphNode) => void;
}

export function GraphViewer({ nodes, edges, overlay, onNodeClick }: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        // Nodes
        ...nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            type: node.type,
            score: node.score,
          },
        })),
        // Edges
        ...edges.map((edge) => ({
          data: {
            id: `${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            weight: edge.weight,
          },
        })),
      ],
      style: [
        // Node styles
        {
          selector: 'node',
          style: {
            'background-color': '#06b6d4',
            'border-width': 3,
            'border-color': '#ffffff',
            label: 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 8,
            'font-size': '12px',
            'font-weight': '600',
            color: '#0f172a',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.8,
            'text-background-padding': '4px',
            'text-background-shape': 'roundrectangle',
            width: 50,
            height: 50,
          },
        },
        // Node hover
        {
          selector: 'node:active',
          style: {
            'overlay-opacity': 0.2,
            'overlay-color': '#06b6d4',
          },
        },
        // Edge styles
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.5,
            opacity: 0.6,
          },
        },
        // Edge hover
        {
          selector: 'edge:active',
          style: {
            'line-color': '#06b6d4',
            'target-arrow-color': '#06b6d4',
            opacity: 1,
            width: 3,
          },
        },
      ],
      layout: {
        name: 'cose-bilkent',
        animate: true,
        animationDuration: 1000,
        nodeRepulsion: 8000,
        idealEdgeLength: 100,
        edgeElasticity: 0.1,
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 2500,
        tile: true,
        randomize: false,
      },
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });

    cyRef.current = cy;

    // Node click handler
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();
      onNodeClick({
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type,
        score: nodeData.score,
      });
    });

    // Node hover handlers
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      setHoveredNode(node.id());
      node.style({
        'background-color': '#3b82f6',
        'border-color': '#06b6d4',
        'border-width': 5,
        width: 60,
        height: 60,
      });
      // Highlight connected edges
      node.connectedEdges().style({
        'line-color': '#06b6d4',
        'target-arrow-color': '#06b6d4',
        width: 3,
        opacity: 1,
      });
    });

    cy.on('mouseout', 'node', (evt) => {
      const node = evt.target;
      setHoveredNode(null);
      
      // Reset node style based on overlay
      const nodeColor = getNodeColor(node, overlay);
      node.style({
        'background-color': nodeColor,
        'border-color': '#ffffff',
        'border-width': 3,
        width: 50,
        height: 50,
      });
      
      // Reset edge styles
      node.connectedEdges().style({
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        width: 2,
        opacity: 0.6,
      });
    });

    return () => {
      cy.destroy();
    };
  }, [nodes, edges, onNodeClick]);

  // Update node colors when overlay changes
  useEffect(() => {
    if (!cyRef.current) return;

    cyRef.current.nodes().forEach((node) => {
      const color = getNodeColor(node, overlay);
      node.style('background-color', color);
    });
  }, [overlay]);

  const getNodeColor = (node: NodeSingular, overlay: string): string => {
    if (overlay === 'none') return '#06b6d4';
    
    if (overlay === 'rank') {
      const score = node.data('score') || 0;
      // Gradient from red (low) to green (high)
      const red = Math.floor((1 - score) * 255);
      const green = Math.floor(score * 255);
      return `rgb(${red}, ${green}, 200)`;
    }
    
    if (overlay === 'recency') {
      // Mock recency colors (would be based on timestamps in real app)
      const types = ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
      const nodeType = node.data('type') || 'default';
      return types[nodeType.length % types.length];
    }
    
    return '#06b6d4';
  };

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.2);
      cyRef.current.center();
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8);
      cyRef.current.center();
    }
  };

  const handleFitView = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 50);
    }
  };

  const handleResetLayout = () => {
    if (cyRef.current) {
      cyRef.current.layout({
        name: 'cose-bilkent',
        animate: true,
        animationDuration: 1000,
        randomize: true,
      }).run();
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />

      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          onClick={handleZoomIn}
          className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-900 transition-all shadow-lg"
          title="Zoom In"
        >
          <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={handleZoomOut}
          className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-900 transition-all shadow-lg"
          title="Zoom Out"
        >
          <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={handleFitView}
          className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-900 transition-all shadow-lg"
          title="Fit View"
        >
          <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          onClick={handleResetLayout}
          className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-900 transition-all shadow-lg"
          title="Reset Layout"
        >
          <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Hovered Node Info */}
      {hoveredNode && (
        <div className="absolute top-4 left-4 p-4 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 shadow-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Click to view details
          </p>
        </div>
      )}
    </div>
  );
}