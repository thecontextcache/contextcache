'use client';

import { useState } from 'react';
import { Search, Filter, BarChart3, X, Focus, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraphData, GraphFilters } from './types';

interface GraphControlsProps {
  graphData: GraphData;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: GraphFilters;
  onFiltersChange: (filters: GraphFilters) => void;
  focusMode: boolean;
  onFocusModeToggle: () => void;
  onReset: () => void;
}

export function GraphControls({
  graphData,
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  focusMode,
  onFocusModeToggle,
  onReset,
}: GraphControlsProps) {
  const [showFilters, setShowFilters] = useState(false);

  // Get unique node types
  const nodeTypes = Array.from(new Set(graphData.nodes.map((n) => n.type)));

  // Calculate stats
  const avgDegree =
    graphData.nodes.length > 0
      ? (graphData.edges.length * 2) / graphData.nodes.length
      : 0;

  return (
    <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Search & Filters */}
          <div className="pointer-events-auto space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search entities..."
                className="w-80 pl-10 pr-10 py-2.5 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  showFilters
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card/95 backdrop-blur-sm border-border hover:border-primary'
                } shadow-lg`}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>

              <button
                onClick={onFocusModeToggle}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  focusMode
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card/95 backdrop-blur-sm border-border hover:border-primary'
                } shadow-lg`}
              >
                <Focus className="w-4 h-4" />
                Focus
              </button>

              <button
                onClick={onReset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card/95 backdrop-blur-sm border-border hover:border-primary text-sm font-medium shadow-lg"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>

            {/* Filter Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-card/95 backdrop-blur-sm border border-border rounded-lg p-4 shadow-xl"
                >
                  <div className="space-y-4">
                    {/* Min Score Slider */}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Min Relevance: {(filters.minScore * 100).toFixed(0)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={filters.minScore}
                        onChange={(e) =>
                          onFiltersChange({
                            ...filters,
                            minScore: parseFloat(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                    </div>

                    {/* Max Nodes Slider */}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Max Nodes: {filters.maxNodes}
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="500"
                        step="50"
                        value={filters.maxNodes}
                        onChange={(e) =>
                          onFiltersChange({
                            ...filters,
                            maxNodes: parseInt(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                    </div>

                    {/* Node Types */}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        Node Types
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {nodeTypes.map((type) => (
                          <button
                            key={type}
                            onClick={() => {
                              const newTypes = new Set(filters.nodeTypes);
                              if (newTypes.has(type)) {
                                newTypes.delete(type);
                              } else {
                                newTypes.add(type);
                              }
                              onFiltersChange({ ...filters, nodeTypes: newTypes });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                              filters.nodeTypes.has(type)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Stats Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="pointer-events-auto bg-card/95 backdrop-blur-sm border border-border rounded-lg p-4 shadow-xl min-w-[200px]"
          >
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Graph Stats</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entities:</span>
                <span className="font-semibold text-foreground">{graphData.nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Relations:</span>
                <span className="font-semibold text-foreground">{graphData.edges.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Degree:</span>
                <span className="font-semibold text-foreground">{avgDegree.toFixed(1)}</span>
              </div>
              {searchQuery && (
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="text-muted-foreground">Matches:</span>
                  <span className="font-semibold text-primary">
                    {
                      graphData.nodes.filter((n) =>
                        n.label.toLowerCase().includes(searchQuery.toLowerCase())
                      ).length
                    }
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

