/**
 * Project state management with Zustand (persisted)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '../types';
import api from '../api';

interface ProjectState {
  currentProject: Project | null;
  projects: Project[];
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  loadProjects: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      currentProject: null,
      projects: [],
      
      setCurrentProject: (project) => set({ currentProject: project }),
      
      setProjects: (projects) => set({ projects }),
      
      addProject: (project) => {
        set((state) => ({
          projects: [...state.projects, project],
        }));
      },
      
      removeProject: (projectId) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== projectId),
          currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
        }));
      },
      
      loadProjects: async () => {
        try {
          const projects = await api.listProjects();
          set({ projects });
        } catch (error) {
          console.error('Failed to load projects:', error);
        }
      },
    }),
    {
      name: 'contextcache-project-storage',
    }
  )
);