import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RankingModel = 'vector-similarity' | 'hybrid-ranking' | 'neural-rerank'

interface ModelState {
  selectedModel: RankingModel
  setModel: (model: RankingModel) => void
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      selectedModel: 'vector-similarity',
      setModel: (model) => set({ selectedModel: model }),
    }),
    {
      name: 'contextcache-model-storage',
    }
  )
)
