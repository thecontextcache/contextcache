'use client';

import { useEffect, useState } from 'react';
import { useProjectStore } from '@/lib/store/project';
import api from '@/lib/api';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import UnlockProjectModal from '@/components/unlock-project-modal';
import type { Project } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { projects, setProjects, setCurrentProject, isProjectUnlocked } = useProjectStore();
  const [authChecking, setAuthChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlockModal, setUnlockModal] = useState<{ isOpen: boolean; project: Project | null }>({
    isOpen: false,
    project: null,
  });

  // Auth guard - redirect if not signed in
  useEffect(() => {
    if (isLoaded) {
      setAuthChecking(false);
      if (!isSignedIn) {
        router.push('/');
      }
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    // Don't load projects until auth is checked
    if (authChecking || !isSignedIn) {
      return;
    }
  
    const loadProjects = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load projects directly from backend (single fast call)
        const fetchedProjects = await api.listProjects();
        setProjects(fetchedProjects);
      } catch (err: any) {
        console.error('Failed to load projects:', err);
        setError(err?.response?.data?.detail || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };
  
    loadProjects();
    //  FIX: Remove 'projects' from dependencies to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecking, isSignedIn]); // Only run when auth state changes

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

  // Show loading while checking auth
  if (!isLoaded || authChecking) {
    return (
      <div className="min-h-screen bg-background dark:bg-dark-bg-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-body dark:text-dark-text-muted">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to home if not signed in (will be handled by useEffect, show loading)
  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background dark:bg-dark-bg-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-body dark:text-dark-text-muted">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background dark:bg-dark-bg-900">
        {/* Header Skeleton */}
        <div className="border-b border-gray-200 dark:border-dark-surface-800 bg-surface/50 dark:bg-dark-surface-800/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-3">
                <div className="h-10 w-48 bg-gray-200 dark:bg-dark-surface-800 rounded-lg animate-pulse" />
                <div className="h-4 w-32 bg-gray-200 dark:bg-dark-surface-800 rounded animate-pulse" />
              </div>
              <div className="h-12 w-40 bg-gray-200 dark:bg-dark-surface-800 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>

        {/* Project Grid Skeleton */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-surface dark:bg-dark-surface-800 backdrop-blur-sm border border-gray-200 dark:border-dark-surface-800"
              >
                <div className="space-y-4">
                  <div className="h-7 w-3/4 bg-gray-200 dark:bg-dark-surface-800 rounded animate-pulse" />
                  <div className="space-y-3">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="flex items-center justify-between py-2">
                        <div className="h-4 w-20 bg-gray-200 dark:bg-dark-surface-800 rounded animate-pulse" />
                        <div className="h-4 w-12 bg-gray-200 dark:bg-dark-surface-800 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark:bg-dark-bg-900 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md space-y-6"
        >
          <div className="text-6xl">⚠️</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-headline dark:text-dark-text-primary">Connection Error</h2>
            <p className="text-body dark:text-dark-text-muted">{error}</p>
          </div>
          <button
            onClick={handleRetry}
            className="px-6 py-3 bg-gradient-primary hover:opacity-90 text-white rounded-lg transition-opacity font-medium"
          >
            Try Again
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-dark-bg-900">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-dark-surface-800 bg-surface/50 dark:bg-dark-surface-800/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-headline dark:text-dark-text-primary tracking-tight">
                Projects
              </h1>
              <p className="text-body dark:text-dark-text-muted mt-2">
                {projects.length === 0
                  ? 'Create your first knowledge project'
                  : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
              </p>
            </div>
            <motion.button
              onClick={() => router.push('/dashboard/new')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-6 py-3 bg-gradient-primary text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
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
            <div className="w-24 h-24 mx-auto bg-gradient-primary/10 rounded-3xl flex items-center justify-center">
              <span className="text-5xl">📁</span>
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-headline dark:text-dark-text-primary">
                No projects yet
              </h2>
              <p className="text-body dark:text-dark-text-muted text-lg leading-relaxed max-w-md mx-auto">
                Create your first project to start building your knowledge graph with privacy-first encryption
              </p>
            </div>
            <motion.button
              onClick={() => router.push('/dashboard/new')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-primary text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
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
                <div className="h-full p-6 rounded-2xl bg-surface dark:bg-dark-surface-800 backdrop-blur-sm border border-gray-200 dark:border-dark-surface-800 hover:border-secondary hover:shadow-xl hover:shadow-secondary/10 transition-all duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-headline dark:text-dark-text-primary group-hover:text-secondary transition-colors">
                      {project.name}
                    </h3>
                    {isProjectUnlocked(project.id) ? (
                      <span className="text-success text-xl" title="Unlocked">
                        🔓
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-dark-text-muted text-xl" title="Locked - click to unlock">
                        🔒
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-dark-surface-800">
                      <span className="text-body dark:text-dark-text-muted">Facts</span>
                      <span className="font-semibold text-headline dark:text-dark-text-primary">
                        {project.fact_count?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-dark-surface-800">
                      <span className="text-body dark:text-dark-text-muted">Entities</span>
                      <span className="font-semibold text-headline dark:text-dark-text-primary">
                        {project.entity_count?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-body dark:text-dark-text-muted">Created</span>
                      <span className="text-xs font-medium text-body dark:text-dark-text-muted">
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
                      className="w-5 h-5 text-secondary"
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