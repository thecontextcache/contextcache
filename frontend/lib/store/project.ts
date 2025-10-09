/**
 * Project state management with Zustand
 * 
 * Security model:
 * - Project metadata (id, name, salt) → localStorage (persisted)
 * - Encryption keys → memory only (NOT persisted, cleared on page reload)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '../types';
import api from '../api';

interface ProjectState {
  // Persisted (localStorage)
  currentProject: Project | null;
  projects: Project[];
  
  // In-memory only (encryption keys, cleared on reload)
  encryptionKeys: Map<string, CryptoKey>;  // projectId -> CryptoKey
  
  // Actions
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  loadProjects: () => Promise<void>;
  
  // Encryption key management (NOT persisted)
  setEncryptionKey: (projectId: string, key: CryptoKey) => void;
  getEncryptionKey: (projectId: string) => CryptoKey | undefined;
  clearEncryptionKey: (projectId: string) => void;
  clearAllEncryptionKeys: () => void;
  isProjectUnlocked: (projectId: string) => boolean;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      // Persisted state
      currentProject: null,
      projects: [],
      
      // In-memory only (will be undefined after reload)
      encryptionKeys: new Map(),
      
      setCurrentProject: (project) => set({ currentProject: project }),
      
      setProjects: (projects) => set({ projects }),
      
      addProject: (project) => {
        set((state) => ({
          projects: [...state.projects, project],
        }));
      },
      
      removeProject: (projectId) => {
        set((state) => {
          // Clear encryption key
          const newKeys = new Map(state.encryptionKeys);
          newKeys.delete(projectId);
          
          return {
            projects: state.projects.filter((p) => p.id !== projectId),
            currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
            encryptionKeys: newKeys,
          };
        });
      },
      
      loadProjects: async () => {
        try {
          const projects = await api.listProjects();
          set({ projects });
        } catch (error) {
          console.error('Failed to load projects:', error);
        }
      },
      
      // Encryption key management (in-memory only)
      setEncryptionKey: (projectId, key) => {
        set((state) => {
          const newKeys = new Map(state.encryptionKeys);
          newKeys.set(projectId, key);
          return { encryptionKeys: newKeys };
        });
      },
      
      getEncryptionKey: (projectId) => {
        return get().encryptionKeys.get(projectId);
      },
      
      clearEncryptionKey: (projectId) => {
        set((state) => {
          const newKeys = new Map(state.encryptionKeys);
          newKeys.delete(projectId);
          return { encryptionKeys: newKeys };
        });
      },
      
      clearAllEncryptionKeys: () => {
        set({ encryptionKeys: new Map() });
      },
      
      isProjectUnlocked: (projectId) => {
        return get().encryptionKeys.has(projectId);
      },
    }),
    {
      name: 'contextcache-project-storage',
      // Only persist these fields (NOT encryptionKeys!)
      partialize: (state) => ({
        currentProject: state.currentProject,
        projects: state.projects,
      }),
    }
  )
);