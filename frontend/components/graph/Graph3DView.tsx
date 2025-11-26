'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { GraphNode, GraphEdge } from './types';

// Dynamically import ForceGraph3D to avoid SSR issues
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-muted-foreground">Loading 3D Graph...</div>
    </div>
  ),
});

interface Graph3DViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  focusMode: boolean;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  onBackgroundClick: () => void;
}

export function Graph3DView({
  nodes,
  edges,
  selectedNodeId,
  highlightedNodeIds,
  focusMode,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
}: Graph3DViewProps) {
  const fgRef = useRef<any>();
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({
    nodes: [],
    links: [],
  });

  // Transform data for react-force-graph
  useEffect(() => {
    const transformedNodes = nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      score: node.score,
      data: node.data,
      // Color based on type
      color: getNodeColor(node.type),
      // Size based on score (scale: 1-5)
      val: Math.max(1, node.score * 5),
    }));

    const transformedLinks = edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      label: edge.label,
      weight: edge.weight,
    }));

    setGraphData({
      nodes: transformedNodes,
      links: transformedLinks,
    });
  }, [nodes, edges]);

  // Focus on selected node
  useEffect(() => {
    if (selectedNodeId && fgRef.current) {
      const node = graphData.nodes.find((n) => n.id === selectedNodeId);
      if (node) {
        // Animate camera to node
        const distance = 200;
        const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);
        fgRef.current.cameraPosition(
          {
            x: (node.x || 0) * distRatio,
            y: (node.y || 0) * distRatio,
            z: (node.z || 0) * distRatio,
          },
          node, // lookAt
          1000 // ms transition
        );
      }
    }
  }, [selectedNodeId, graphData.nodes]);

  const getNodeOpacity = useCallback(
    (node: any) => {
      // Focus mode: only show selected node and neighbors
      if (focusMode && selectedNodeId) {
        if (node.id === selectedNodeId || highlightedNodeIds.has(node.id)) {
          return 1.0;
        }
        return 0.1;
      }

      // Hover highlight
      if (highlightedNodeIds.size > 0) {
        if (node.id === selectedNodeId || highlightedNodeIds.has(node.id)) {
          return 1.0;
        }
        return 0.3;
      }

      return 1.0;
    },
    [focusMode, selectedNodeId, highlightedNodeIds]
  );

  const getLinkOpacity = useCallback(
    (link: any) => {
      // Focus mode or highlight mode
      if (focusMode && selectedNodeId) {
        if (
          link.source.id === selectedNodeId ||
          link.target.id === selectedNodeId ||
          (highlightedNodeIds.has(link.source.id) && highlightedNodeIds.has(link.target.id))
        ) {
          return 0.8;
        }
        return 0.05;
      }

      if (highlightedNodeIds.size > 0) {
        if (
          highlightedNodeIds.has(link.source.id) ||
          highlightedNodeIds.has(link.target.id)
        ) {
          return 0.8;
        }
        return 0.2;
      }

      return 0.4;
    },
    [focusMode, selectedNodeId, highlightedNodeIds]
  );

  return (
    <div className="w-full h-full relative">
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeLabel={(node: any) =>
          `<div style="background: rgba(0,0,0,0.8); color: white; padding: 8px 12px; border-radius: 6px; font-size: 14px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${node.label}</div>
            <div style="font-size: 12px; opacity: 0.8;">Type: ${node.type}</div>
            <div style="font-size: 12px; opacity: 0.8;">Score: ${(node.score * 100).toFixed(0)}%</div>
            <div style="font-size: 12px; opacity: 0.8;">Connections: ${graphData.links.filter(
              (l: any) => l.source.id === node.id || l.target.id === node.id
            ).length}</div>
          </div>`
        }
        linkLabel={(link: any) =>
          `<div style="background: rgba(0,0,0,0.8); color: white; padding: 6px 10px; border-radius: 4px; font-size: 12px;">
            ${link.label}
          </div>`
        }
        nodeThreeObject={(node: any) => {
          const THREE = require('three');
          const group = new THREE.Group();

          // Sphere for node
          const geometry = new THREE.SphereGeometry(node.val || 2);
          const material = new THREE.MeshLambertMaterial({
            color: node.color,
            transparent: true,
            opacity: getNodeOpacity(node),
          });
          const mesh = new THREE.Mesh(geometry, material);
          group.add(mesh);

          // Highlight selected node
          if (node.id === selectedNodeId) {
            const ringGeometry = new THREE.RingGeometry(node.val * 1.5, node.val * 1.7, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
              color: '#3b82f6',
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.8,
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.lookAt(0, 0, 1);
            group.add(ring);
          }

          return group;
        }}
        linkThreeObject={(link: any) => {
          const THREE = require('three');
          const material = new THREE.LineBasicMaterial({
            color: '#6b7280',
            transparent: true,
            opacity: getLinkOpacity(link),
            linewidth: link.weight || 1,
          });

          // Highlight links connected to selected node
          if (
            selectedNodeId &&
            (link.source.id === selectedNodeId || link.target.id === selectedNodeId)
          ) {
            material.color.setHex(0x3b82f6);
          }

          return null; // Use default link rendering with custom material
        }}
        linkWidth={(link: any) => (link.weight || 1) * 0.5}
        linkOpacity={0.4}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={(link: any) => link.weight * 0.001}
        onNodeClick={(node: any) => onNodeClick(node as GraphNode)}
        onNodeHover={(node: any) => onNodeHover(node as GraphNode | null)}
        onBackgroundClick={onBackgroundClick}
        enableNodeDrag={true}
        enableNavigationControls={true}
        showNavInfo={false}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={4}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={100}
        cooldownTicks={0}
      />

      {/* Gradient Background */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.05) 0%, rgba(0, 0, 0, 0) 70%)',
        }}
      />
    </div>
  );
}

// Helper: Get node color based on type
function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    person: '#10b981', // green
    organization: '#3b82f6', // blue
    concept: '#8b5cf6', // purple
    location: '#f59e0b', // amber
    event: '#ef4444', // red
    technology: '#06b6d4', // cyan
    product: '#ec4899', // pink
    date: '#6b7280', // gray
    quantity: '#84cc16', // lime
  };

  return colors[type.toLowerCase()] || '#6b7280'; // default gray
}

