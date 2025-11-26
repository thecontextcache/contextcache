'use client';

import { motion } from 'framer-motion';
import { X, Network, ExternalLink, FileText } from 'lucide-react';
import { GraphNode, GraphEdge } from './types';

interface NodeDetailPanelProps {
  node: GraphNode | null;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onNodeSelect: (nodeId: string) => void;
}

export function NodeDetailPanel({
  node,
  edges,
  allNodes,
  onClose,
  onNodeSelect,
}: NodeDetailPanelProps) {
  if (!node) return null;

  // Get connected nodes
  const connectedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id
  );

  const connections = connectedEdges.map((edge) => {
    const isSource = edge.source === node.id;
    const connectedNodeId = isSource ? edge.target : edge.source;
    const connectedNode = allNodes.find((n) => n.id === connectedNodeId);

    return {
      node: connectedNode,
      relation: edge.label,
      direction: isSource ? 'outgoing' : 'incoming',
      weight: edge.weight,
    };
  });

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', damping: 25 }}
      className="absolute top-0 right-0 h-full w-96 bg-card/95 backdrop-blur-md border-l border-border shadow-2xl overflow-hidden flex flex-col z-20"
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-foreground truncate">{node.label}</h2>
            <p className="text-sm text-muted-foreground capitalize mt-1">{node.type}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Node Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-primary/10 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Relevance</p>
            <p className="text-lg font-bold text-primary">{(node.score * 100).toFixed(0)}%</p>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Connections</p>
            <p className="text-lg font-bold text-blue-500">{connections.length}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Connected Entities */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Connected Entities</h3>
          </div>

          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections found</p>
          ) : (
            <div className="space-y-2">
              {connections.map((connection, idx) => {
                if (!connection.node) return null;

                return (
                  <button
                    key={idx}
                    onClick={() => onNodeSelect(connection.node!.id)}
                    className="w-full text-left p-3 rounded-lg border border-border bg-background hover:border-primary hover:bg-primary/5 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-medium text-foreground text-sm group-hover:text-primary transition-colors line-clamp-1">
                        {connection.node.label}
                      </p>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                    </div>

                    {/* Relation */}
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          connection.direction === 'outgoing'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        }`}
                      >
                        {connection.direction === 'outgoing' ? '→' : '←'} {connection.relation}
                      </span>
                      <span className="text-muted-foreground capitalize">
                        {connection.node.type}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Additional Info */}
        {node.data && Object.keys(node.data).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Additional Data</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(node.data).map(([key, value]) => (
                <div key={key} className="text-sm">
                  <span className="text-muted-foreground capitalize">{key}: </span>
                  <span className="text-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 border-t border-border p-4 bg-muted/30">
        <button
          onClick={onClose}
          className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium text-sm"
        >
          Close
        </button>
      </div>
    </motion.div>
  );
}

