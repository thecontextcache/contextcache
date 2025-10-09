'use client';

import { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store/project';
import api from '@/lib/api';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import UnlockProjectModal from '@/components/unlock-project-modal';
import type { Project } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const { projects, setProjects, setCurrentProject, isProjectUnlocked } = useProjectStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlockModal, setUnlockModal] = useState<{ isOpen: boolean; project: Project | null }>({
    isOpen: false,
    project: null,
  });

  useEffect(() => {
    const loadProjectStats = async () => {
      setLoading(true);
      setError(null);
      try {
        // ✅ FIX: Load projects from localStorage (local-first!)
        // Don't call API - we only show projects the user created on this device
        // This ensures data isolation: you only see your own projects
        
        // Projects are already loaded from localStorage via Zustand persist middleware
        // Just need to refresh stats for the ones we have
        
        if (projects.length === 0) {
          // No projects yet, that's fine
          setLoading(false);
          return;
        }
        
        // Fetch fresh stats for each project (only once on mount)
        const projectsWithStats = await Promise.all(
          projects.map(async (project) => {
            try {
              const stats = await api.getProjectStats(project.id);
              return {
                ...project,
                fact_count: stats.chunk_count,
                entity_count: stats.document_count,
              };
            } catch (err) {
              console.error(`Failed to fetch stats for ${project.id}:`, err);
              return project;
            }
          })
        );
        
        setProjects(projectsWithStats);
      } catch (err) {
        console.error('Failed to load project stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load project stats');
      } finally {
        setLoading(false);
      }
    };

    loadProjectStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - projects come from localStorage via Zustand

  const handleRetry = () => {
    window.location.reload();
  };

  const handleProjectClick = (project: Project) => {
    // Check if project is already unlocked (has encryption key in memory)
    if (isProjectUnlocked(project.id)) {
      // Already unlocked, proceed to inbox
      setCurrentProject(project);
      router.push('/inbox');
    } else {
      // Not unlocked, show unlock modal
      setUnlockModal({ isOpen: true, project });
    }
  };

  const handleUnlockSuccess = () => {
    // Project was unlocked successfully, proceed to inbox
    if (unlockModal.project) {
      setCurrentProject(unlockModal.project);
      router.push('/inbox');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full mx-auto"
          />
          <p className="text-slate-600 dark:text-slate-400">Loading your projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md space-y-6"
        >
          <div className="text-6xl">⚠️</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Connection Error</h2>
            <p className="text-slate-600 dark:text-slate-400">{error}</p>
          </div>
          <button
            onClick={handleRetry}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Try Again
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50 to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                Projects
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                {projects.length === 0
                  ? 'Create your first knowledge project'
                  : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
              </p>
            </div>
            <motion.button
              onClick={() => router.push('/dashboard/new')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all"
            >
              + New Project
            </motion.button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {projects.length === 0 ? (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto text-center py-20 space-y-8"
          >
            <div className="w-24 h-24 mx-auto bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-3xl flex items-center justify-center">
              <span className="text-5xl">📁</span>
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                No projects yet
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed max-w-md mx-auto">
                Create your first project to start building your knowledge graph with privacy-first encryption
              </p>
            </div>
            <motion.button
              onClick={() => router.push('/dashboard/new')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all"
            >
              <span className="text-xl">+</span>
              Create Your First Project
            </motion.button>
          </motion.div>
        ) : (
          /* Project Grid */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                onClick={() => handleProjectClick(project)}
                className="group relative cursor-pointer"
              >
                <div className="h-full p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white group-hover:text-cyan-500 transition-colors">
                      {project.name}
                    </h3>
                    {isProjectUnlocked(project.id) ? (
                      <span className="text-green-500 text-xl" title="Unlocked">
                        🔓
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xl" title="Locked - click to unlock">
                        🔒
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                      <span className="text-slate-600 dark:text-slate-400">Facts</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {project.fact_count?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                      <span className="text-slate-600 dark:text-slate-400">Entities</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {project.entity_count?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-600 dark:text-slate-400">Created</span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {new Date(project.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg
                      className="w-5 h-5 text-cyan-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Unlock Modal */}
      {unlockModal.project && (
        <UnlockProjectModal
          project={unlockModal.project}
          isOpen={unlockModal.isOpen}
          onClose={() => setUnlockModal({ isOpen: false, project: null })}
          onUnlock={handleUnlockSuccess}
        />
      )}
    </div>
  );
}