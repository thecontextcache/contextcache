'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '@/lib/store/project';
import { useRouter } from 'next/navigation';
import { PageNav } from '@/components/page-nav';
import { Network, Search, FileText, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  score: number;
  data?: any;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  count: number;
}

export default function GraphPage() {
  const router = useRouter();
  const { currentProject } = useProjectStore();
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
          count: response.count || 0
        });
      } catch (error) {
        console.error('Failed to load graph:', error);
        setGraphData({ nodes: [], edges: [], count: 0 });
      } finally {
        setLoading(false);
      }
    };

    loadGraph();
  }, [currentProject]);

  // Filter nodes by search
  const filteredNodes = searchQuery
    ? graphData.nodes.filter((n) =>
        n.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : graphData.nodes;

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
    <div className="min-h-screen bg-background dark:bg-dark-bg-900">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Network className="h-6 w-6 text-primary" />
                Knowledge Map
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {currentProject.name} • {graphData.nodes.length} entities, {graphData.edges.length} connections
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
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading knowledge map...</p>
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
              Upload documents to automatically extract entities, facts, and relationships
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

      {/* Graph Content - Simple List View */}
      {!loading && graphData.nodes.length > 0 && (
        <div className="container mx-auto px-4 py-8">
          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entities..."
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Info Card */}
          <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">
              📊 What is this?
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-400">
              This shows entities (people, organizations, concepts) automatically extracted from your documents. 
              Click any entity to see its connections and where it appears in your documents.
            </p>
          </div>

          {/* Entity List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredNodes.map((node, index) => (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate mb-1">
                      {node.label}
                    </h3>
                    <p className="text-xs text-muted-foreground capitalize mb-2">
                      {node.type}
                    </p>
                    {/* Show connections */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {graphData.edges.filter(e => e.source === node.id || e.target === node.id).length} connections
                      </span>
                      {node.score > 0 && (
                        <span className="text-primary font-medium">
                          {(node.score * 100).toFixed(0)}% relevance
                        </span>
                      )}
                    </div>
                  </div>
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </div>
              </motion.div>
            ))}
          </div>

          {/* No Results */}
          {filteredNodes.length === 0 && searchQuery && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No entities found matching "{searchQuery}"</p>
            </div>
          )}

          {/* Stats Summary */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-sm text-muted-foreground mb-1">Total Entities</p>
              <p className="text-2xl font-bold text-foreground">{graphData.nodes.length}</p>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-sm text-muted-foreground mb-1">Relationships</p>
              <p className="text-2xl font-bold text-foreground">{graphData.edges.length}</p>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-sm text-muted-foreground mb-1">Avg Connections</p>
              <p className="text-2xl font-bold text-foreground">
                {graphData.nodes.length > 0 
                  ? (graphData.edges.length / graphData.nodes.length).toFixed(1) 
                  : '0'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
