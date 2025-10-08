'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import { GraphViewer } from '@/components/graph-viewer';

// Mock graph data
const mockGraphData = {
  nodes: [
    { id: 'marie', label: 'Marie Curie', type: 'person', score: 0.92 },
    { id: 'pierre', label: 'Pierre Curie', type: 'person', score: 0.78 },
    { id: 'radium', label: 'Radium', type: 'element', score: 0.85 },
    { id: 'nobel', label: 'Nobel Prize', type: 'award', score: 0.88 },
    { id: 'physics', label: 'Physics', type: 'field', score: 0.72 },
    { id: 'chemistry', label: 'Chemistry', type: 'field', score: 0.68 },
    { id: 'polonium', label: 'Polonium', type: 'element', score: 0.75 },
    { id: 'radioactivity', label: 'Radioactivity', type: 'concept', score: 0.82 },
  ],
  edges: [
    { source: 'marie', target: 'radium', label: 'discovered', weight: 0.95 },
    { source: 'marie', target: 'polonium', label: 'discovered', weight: 0.92 },
    { source: 'marie', target: 'nobel', label: 'won', weight: 0.98 },
    { source: 'pierre', target: 'marie', label: 'collaborated with', weight: 0.90 },
    { source: 'pierre', target: 'nobel', label: 'won', weight: 0.94 },
    { source: 'radium', target: 'physics', label: 'related to', weight: 0.80 },
    { source: 'radium', target: 'chemistry', label: 'related to', weight: 0.85 },
    { source: 'nobel', target: 'physics', label: 'awarded in', weight: 0.88 },
    { source: 'marie', target: 'radioactivity', label: 'studied', weight: 0.91 },
    { source: 'pierre', target: 'radioactivity', label: 'studied', weight: 0.89 },
    { source: 'radium', target: 'radioactivity', label: 'exhibits', weight: 0.93 },
    { source: 'polonium', target: 'radioactivity', label: 'exhibits', weight: 0.90 },
  ],
};

interface GraphNode {
  id: string;
  label: string;
  type: string;
  score: number;
}

export default function GraphPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [overlay, setOverlay] = useState<'rank' | 'recency' | 'none'>('rank');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
  };

  const filteredNodes = searchQuery
    ? mockGraphData.nodes.filter((n) =>
        n.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : mockGraphData.nodes;

  const filteredEdges = searchQuery
    ? mockGraphData.edges.filter(
        (e) =>
          filteredNodes.find((n) => n.id === e.source) &&
          filteredNodes.find((n) => n.id === e.target)
      )
    : mockGraphData.edges;

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="text-6xl">📁</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              No Project Selected
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Please select or create a project first
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Knowledge Graph
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                {mockGraphData.nodes.length} entities, {mockGraphData.edges.length} relationships
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search nodes..."
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Overlay Controls */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Overlay:
              </span>
              <div className="flex gap-2">
                {[
                  { value: 'none', label: 'None', icon: '⚪' },
                  { value: 'rank', label: 'Rank', icon: '📊' },
                  { value: 'recency', label: 'Type', icon: '🎨' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setOverlay(option.value as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      overlay === option.value
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                        : 'bg-white/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Graph + Details */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Graph Canvas */}
          <div className="lg:col-span-3">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative rounded-2xl overflow-hidden bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 shadow-xl"
              style={{ height: 'calc(100vh - 400px)', minHeight: '600px' }}
            >
              <GraphViewer
                nodes={filteredNodes}
                edges={filteredEdges}
                overlay={overlay}
                onNodeClick={handleNodeClick}
              />
            </motion.div>
          </div>

          {/* Node Details Drawer */}
          <div className="lg:col-span-1">
            <AnimatePresence mode="wait">
              {selectedNode ? (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="sticky top-24 p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Node Details
                    </h3>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Node Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">Name</label>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white mt-1">
                        {selectedNode.label}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">Type</label>
                      <p className="text-slate-700 dark:text-slate-300 mt-1 capitalize">
                        {selectedNode.type}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Rank Score
                      </label>
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {(selectedNode.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${selectedNode.score * 100}%` }}
                            transition={{ duration: 0.5 }}
                            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Connected Nodes */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                      <label className="text-sm text-slate-500 dark:text-slate-400">
                        Connections
                      </label>
                      <div className="mt-2 space-y-2">
                        {mockGraphData.edges
                          .filter(
                            (e) => e.source === selectedNode.id || e.target === selectedNode.id
                          )
                          .slice(0, 5)
                          .map((edge, i) => {
                            const connectedId =
                              edge.source === selectedNode.id ? edge.target : edge.source;
                            const connectedNode = mockGraphData.nodes.find(
                              (n) => n.id === connectedId
                            );
                            return (
                              <div
                                key={i}
                                className="text-sm p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50"
                              >
                                <span className="text-slate-600 dark:text-slate-400">
                                  {edge.label}
                                </span>{' '}
                                <span className="font-medium text-slate-900 dark:text-white">
                                  {connectedNode?.label}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="sticky top-24 p-12 rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-dashed border-slate-300 dark:border-slate-700 text-center"
                >
                  <div className="text-4xl mb-3">🎯</div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Click any node to view details and connections
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            Graph Controls
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 dark:text-slate-400">🖱️ Drag</span>
              <span className="text-slate-500 dark:text-slate-500">Pan canvas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 dark:text-slate-400">🖱️ Click</span>
              <span className="text-slate-500 dark:text-slate-500">Select node</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 dark:text-slate-400">🖱️ Scroll</span>
              <span className="text-slate-500 dark:text-slate-500">Zoom in/out</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 dark:text-slate-400">🖱️ Hover</span>
              <span className="text-slate-500 dark:text-slate-500">Highlight connections</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}